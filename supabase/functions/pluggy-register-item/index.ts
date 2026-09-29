/**
 * Registra um item da Pluggy para o usuario **autenticado**.
 *
 * ⭐⭐ **Existe porque propriedade nao pode vir de payload de webhook.** O `pluggy-webhook` so
 * descobre o dono pelo `clientUserId` que a Pluggy manda em `item/created` -- e item conectado
 * fora do app (demo do painel, Meu Pluggy, widget sem `clientUserId` no Connect Token) chega sem
 * esse campo. O resultado e `item_sem_dono` seguido de `item_orfao`: as transacoes chegam, nao
 * tem a quem pertencer, e nada e gravado. Nao ha conserto retroativo pela Pluggy.
 *
 * Aqui o dono vem de `auth.getUser()` -- um JWT verificado -- e nao de um campo que qualquer um
 * poderia escrever. E a mesma informacao com uma procedencia completamente diferente.
 *
 * ⭐ **E e o UNICO caminho para acrescentar dono a um item que ja tem um.** Desde a migration
 * 20260928120000 o unico e `(user_id, pluggy_item_id)`, entao conta conjunta com dois donos e
 * legitima -- mas o webhook, por nao ser autenticado, so pode reivindicar item SEM dono. Quem
 * chega depois passa por aqui, provando quem e.
 *
 * ⚠️ `verify_jwt` fica no default (true) de proposito, ao contrario do `pluggy-webhook`: esta
 * funcao e chamada pelo browser com sessao, entao o gateway barrar sem token e a primeira
 * barreira, e o `getUser()` abaixo e a segunda.
 */

import { corsHeaders, tratarPreflight } from '../_shared/cors.ts';
import { ok, erro } from '../_shared/resposta.ts';
import { clienteDoUsuario } from '../_shared/supabase.ts';
import { criarLog } from '../_shared/log.ts';
import { buscarItem } from '../pluggy-webhook/pluggy.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** ⚠️ Formato do `itemId` da Pluggy. Barrar aqui evita uma ida a rede por lixo digitado. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    let banco: string | null = null;
    let status: string | null = null;
    try {
      const item = await buscarItem(itemId);
      banco = item.connector?.name ?? null;
      status = item.status ?? null;
      log.etapa('item.ok', { status });

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
    } catch (e) {
      log.falha('item', e);
      return erro(
        'REQUISICAO_INVALIDA',
        'Item não encontrado na Pluggy. Confira o ID e se a conexão pertence a esta aplicação.',
        400,
      );
    }

    // ⛔ `service_role`, e pelo mesmo motivo do `gravar.ts`: `open_finance_itens` tem RLS **so de
    // SELECT**. A autorizacao ja aconteceu -- o `user_id` gravado e o do JWT verificado acima,
    // nunca um valor vindo do corpo da requisicao.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await admin
      .from('open_finance_itens')
      .upsert(
        {
          user_id: user.id,
          pluggy_item_id: itemId,
          banco,
          status,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'user_id,pluggy_item_id' },
      )
      .select('id, pluggy_item_id, banco, status')
      .single();
    if (error) throw new Error(`upsert open_finance_itens: ${error.message}`);

    log.etapa('registrado');
    return ok({ conexao: data });
  } catch (e) {
    log.falha('registrar', e);
    return erro('ERRO_INTERNO', 'Não foi possível registrar a conexão.', 500);
  }
});
