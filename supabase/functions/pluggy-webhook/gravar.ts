/**
 * A traducao Pluggy -> `public.open_finance`, e a escrita.
 *
 * ⛔⛔ **Aqui NADA e padronizado.** Categoria, banco e tipo entram como a Pluggy escreveu. Casar
 * categoria com `public.categories`, normalizar banco e traduzir `tipo` para o vocabulario do
 * NorteIA sao decisoes de produto que ainda nao foram tomadas -- e tomadas aqui, dentro de um
 * mapeamento, ficariam invisiveis.
 *
 * ⭐ **Nem o sinal de `valor` e traduzido.** Ate 2026-09-28 havia uma excecao que derivava o sinal
 * de `type`, e ela invertia linha. Hoje `valor` e o `amount` cru -- e, desde 2026-10-02, nenhum
 * comentario daqui afirma qual convencao a Pluggy usa no cartao. Ver o comentario de `valor`.
 *
 * ⚠️ O que sobra de traducao e de FORMA, e e uma so: o `date` date-time partido em `data` + `hora`.
 * Ver `partirData`.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ContaComBanco, ItemPluggy, TransacaoPluggy } from './pluggy.ts';
import type { Log } from '../_shared/log.ts';

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
let cliente: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  cliente ??= createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  return cliente;
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

/** Meia-noite UTC cravada, ate o milissegundo. Ver o terceiro caso em `partirData`. */
const MEIA_NOITE_UTC = /T00:00:00(\.0+)?Z$/;

/**
 * Parte um date-time da Pluggy em `data` + `hora`, **no fuso de Sao Paulo**.
 *
 * ⛔⛔ **Este comentario ja disse o contrario, e estava errado.** Afirmava que a Pluggy manda
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
 * -- e um extrato brasileiro lista esse boleto em **24/09**.
 *
 * ⛔ **O terceiro caso, medido em 2026-10-02: meia-noite UTC cravada (`T00:00:00.000Z`) e DATA SEM
 * HORA escrita em UTC, e nao pode ser convertida.** Investimentos e emprestimos usam essa forma --
 * 400 de 500 movimentacoes e 5 de 5 `contractDate` do sandbox. Convertida, ela vira 21h do DIA
 * ANTERIOR em Sao Paulo, e todo contrato e toda aplicacao andariam um dia para tras. A data
 * pretendida e a do proprio UTC.
 * ⭐ Nas 302 transacoes medidas nenhuma usa essa forma (sao instante real ou `T03:00Z`), entao a
 * regra nao muda nada do que ja estava gravado. E um instante real cair exatamente em
 * `00:00:00.000` UTC e improvavel ao ponto de ser descartavel.
 *
 * ⚠️ O Brasil nao tem mais horario de verao (extinto em 2019), mas o `Intl` resolve o offset pelo
 * IANA em vez de assumir `-03:00` fixo -- entao data anterior a extincao tambem sai certa.
 */
function partirData(iso: string): { data: string; hora: string | null } {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) {
    // `data` e NOT NULL em `open_finance` -- sem data nao ha linha. Falha alta.
    throw new Error(`date invalido da Pluggy: ${JSON.stringify(iso)}`);
  }

  if (MEIA_NOITE_UTC.test(iso)) {
    return { data: quando.toISOString().slice(0, 10), hora: null };
  }

  const p: Record<string, string> = {};
  for (const parte of RELOGIO.formatToParts(quando)) {
    if (parte.type !== 'literal') p[parte.type] = parte.value;
  }

  const hora = `${p.hour}:${p.minute}:${p.second}`;
  // Meia-noite cheia quase nunca e informacao -- e o default de quem so tem a data.
  return { data: `${p.year}-${p.month}-${p.day}`, hora: hora === '00:00:00' ? null : hora };
}

/**
 * A metade DATA de `partirData`, para as colunas `date` das tabelas de produto. Ausente vira
 * `null`; invalido lanca, pelo mesmo motivo de la.
 */
export function dataLocal(iso: string | null | undefined): string | null {
  if (iso == null || iso === '') return null;
  return partirData(iso).data;
}

