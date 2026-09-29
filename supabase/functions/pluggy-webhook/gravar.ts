/**
 * A traducao Pluggy -> `public.open_finance`, e a escrita.
 *
 * ⛔⛔ **Aqui NADA e padronizado.** Categoria, banco e tipo entram como a Pluggy escreveu. Casar
 * categoria com `public.categories`, normalizar banco e traduzir `tipo` para o vocabulario do
 * NorteIA sao decisoes de produto que ainda nao foram tomadas -- e tomadas aqui, dentro de um
 * mapeamento, ficariam invisiveis.
 *
 * ⭐ **Ate 2026-09-28 esta linha abria uma excecao para o sinal de `valor`, e a excecao estava
 * errada nos dois sentidos:** a gente calculava o sinal a partir de `type`, e nao precisava --
 * `amount` ja vem assinado. Hoje nao ha excecao de VALOR nenhuma.
 *
 * ⚠️ O que sobra de traducao e de FORMA, e e uma so: o `date` date-time partido em `data` + `hora`,
 * no fuso de Sao Paulo. Ver `partirData`.
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
 * ⚠️ `hourCycle: 'h23'` e obrigatorio: com `hour12: false` o ICU devolve **`24`** para meia-noite
 * em varias versoes, e `24:00:00` nao e `time` valido no Postgres.
 */
const RELOGIO = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Parte o `date` da Pluggy em `data` + `hora`, **no fuso de Sao Paulo**.
 *
 * ⛔⛔ **Este comentario dizia o contrario, e estava errado.** Afirmava que a Pluggy manda
 * meia-noite UTC e que converter puxaria tudo para o dia anterior. Medido em 2026-09-28, nas 33
 * linhas do sandbox:
 *
 *   32 linhas   `T03:00:00.000Z`   = meia-noite EM SAO PAULO, nao em UTC
 *    1 linha    `T01:47:41.315Z`   = 2026-09-24 22:47:41 em Sao Paulo
 *
 * ⭐ As 32 provam que a Pluggy codifica **horario de Sao Paulo**: `03:00Z` e a meia-noite local de
 * quem so tem a data. Fatiar o UTC gravava `hora = 03:00:00` em toda transacao -- um horario que
 * nenhuma delas teve.
 *
 * ⚠️ **A 33a e a que decide, porque ela troca de DIA.** Fatiando o UTC cai em `2026-09-25`;
 * convertida, em `2026-09-24 22:47`. Como as outras 32 mostram que o campo e local, esta tambem e
 * -- e um extrato brasileiro lista esse boleto em **24/09**. Converter e a unica regra
 * internamente consistente com os dois formatos que a Pluggy usa no mesmo campo.
 *
 * ⚠️ O Brasil nao tem mais horario de verao (extinto em 2019), mas o `Intl` resolve o offset pelo
 * IANA em vez de assumir `-03:00` fixo -- entao data anterior a extincao tambem sai certa.
 *
 * O instante completo continua no `payload`, entao nada se perde.
 */
function partirData(iso: string): { data: string; hora: string | null } {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) {
    // `data` e NOT NULL -- sem data nao ha linha. Falha alta: o evento reentra pelo retry.
    throw new Error(`date invalido da Pluggy: ${JSON.stringify(iso)}`);
  }

  const p: Record<string, string> = {};
  for (const parte of RELOGIO.formatToParts(quando)) {
    if (parte.type !== 'literal') p[parte.type] = parte.value;
  }

  const hora = `${p.hour}:${p.minute}:${p.second}`;
  // Meia-noite cheia quase nunca e informacao -- e o default de quem so tem a data.
  return { data: `${p.year}-${p.month}-${p.day}`, hora: hora === '00:00:00' ? null : hora };
}

/** O `nome`, calculado num lugar so, porque `apelido` precisa compara-lo. */
function nomeDe(t: TransacaoPluggy): string {
  return t.descriptionRaw ?? t.description ?? '(sem descricao)';
}

/**
 * Campos que identificam PESSOA, e que por isso nao entram no `payload`.
 *
 * ⭐⭐ **O criterio e valor analitico, nao fidelidade.** Medido em 2026-09-28: 100 de 100
 * transferencias do sandbox trazem `paymentData` com CPF do pagador, CPF do recebedor, agencia e
 * conta. Nenhum desses campos alimenta analise nenhuma do NorteIA -- guardar so cria passivo.
 *
 * ⭐ **O que FICA e o banco**, e a distincao e exata: `routingNumber` e `routingNumberISPB`
 * identificam a INSTITUICAO, nao a pessoa. `paymentMethod`, `name`, `reason` e
 * `authenticationCode` tambem ficam -- os tres primeiros dizem o que a transacao foi, o ultimo
 * e o identificador do Pix, que e da transacao e nao de quem a fez.
 *
 * ⚠️ **Por NOME de campo e recursivo, de proposito.** `paymentData.boletoMetadata` existe no
 * tipo e vem `null` no sandbox, mas carregaria os mesmos campos -- e a Pluggy acrescenta
 * estrutura sem avisar. Varrer por nome em qualquer profundidade cobre o que ainda nao existe;
 * uma lista de caminhos fixos cobriria so o que eu vi hoje.
 */
