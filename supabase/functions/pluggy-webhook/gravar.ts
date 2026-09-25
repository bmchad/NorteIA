/**
 * A traducao Pluggy -> `public.open_finance`, e a escrita.
 *
 * ⛔⛔ **Aqui NADA e padronizado, exceto o sinal de `valor`.** Categoria, banco e tipo entram
 * como a Pluggy escreveu. Casar categoria com `public.categories`, normalizar banco e traduzir
 * `tipo` para o vocabulario do NorteIA sao decisoes de produto que ainda nao foram tomadas --
 * e tomadas aqui, dentro de um mapeamento, ficariam invisiveis.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { contaComBanco, TransacaoPluggy, buscarItem } from './pluggy.ts';

/**
 * ⛔ `service_role`, e e a primeira vez no projeto. Nenhuma outra Edge Function usa -- e
 * `_shared/supabase.ts` registra a postura de que escrever em `transactions` e trabalho do
 * frontend. Nao ha contradicao: aquilo vale para `transactions`, e aqui **nao existe sessao de
 * usuario** no momento do webhook. Quem chama e a Pluggy.
 *
 * ⚠️ Por isso a RLS de `open_finance` nao tem policy de escrita: o unico caminho de gravacao e
 * este, e ele passa por cima dela.
 *
 * ⭐ **`SUPABASE_SERVICE_ROLE_KEY` nao precisa ser configurada, e nem poderia ser.** O Supabase
 * injeta `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_DB_URL` em
 * toda Edge Function automaticamente -- e o prefixo `SUPABASE_` e **reservado**: o painel e a
 * Management API recusam criar um secret com ele. Quem for procurar onde isto foi configurado nao
 * vai achar, porque nao foi.
 * ⚠️ O Supabase esta aposentando `anon`/`service_role` ate o fim de 2026, em favor de
 * `sb_publishable_...`/`sb_secret_...` (variaveis `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS`).
 * As legadas continuam funcionando; quando sairem, e esta funcao que muda.
 */
function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/**
 * ⚠️⚠️ **NAO converte fuso, e isso e deliberado.** A Pluggy manda `date` como ISO date-time, e
 * na pratica quase sempre a meia-noite UTC. Converter para America/Sao_Paulo puxaria essa
 * meia-noite para as 21h do **dia anterior** -- toda transacao cairia um dia para tras.
 * `ciclo.ts:34` ja registra essa armadilha no outro sentido; aqui a leitura correta e tomar a
 * data como a Pluggy escreveu, que e a data que o banco informou.
 *
 * O instante completo continua no `payload`, entao nada se perde.
 */
function partirData(iso: string): { data: string; hora: string | null } {
  const data = iso.slice(0, 10);
  const hora = iso.slice(11, 19);
  // Meia-noite cheia quase nunca e informacao -- e o default de quem so tem a data.
  return { data, hora: !hora || hora === '00:00:00' ? null : hora };
}

/** Mapeia uma transacao da Pluggy para uma linha de `open_finance`. */
async function paraLinha(t: TransacaoPluggy, userId: string, itemId: string) {
  const { conta, banco } = await contaComBanco(t.accountId);
  const { data, hora } = partirData(t.date);
  const cc = t.creditCardMetadata ?? null;

  return {
    user_id: userId,

    // ─── mesmos nomes de public.transactions ───────────────────────────────────────────
    data,
    hora,
    // ⭐ `descriptionRaw` e o texto cru do banco e `description` e a versao limpa -- o mesmo
    // par de dois niveis que o NorteIA ja tem em `nome`/`apelido`.
    // ⚠️ `nome` e NOT NULL. Quando a Pluggy nao manda o cru (acontece), o limpo serve de
    // original: melhor um nome repetido nas duas colunas que uma transacao perdida.
    nome: t.descriptionRaw ?? t.description ?? '(sem descricao)',
    apelido: t.description ?? null,
    // ⛔ A UNICA normalizacao desta funcao. `amount` e sempre positivo na Pluggy e a direcao
    // vive em `type`; aqui a coluna nasce negativa para saida, igual a `transactions`. Sem
    // isso `valor` nao seria a mesma coluna e a travessia deixaria de ser uma copia.
    valor: t.type === 'DEBIT' ? -Math.abs(t.amount) : Math.abs(t.amount),
    banco,
    parcela_atual: cc?.installmentNumber ?? null,
    parcela_total: cc?.totalInstallments ?? null,
    mes_fatura: cc?.billForecastDate ?? null,

    // ─── so da Pluggy, e CRUS ──────────────────────────────────────────────────────────
    pluggy_transaction_id: t.id,
    pluggy_account_id: t.accountId,
    pluggy_item_id: itemId,
    categoria: t.category ?? null,
    // ⚠️ 'BANK' | 'CREDIT' -- mesmo NOME de `transactions.tipo`, DOMINIO diferente. Ver o
    // comentario da coluna na migration 20260924120000.
    tipo: conta.type ?? null,
    conta_nome: conta.name ?? null,
    status: t.status ?? null,
    saldo_apos: t.balance ?? null,
    moeda: t.currencyCode ?? 'BRL',
    codigo_provedor: t.providerCode ?? null,
    parcela_valor_total: cc?.totalAmount ?? null,
    cartao_numero: cc?.cardNumber ?? null,
    fatura_id: cc?.billId ?? null,
    payload: t,
    atualizado_em: new Date().toISOString(),
  };
}