/** O `nome`, calculado num lugar so, porque `apelido` precisa compara-lo. */
function nomeDe(t: TransacaoPluggy): string {
  return t.descriptionRaw ?? t.description ?? '(sem descricao)';
}

/**
 * Campos que identificam PESSOA, e que por isso nao entram em `jsonb` nenhum.
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
 * ⚠️ `contractNumber`, `ipocCode` e `cnpjConsignee` sao do emprestimo: o numero do contrato e o
 * codigo IPOC identificam o contrato de UMA pessoa no banco, e o CNPJ consignante e o empregador.
 * Nao viram coluna (`produtos.ts`), e entram aqui para que nenhum `jsonb` aninhado os carregue.
 *
 * ⚠️ **Por NOME de campo e recursivo, de proposito.** `paymentData.boletoMetadata` existe no
 * tipo e vem `null` no sandbox, mas carregaria os mesmos campos -- e a Pluggy acrescenta
 * estrutura sem avisar. Varrer por nome em qualquer profundidade cobre o que ainda nao existe;
 * uma lista de caminhos fixos cobriria so o que eu vi hoje.
 */
const CAMPOS_DE_IDENTIDADE = new Set([
  'documentNumber', 'accountNumber', 'branchNumber',
  'contractNumber', 'ipocCode', 'cnpjConsignee',
]);

/**
 * Devolve uma copia sem os campos de identidade, em qualquer profundidade.
 *
 * ⚠️ Roda na GRAVACAO, nunca na leitura. Filtrar ao ler deixaria o dado no banco, no backup,
 * no `pg_dump` e na replica -- e o problema e o dado existir, nao ele aparecer.
 */
export function semIdentidade(valor: unknown): unknown {
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

/**
 * Mapeia uma transacao da Pluggy para uma linha de `open_finance`.
 *
 * ⭐ **Pura: nao faz rede.** A conta e o banco chegam prontos. A sincronizacao completa os monta de
 * `listarContas` + o item que ja buscou; os eventos `transactions/*`, de `contaComBanco`. Quando
 * isto buscava sozinho, 100 transacoes disparavam 100 buscas da mesma conta.
 */
export function paraLinha(
  t: TransacaoPluggy,
  { conta, banco }: ContaComBanco,
  userId: string,
  itemId: string,
) {
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
    // ⚠️⚠️ **`amount` CRU, e o sinal no cartao NAO esta decidido.** Este comentario ja afirmou que
    // `amount` vem com saida negativa, a partir de 12 linhas de cartao do sandbox. Em 2026-10-02,
    // com 102 linhas de cartao, o quadro ficou indecidivel:
    //
    //   documentacao da Pluggy   "For credit cards, it will be positive (debit) when its an expense"
    //   leitura do projeto       compra negativa, pagamento de fatura positivo
    //   sandbox                  as linhas de teste do cartao se chamam todas "pgto" -- nao separam
    //                            compra de pagamento, entao nao decidem nada
    //
    // ⭐ O que continua medido: `type` NAO carrega direcao -- `type=CREDIT` e compra no cartao e
    // entrada na conta corrente --, entao derivar o sinal dele continua errado, e era o bug antigo.
    // Repassar cru e a unica escolha que nao aposta.
    //
    // ⛔ Antes de qualquer travessia para `transactions` (invariante 4: negativo e saida), medir num
    // CARTAO REAL uma compra conhecida e um pagamento de fatura. So entao decidir se `valor` muda.
    // Ver P52 em `context/20-pendencias-e-dividas.md` e D-081 em `context/30-decisoes-e-licoes.md`.
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
    // ⭐ O que separa corrente de poupanca, que `tipo` junta sob 'BANK'.
    subtipo: conta.subtype ?? null,
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
    // ⭐ A versao da Pluggy. E o que o trigger `open_finance_nao_regride` compara.
    pluggy_atualizado_em: t.updatedAt ?? null,
    atualizado_em: new Date().toISOString(),
  };
}

