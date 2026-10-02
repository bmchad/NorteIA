/**
 * Registra um item da Pluggy para o usuario **autenticado** -- e sincroniza o item inteiro.
 *
 * ⭐⭐ **Existe porque propriedade nao pode vir de payload de webhook.** O `pluggy-webhook` so
 * descobre o dono pelo `clientUserId` que a Pluggy guardou no Connect Token -- e item conectado
 * fora do app (demo do painel, Meu Pluggy, widget sem `clientUserId` no Connect Token) nao tem
 * esse campo. O resultado era `item_orfao`: as transacoes chegavam, nao tinham a quem pertencer,
 * e nada era gravado.
 *
 * Aqui o dono vem de `auth.getUser()` -- um JWT verificado -- e nao de um campo que qualquer um
 * poderia escrever. E a mesma informacao com uma procedencia completamente diferente.
 *
 * ⭐ **E e o UNICO caminho para acrescentar dono a um item que ja tem um.** Desde a migration
 * 20260928120000 o unico e `(user_id, pluggy_item_id)`, entao conta conjunta com dois donos e
 * legitima -- mas o webhook, por nao ser autenticado, so pode reivindicar item SEM dono. Quem
 * chega depois passa por aqui, provando quem e.
 *
 * ⭐⭐ **Desde 2026-10-02, registrar tambem SINCRONIZA, e e isso que conserta o item orfao.** Os
 * eventos que chegaram antes do registro foram descartados, e a Pluggy nao os reenvia. Sem a
 * sincronizacao aqui, um item registrado tarde ficava so com o que mudasse dali em diante -- foi
 * assim que o item de teste ficou com 100 de 302 transacoes. Chamar de novo e o REPARO MANUAL.
 *
 * ⚠️⚠️ **E isso muda o que reivindicar um item entrega.** Antes: so os eventos futuros. Agora: o
 * HISTORICO INTEIRO de transacoes, mais investimentos e emprestimos, na hora. A barreira contra
 * reivindicar o item de outra pessoa continua a mesma (o `clientUserId` divergente e recusado
 * abaixo), e o risco residual -- um item orfao de outra pessoa cujo id alguem conheca -- continua
 * baixo: o id e um UUID que so o dono ve, e o cadastro da instancia e fechado. Mas o premio de
 * acertar ficou maior, e quem abrir o cadastro precisa reavaliar isto.
 *
 * ⚠️ **Sincrono, de proposito, por enquanto.** Nenhuma tela chama esta funcao ainda; quem chama e
 * gente, conferindo o resumo. Quando houver tela, ela passa a `waitUntil` + 202, como o webhook.
 *
 * ⚠️ `verify_jwt` fica no default (true) de proposito, ao contrario do `pluggy-webhook`: esta
 * funcao e chamada pelo browser com sessao, entao o gateway barrar sem token e a primeira
 * barreira, e o `getUser()` abaixo e a segunda.
 */

import { tratarPreflight } from '../_shared/cors.ts';
import { ok, erro } from '../_shared/resposta.ts';
import { clienteDoUsuario } from '../_shared/supabase.ts';
import { criarLog } from '../_shared/log.ts';
import { buscarItem, type ItemPluggy } from '../pluggy-webhook/pluggy.ts';
import { admin, donosDoItem } from '../pluggy-webhook/gravar.ts';
import { sincronizarItem, type ResumoSincronizacao } from '../pluggy-webhook/sincronizar.ts';
import { VERSAO } from '../pluggy-webhook/versao.ts';

/** ⚠️ Formato do `itemId` da Pluggy. Barrar aqui evita uma ida a rede por lixo digitado. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Intervalo minimo entre duas sincronizacoes pedidas por aqui. Clique duplo, ou um laco num
 * script, nao viram N cargas completas seguidas contra a cota da Pluggy.
 * ⚠️ So vale para ESTA porta. O webhook sincroniza todo `item/*`, sempre.
 */
const INTERVALO_MINIMO_MS = 5 * 60 * 1000;

/**
 * ⛔ Abaixo dos 150 s que a requisicao pode durar, com folga: o orcamento e conferido ANTES de
 * cada pagina, entao a ultima pode passar dele pelo tempo de uma busca e uma gravacao.
 */
const ORCAMENTO_MS = 100_000;