const CAMPOS_DE_IDENTIDADE = new Set(['documentNumber', 'accountNumber', 'branchNumber']);

/**
 * Devolve uma copia sem os campos de identidade, em qualquer profundidade.
 *
 * ⚠️ Roda na GRAVACAO, nunca na leitura. Filtrar ao ler deixaria o dado no banco, no backup,
 * no `pg_dump` e na replica -- e o problema e o dado existir, nao ele aparecer.
 */
function semIdentidade(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(semIdentidade);
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CAMPOS_DE_IDENTIDADE.has(chave)) continue;
      saida[chave] = semIdentidade(v);
    }
    return saida;
  }
  return valor;
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
    // ⚠️ `nome` e NOT NULL. Quando a Pluggy nao manda o cru (acontece, e e o caso comum), o limpo
    // serve de original: melhor um nome repetido que uma transacao perdida.
    nome: nomeDe(t),
    // ⭐ `apelido` e OVERRIDE, entao fica `null` quando nao ha versao limpa DISTINTA -- nao e uma
    // segunda copia do `nome`. Medido: `descriptionRaw` vem null em 32 das 33 linhas do sandbox, e
    // na 33a e igual ao `description`. Sem esta comparacao as 33 nasceriam com as duas colunas
    // repetidas, fingindo que alguem apelidou a transacao.
    apelido: t.description && t.description !== nomeDe(t) ? t.description : null,
    // ⛔⛔ **`amount` JA VEM ASSINADO. Repassar e o certo, e derivar o sinal de `type` era um bug
    // que invertia linha.** Medido em 2026-09-28, nas duas contas do sandbox:
    //
    //   cartao de credito   `type=CREDIT`   amount NEGATIVO   12/12 linhas (compras)
    //   conta corrente      `type=CREDIT`   amount POSITIVO    4/21 linhas (salario, +8500)
    //   conta corrente      `type=DEBIT`    amount negativo   17/21 linhas
    //
    // ⭐ `type=CREDIT` significa coisas OPOSTAS nas duas: no cartao e compra (voce passa a dever),
    // na corrente e entrada. Entao `type` nao carrega direcao, e a formula antiga
    // (`type === 'DEBIT' ? -abs : abs`) jogava as 12 do cartao para positivo.
    //
    // ⚠️ **E acertava na conta corrente, o que tornava o defeito insidioso:** quem testasse so com
    // conta corrente veria numero certo e concluiria que estava tudo bem.
    //
    // A prova de que o sinal de `amount` e autoritativo: a soma dos 12 `amount` do cartao da
    // exatamente `-670,80`, que e o `balance` da conta. E ja e a convencao de `transactions` --
    // negativo e saida (`src/pages/Dashboard.tsx:199`, `src/pages/Historico.tsx:438`).
    valor: t.amount,
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
    // ⭐ Sem os campos de identidade. Ver `semIdentidade` acima.
    payload: semIdentidade(t),
    atualizado_em: new Date().toISOString(),
  };
}

/**
 * De quem sao as transacoes deste item. **Plural, e o plural e o ponto.**
 *
 * ⭐⭐ Os eventos `transactions/*` da Pluggy **nao carregam `clientUserId`** -- so os `item/*`
 * carregam. O dono so existe no mapa local. Item sem `clientUserId` e sem passagem pelo
 * `pluggy-register-item` nao tem dono descobrivel, e a transacao dele e inutil.
 *
 * ⚠️ **Era `donoDoItem`, com `.maybeSingle()`, e isso quebraria agora.** Desde a migration
 * 20260928120000 o unico e `(user_id, pluggy_item_id)`, entao o mesmo item pode ter varios donos
 * -- o caso da conta conjunta. Com duas linhas `.maybeSingle()` lanca; e escolher "o" dono
 * arbitrariamente seria pior: daria a transacao a um e a esconderia do outro.
 */
export async function donosDoItem(itemId: string): Promise<string[]> {
  const { data, error } = await admin()
    .from('open_finance_itens')
    .select('user_id')
    .eq('pluggy_item_id', itemId);
  if (error) throw new Error(`select open_finance_itens: ${error.message}`);
  return (data ?? []).map((l) => l.user_id as string);
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
  const donos = await donosDoItem(itemId);
  if (donos.length && !donos.includes(clientUserId)) {
    // ⚠️ Erro, nao `return` silencioso: isto so acontece por defeito da Pluggy ou por
    // payload forjado, e os dois merecem uma linha vermelha no painel.
    throw new Error(`item ${itemId} ja tem dono -- webhook nao acrescenta um segundo`);
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
      { onConflict: 'user_id,pluggy_item_id' },
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
    .upsert(linhas, { onConflict: 'user_id,pluggy_transaction_id' });
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