/**
 * De quem e a transacao.
 *
 * ⭐⭐ Os eventos `transactions/*` da Pluggy **nao carregam `clientUserId`** -- so os `item/*`
 * carregam. O dono so existe no mapa que o `item/created` gravou. Item conectado sem
 * `clientUserId` no Connect Token nao tem dono descobrivel, e a transacao dele e inutil.
 */
export async function donoDoItem(itemId: string): Promise<string | null> {
  const { data } = await admin()
    .from('open_finance_itens')
    .select('user_id')
    .eq('pluggy_item_id', itemId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Grava (ou atualiza) o mapa item -> usuario. Chamado nos eventos `item/*`.
 *
 * ⛔⛔ **Um item NUNCA troca de dono, e recusar a troca e o que fecha o pior caso deste
 * arquivo.** O `clientUserId` chega no payload do webhook e esta funcao escreve com
 * `service_role`, por cima da RLS. Sem esta guarda, um `item/created` forjado re-aponta o item
 * de outra pessoa para o atacante -- e a partir dai as transacoes DELA nascem com o `user_id`
 * DELE, que a policy de SELECT entao deixa ele ler. Nao e custo de cota: e exfiltracao.
 *
 * ⭐ E nao ha caso legitimo que isso barre: a Pluggy emite um `itemId` NOVO a cada conexao,
 * entao o mesmo item mudar de dono nao acontece. Reconectar o mesmo banco cria outro item.
 */
export async function gravarItem(itemId: string, clientUserId: string) {
  const donoAtual = await donoDoItem(itemId);
  if (donoAtual && donoAtual !== clientUserId) {
    // ⚠️ Erro, nao `return` silencioso: isto so acontece por defeito da Pluggy ou por
    // payload forjado, e os dois merecem uma linha vermelha no painel.
    throw new Error(`item ${itemId} ja tem outro dono -- troca recusada`);
  }

  let banco: string | null = null;
  let status: string | null = null;
  try {
    const item = await buscarItem(itemId);
    banco = item.connector?.name ?? null;
    status = item.status ?? null;
  } catch {
    // Mesmo raciocinio do `contaComBanco`: o vinculo item->usuario e o que importa aqui, e
    // perde-lo por causa do nome do banco seria trocar o essencial pelo cosmetico.
  }

  const { error } = await admin()
    .from('open_finance_itens')
    .upsert(
      { pluggy_item_id: itemId, user_id: clientUserId, banco, status,
        atualizado_em: new Date().toISOString() },
      { onConflict: 'pluggy_item_id' },
    );
  if (error) throw new Error(`upsert open_finance_itens: ${error.message}`);
}

/**
 * Grava as transacoes de um evento.
 *
 * ⭐ `upsert` com `onConflict`, e nao `insert`: a Pluggy repete o mesmo evento nos retries, e
 * `transactions/updated` reenvia ids que ja existem. Sem isso o primeiro retry duplicaria tudo.
 */
export async function gravarTransacoes(linhas: Awaited<ReturnType<typeof paraLinha>>[]) {
  if (!linhas.length) return;
  const { error } = await admin()
    .from('open_finance')
    .upsert(linhas, { onConflict: 'pluggy_transaction_id' });
  if (error) throw new Error(`upsert open_finance: ${error.message}`);
}

/**
 * ⛔ **O `delete` e ESCOPADO ao item do evento, e isso nao e zelo.** Roda com `service_role`,
 * que passa por cima da RLS: um `.in('pluggy_transaction_id', ids)` solto apaga a linha de
 * QUALQUER usuario cujo id caia na lista. Amarrar ao `pluggy_item_id` faz um
 * `transactions/deleted` forjado so alcancar o que aquele item ja possuia -- e a Pluggy nunca
 * manda id de outro item, entao nada legitimo se perde.
 */
export async function apagarTransacoes(itemId: string, ids: string[]) {
  if (!ids.length) return;
  const { error } = await admin()
    .from('open_finance')
    .delete()
    .eq('pluggy_item_id', itemId)
    .in('pluggy_transaction_id', ids);
  if (error) throw new Error(`delete open_finance: ${error.message}`);
}

export { paraLinha };