/** Copia cada linha para cada dono. ⭐ O plural e a conta conjunta -- ver `donosDoItem`. */
export function porDono<L extends object>(base: L[], donos: string[]): (L & { user_id: string })[] {
  return donos.flatMap((dono) => base.map((l) => ({ ...l, user_id: dono })));
}

/**
 * ⭐ Os codigos de "o banco nao tem o que o codigo espera": coluna desconhecida pelo PostgREST
 * (PGRST204), tabela desconhecida (PGRST205), e os equivalentes do Postgres (42P01, 42703).
 *
 * ⛔⛔ **Num fork, isto e o diagnostico inteiro (P44).** Quem faz pull da `main` recebe o codigo
 * novo e nao recebe a migration. Sem esta linha, o sintoma e "upsert open_finance: Could not find
 * the 'subtipo' column" no meio de um log de webhook -- correto, e inutil para quem nao sabe que
 * existe `db push`.
 */
const CODIGOS_DE_SCHEMA = new Set(['PGRST204', 'PGRST205', '42P01', '42703']);

/** Classifica um erro de escrita: loga o caso de schema com a dica, e devolve o erro para lancar. */
export function erroDeEscrita(
  operacao: string,
  tabela: string,
  error: { code?: string; message: string },
  log: Log,
): Error {
  if (error.code && CODIGOS_DE_SCHEMA.has(error.code)) {
    log.etapa('schema_desatualizado', {
      tabela,
      codigo: error.code,
      dica: 'o banco nao tem a migration que este codigo espera -- rode `npx supabase db push`',
    });
  }
  return new Error(`${operacao} ${tabela}: ${error.code ?? '?'} ${error.message}`);
}

/** Linhas por `upsert`. Um corpo de 500 linhas de transacao com `payload` fica bem abaixo de 1 MB. */
const LOTE = 500;

/**
 * Grava (ou atualiza) linhas em lotes, pela chave de conflito.
 *
 * ⭐ `upsert` com `onConflict`, e nao `insert`: a Pluggy repete o mesmo evento nos retries, e a
 * sincronizacao completa reescreve o que ja existe. Sem isso a segunda passagem duplicaria tudo.
 *
 * ⛔ **Deduplica pela chave antes de mandar, com a ULTIMA ocorrencia vencendo.** Duas linhas com a
 * mesma chave no mesmo comando derrubam o lote inteiro com `ON CONFLICT DO UPDATE command cannot
 * affect row a second time` -- e lista da Pluggy repetir id entre paginas e possivel.
 *
 * ⭐ **Ordena pela chave**, para que duas sincronizacoes simultaneas do mesmo item travem as linhas
 * na mesma ordem. Em ordens diferentes, elas podem se esperar mutuamente (deadlock), e o Postgres
 * mata uma das duas.
 *
 * Devolve quantas linhas distintas foram mandadas.
 */
export async function gravarEmLotes(
  tabela: string,
  linhas: Record<string, unknown>[],
  onConflict: string,
  log: Log,
): Promise<number> {
  if (!linhas.length) return 0;

  const chaves = onConflict.split(',');
  const porChave = new Map<string, Record<string, unknown>>();
  for (const l of linhas) porChave.set(chaves.map((c) => String(l[c])).join('\u0000'), l);
  const unicas = [...porChave.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, l]) => l);

  for (let i = 0; i < unicas.length; i += LOTE) {
    const { error } = await admin()
      .from(tabela)
      .upsert(unicas.slice(i, i + LOTE), { onConflict });
    if (error) throw erroDeEscrita('upsert', tabela, error, log);
  }
  return unicas.length;
}

/**
 * Apaga, para os donos e o item, as linhas cujo id NAO veio na listagem.
 *
 * ⛔ **Quem chama decide se pode** -- e so pode com listagem COMPLETA, nao vazia, de um item
 * `UPDATED` (ver `produtos.ts`). Esta funcao confia nisso e apaga.
 *
 * ⚠️ Le os ids existentes e apaga por `in(ausentes)`, em vez de `not in (presentes)`: o caminho
 * pelo `in` passa os valores pelo cliente, que os escapa, e uma lista de presentes nunca precisa
 * ser montada como texto de filtro.
 * ⚠️ O `select` respeita o teto de linhas do PostgREST (1000). Passar disso faz a limpeza ver so
 * parte do que existe -- deixa de apagar, nunca apaga a mais.
 */