Deno.serve(async (req) => {
  const preflight = tratarPreflight(req);
  if (preflight) return preflight;

  const log = criarLog('pluggy-register-item');

  if (req.method !== 'POST') {
    return erro('REQUISICAO_INVALIDA', 'Use POST.', 405);
  }

  try {
    const supabase = clienteDoUsuario(req);
    const { data: { user }, error: erroAuth } = await supabase.auth.getUser();
    if (erroAuth || !user) {
      log.falha('auth', erroAuth ?? 'sem usuário');
      return erro('NAO_AUTENTICADO', 'Sessão inválida ou expirada. Entre novamente.', 401);
    }
    log.etapa('auth.ok');

    const corpo = await req.json().catch(() => ({})) as { pluggyItemId?: string };
    const itemId = corpo.pluggyItemId?.trim() ?? '';
    if (!UUID.test(itemId)) {
      return erro('REQUISICAO_INVALIDA', 'Informe o pluggyItemId (UUID) da conexão.', 400);
    }

    // ⭐ Conferir na Pluggy ANTES de gravar. Sem isto, um id digitado errado viraria uma linha
    // de mapeamento que nunca casa com evento nenhum -- e o sintoma apareceria semanas depois,
    // como "conectei e nada chega", sem nada no log apontando para a causa.
    let item: ItemPluggy;
    try {
      item = await buscarItem(itemId);
      log.etapa('item.ok', { status: item.status ?? null });
    } catch (e) {
      log.falha('item', e);
      return erro(
        'REQUISICAO_INVALIDA',
        'Item não encontrado na Pluggy. Confira o ID e se a conexão pertence a esta aplicação.',
        400,
      );
    }

    // ⛔⛔ **Sem esta checagem, QUALQUER usuario autenticado reivindica QUALQUER item cujo id
    // conheca** -- e passa a receber copia das transacoes de outra pessoa, porque desde a
    // migration 20260928120000 acrescentar dono e legitimo. O `zz_repo_maduro` tem o mesmo furo:
    // ele faz o upsert com o id que vier no corpo, sem perguntar de quem e.
    //
    // ⭐ A resposta estava no proprio item: a Pluggy guarda o `clientUserId` que foi passado no
    // Connect Token. Se ele existe e nao e quem esta chamando, a conexao e de outra conta.
    //
    // ⚠️ **Ausente e PERMITIDO, e e o caso que justifica esta funcao existir.** Item conectado
    // pelo painel da Pluggy ou pelo Meu Pluggy nasce sem `clientUserId` -- e orfao, nao alheio.
    // Recusar aqui deixaria esses itens permanentemente inalcancaveis, que e exatamente o
    // `item_orfao` que esta funcao veio resolver.
    const donoNaPluggy = item.clientUserId ?? null;
    if (donoNaPluggy && donoNaPluggy !== user.id) {
      log.falha('dono_divergente', 'item tem outro clientUserId na Pluggy');
      return erro('REQUISICAO_INVALIDA', 'Esta conexão pertence a outra conta.', 403);
    }

    // ⛔ `service_role`, e pelo mesmo motivo do `gravar.ts`: `open_finance_itens` tem RLS **so de
    // SELECT**. A autorizacao ja aconteceu -- o `user_id` gravado e o do JWT verificado acima,
    // nunca um valor vindo do corpo da requisicao.
    const { data, error } = await admin()
      .from('open_finance_itens')
      .upsert(
        {
          user_id: user.id,
          pluggy_item_id: itemId,
          banco: item.connector?.name ?? null,
          status: item.status ?? null,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'user_id,pluggy_item_id' },
      )
      .select('id, pluggy_item_id, banco, status, sincronizado_em')
      .single();
    if (error) throw new Error(`upsert open_finance_itens: ${error.message}`);
    log.etapa('registrado');

    // ⭐ Reaproveita o `item` ja buscado: o status que decide aqui e o mesmo que autorizou o registro.
    let sincronizacao: ResumoSincronizacao | 'em_andamento' | 'recente' | 'falhou';
    const ultima = data.sincronizado_em ? Date.parse(data.sincronizado_em) : NaN;

    if (item.status === 'UPDATING') {
      // A Pluggy ainda esta coletando; o `item/updated` do fim da coleta sincroniza pelo webhook.
      sincronizacao = 'em_andamento';
    } else if (Date.now() - ultima < INTERVALO_MINIMO_MS) {
      sincronizacao = 'recente';
    } else {
      try {
        const donos = await donosDoItem(itemId);
        sincronizacao = await sincronizarItem(itemId, item, donos, log, { orcamentoMs: ORCAMENTO_MS });
      } catch (e) {
        // ⚠️ O registro ja foi gravado e vale. A sincronizacao isola cada etapa, entao chegar aqui
        // e defeito de programa -- o log diz qual, e chamar de novo repete sem risco.
        log.falha('sincronizar', e);
        sincronizacao = 'falhou';
      }
    }

    log.etapa('fim', { sincronizacao: typeof sincronizacao === 'string' ? sincronizacao : 'resumo' });
    return ok({ conexao: data, sincronizacao, versao: VERSAO });
  } catch (e) {
    log.falha('registrar', e);
    return erro('ERRO_INTERNO', 'Não foi possível registrar a conexão.', 500);
  }
});