export async function apagarAusentes(
  tabela: string,
  colunaId: string,
  itemId: string,
  donos: string[],
  presentes: string[],
  log: Log,
): Promise<number> {
  const { data, error } = await admin()
    .from(tabela)
    .select(colunaId)
    .eq('pluggy_item_id', itemId)
    .in('user_id', donos);
  if (error) throw erroDeEscrita('select', tabela, error, log);

  const manter = new Set(presentes);
  const existentes = (data ?? []) as unknown as Record<string, unknown>[];
  const ausentes = [...new Set(existentes.map((l) => String(l[colunaId])))]
    .filter((id) => !manter.has(id));
  if (!ausentes.length) return 0;

  const { error: erroApagar } = await admin()
    .from(tabela)
    .delete()
    .eq('pluggy_item_id', itemId)
    .in('user_id', donos)
    .in(colunaId, ausentes);
  if (erroApagar) throw erroDeEscrita('delete', tabela, erroApagar, log);
  return ausentes.length;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Grava (ou atualiza) o mapa item -> usuario, a partir do item **como a API da Pluggy o devolveu**.
 *
 * ⭐⭐ **Desde 2026-10-02 o dono vem de `buscarItem().clientUserId`, nunca do payload.** Antes vinha
 * do `clientUserId` do evento, e um `item/created` forjado podia escrever qualquer `user_id` aqui.
 * Hoje o maximo que um evento forjado consegue e fazer a gente perguntar a Pluggy -- e a resposta e
 * o `clientUserId` que o Connect Token gravou, que o atacante nao controla. E a regra do
 * `index.ts` aplicada ao ultimo campo que a violava: *o payload e aviso, nunca dado*.
 *
 * ⛔ **Um item NUNCA troca de dono por aqui.** A guarda continua, porque a premissa "a Pluggy
 * guarda o dono certo" pode envelhecer e uma guarda no codigo nao. E nao ha caso legitimo que ela
 * barre: a Pluggy emite um `itemId` NOVO a cada conexao. Acrescentar um segundo dono (conta
 * conjunta) e trabalho do `pluggy-register-item`, que tem JWT.
 */
export async function gravarItem(itemId: string, item: ItemPluggy) {
  const dono = item.clientUserId;
  if (!dono || !UUID.test(dono)) {
    // `user_id` e uuid com FK para auth.users -- um valor que nao e uuid nao e usuario do NorteIA.
    throw new Error(`item ${itemId} sem clientUserId uuid na Pluggy`);
  }

  const donos = await donosDoItem(itemId);
  if (donos.length && !donos.includes(dono)) {
    // ⚠️ Erro, nao `return` silencioso: isto so acontece por defeito da Pluggy ou por dado
    // adulterado, e os dois merecem uma linha vermelha no painel.
    throw new Error(`item ${itemId} ja tem dono -- webhook nao acrescenta um segundo`);
  }

  const { error } = await admin()
    .from('open_finance_itens')
    .upsert(
      { pluggy_item_id: itemId, user_id: dono, banco: item.connector?.name ?? null,
        status: item.status ?? null, atualizado_em: new Date().toISOString() },
      { onConflict: 'user_id,pluggy_item_id' },
    );
  if (error) throw new Error(`upsert open_finance_itens: ${error.message}`);
}

/**
 * Carimba o fim de uma sincronizacao completa em que nada falhou nem foi adiado.
 *
 * ⚠️ So observabilidade e o intervalo minimo do `pluggy-register-item`. **Nada decide SE
 * sincroniza por isto** -- um evento da Pluggy sempre sincroniza.
 */
export async function marcarSincronizado(itemId: string, donos: string[]) {
  const { error } = await admin()
    .from('open_finance_itens')
    .update({ sincronizado_em: new Date().toISOString() })
    .eq('pluggy_item_id', itemId)
    .in('user_id', donos);
  if (error) throw new Error(`update open_finance_itens: ${error.code ?? '?'} ${error.message}`);
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
