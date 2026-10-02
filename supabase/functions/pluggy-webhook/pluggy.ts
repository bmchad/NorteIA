/**
 * Cliente da API da Pluggy.
 *
 * ⭐⭐ **A funcao precisa de `clientId` + `clientSecret`, nao de uma apiKey guardada.** A apiKey
 * da Pluggy **expira em 2 horas** e o connect token em 30 minutos -- os dois sao efemeros e
 * inuteis para um webhook que roda a qualquer hora do dia. Guardar um deles num secret
 * funcionaria no teste e pararia sozinho na madrugada seguinte.
 *
 * ⚠️ O `.env` da raiz do projeto tem `PLUGGY_API_KEY` e `PLUGGY_CONNECT_TOKEN`. Nenhum dos dois
 * serve aqui, pelo motivo acima.
 */

const BASE = 'https://api.pluggy.ai';

const CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET');

/**
 * ⚠️ Cache de processo, nao de aplicacao. O worker do Supabase e reaproveitado entre chamadas
 * proximas, entao isto evita um `POST /auth` por evento -- mas some quando o worker morre, e
 * isso esta certo: nao ha o que invalidar, so um custo a mais na proxima chamada fria.
 *
 * ⭐ Renova com 5 minutos de folga. Usar a chave ate o ultimo segundo entrega um 403 no meio
 * de uma sincronizacao, que e o pior momento para descobrir que ela venceu.
 *
 * ⛔ **Guarda a PROMISE, e guarda ANTES do `await`.** Guardar a chave so depois que ela chega
 * deixa a janela aberta: N chamadas simultaneas olham o cache vazio ao mesmo tempo e disparam N
 * `POST /auth`. Uma promise rejeitada sai do cache, senao a falha viraria permanente no worker.
 */
let apiKeyCache: { chave: Promise<string>; expiraEm: number } | null = null;
const FOLGA_MS = 5 * 60 * 1000;

async function autenticar(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET nao configurados');
  }

  const r = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error(`POST /auth devolveu ${r.status}`);
  }

  const { apiKey: chave } = await r.json();
  return chave;
}

function apiKey(): Promise<string> {
  if (apiKeyCache && Date.now() < apiKeyCache.expiraEm) return apiKeyCache.chave;

  const entrada = { chave: autenticar(), expiraEm: Date.now() + 2 * 60 * 60 * 1000 - FOLGA_MS };
  apiKeyCache = entrada;
  entrada.chave.catch(() => {
    if (apiKeyCache === entrada) apiKeyCache = null;
  });
  return entrada.chave;
}

/** Erro HTTP da Pluggy, com o status a vista -- e o que separa "produto indisponivel" de falha. */
export class ErroPluggy extends Error {
  constructor(readonly status: number, caminho: string) {
    super(`GET ${caminho} devolveu ${status}`);
    this.name = 'ErroPluggy';
  }
}

async function get<T>(caminho: string): Promise<T> {
  const r = await fetch(`${BASE}${caminho}`, {
    headers: { 'X-API-KEY': await apiKey() },
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new ErroPluggy(r.status, caminho);
  }
  return await r.json() as T;
}

/**
 * ⭐ 404 vira `null` = "este item nao tem o produto". Item conectado a um banco que nao oferece
 * emprestimo nao e falha de sincronizacao; tratar como erro faria toda sync dele dar `falhou`.
 * Medido em 2026-10-02: `/identity` e `/loans` devolvem 404 `ITEM_NOT_FOUND` para item inexistente.
 */
async function ouIndisponivel<T>(chamada: Promise<T>): Promise<T | null> {
  try {
    return await chamada;
  } catch (e) {
    if (e instanceof ErroPluggy && e.status === 404) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------
// Os objetos que nos interessam. Sao PARCIAIS de proposito: so o que algum mapeamento le.
// ---------------------------------------------------------------------------------------

export interface TransacaoPluggy {
  id: string;
  accountId: string;
  /**
   * ⚠️ Copiado CRU para `valor`. **A convencao de sinal no cartao de credito nao esta medida**:
   * a documentacao da Pluggy diz que despesa de cartao vem positiva, a leitura do projeto e o
   * contrario, e o sandbox nao decide. Ver o comentario de `valor` em `gravar.ts`.
   */
  amount: number;
  /** ISO date-time. ⚠️ Ver o aviso sobre fuso em `gravar.ts`. */
  date: string;
  /** A versao limpa, feita pela Pluggy. Vira `apelido`. */
  description: string | null;
  /** O texto cru do banco. Vira `nome`. */
  descriptionRaw: string | null;
  type: 'DEBIT' | 'CREDIT';
  status?: string | null;
  category?: string | null;
  balance?: number | null;
  currencyCode?: string | null;
  providerCode?: string | null;
  /** ISO date-time. A versao da linha na Pluggy -- vira `pluggy_atualizado_em`. */
  updatedAt?: string | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    totalAmount?: number | null;
    cardNumber?: string | null;
    billId?: string | null;
    billForecastDate?: string | null;
  } | null;
  [k: string]: unknown;
}

export interface ContaPluggy {
  id: string;
  itemId: string;
  name?: string | null;
  /** BANK | CREDIT. Vai CRU para a coluna `tipo`. */
  type?: string | null;
  /** CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD. Vai CRU para `subtipo`. */
  subtype?: string | null;
}

export interface ItemPluggy {
  id: string;
  status?: string | null;
  connector?: { name?: string | null } | null;
  clientUserId?: string | null;
}

/** ⛔ Parcial ao extremo: da identidade so o CPF e lido, e so para virar HMAC. */
export interface IdentidadePluggy {
  document?: string | null;
  documentType?: string | null;
}

export interface InvestimentoPluggy {
  id: string;
  name?: string | null;
  code?: string | null;
  isin?: string | null;
  type?: string | null;
  subtype?: string | null;
  status?: string | null;
  balance?: number | null;
  amount?: number | null;
  amountOriginal?: number | null;
  amountProfit?: number | null;
  amountWithdrawal?: number | null;
  taxes?: number | null;
  taxes2?: number | null;
  value?: number | null;
  quantity?: number | null;
  rate?: number | null;
  rateType?: string | null;
  ratePeriodicity?: string | null;
  fixedAnnualRate?: number | null;
  indexerAdditionalInfo?: string | null;
  lastMonthRate?: number | null;
  lastTwelveMonthsRate?: number | null;
  annualRate?: number | null;
  taxExempt?: boolean | null;
  couponPayment?: Record<string, unknown> | null;
  date?: string | null;
  purchaseDate?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  gracePeriodDate?: string | null;
  issuer?: string | null;
  issuerCNPJ?: string | null;
  currencyCode?: string | null;
  updatedAt?: string | null;
}

/** ⚠️ O objeto NAO traz o id do investimento: quem lista sabe de qual pai pediu. */
export interface MovimentoPluggy {
  id: string;
  type?: string | null;
  movementType?: string | null;
  description?: string | null;
  amount?: number | null;
  netAmount?: number | null;
  value?: number | null;
  quantity?: number | null;
  date?: string | null;
  tradeDate?: string | null;
  indexerPercentage?: number | null;
  agreedRate?: number | null;
  expenses?: Record<string, unknown> | null;
}

export interface EmprestimoPluggy {
  id: string;
  productName?: string | null;
  type?: string | null;
  kind?: string | null;
  productSubTypeCategory?: string | null;
  contractAmount?: number | null;
  totalRemainingAmount?: number | null;
  nextInstallmentAmount?: number | null;
  CET?: number | null;
  amortizationScheduled?: string | null;
  installmentPeriodicity?: string | null;
  hasInsuranceContracted?: boolean | null;
  date?: string | null;
  contractDate?: string | null;
  settlementDate?: string | null;
  dueDate?: string | null;
  firstInstallmentDueDate?: string | null;
  currencyCode?: string | null;
  disbursementDates?: string[] | null;
  interestRates?: unknown[] | null;
  contractedFees?: unknown[] | null;
  contractedFinanceCharges?: unknown[] | null;
  warranties?: unknown[] | null;
  installments?: {
    totalNumberOfInstallments?: number | null;
    typeNumberOfInstallments?: string | null;
    paidInstallments?: number | null;
    dueInstallments?: number | null;
    pastDueInstallments?: number | null;
    contractRemainingNumber?: number | null;
    typeContractRemaining?: string | null;
    balloonPayments?: unknown[] | null;
  } | null;
  payments?: {
    contractOutstandingBalance?: number | null;
    contractOutstandingBalanceUpdatedAt?: string | null;
    releases?: unknown[] | null;
  } | null;
  updatedAt?: string | null;
}

export const buscarTransacao = (id: string) =>
  get<TransacaoPluggy>(`/transactions/${encodeURIComponent(id)}`);

export const buscarItem = (id: string) =>
  get<ItemPluggy>(`/items/${encodeURIComponent(id)}`);

// ---------------------------------------------------------------------------------------
// Transacoes: a v2, por cursor
// ---------------------------------------------------------------------------------------

/**
 * ⭐⭐ **`transactions/created` NAO manda `transactionIds`.** Diferente de `updated` e `deleted`, o
 * evento de criacao manda `transactionsCount`, `transactionsCreatedAtFrom` e um link -- porque a
 * carga inicial de um item tem centenas de transacoes e a lista nao caberia no payload. Quem
 * quiser as transacoes tem de pagina-las.
 *
 * ⛔⛔ **`GET /transactions` (v1) JA MORREU.** Medido em 2026-09-28: devolve `410
 * ENDPOINT_DEPRECATED`. Como `get` lanca em `!r.ok`, o `transactions/created` inteiro falhava, a
 * excecao virava log e **o webhook respondia 200 do mesmo jeito** -- zero linhas gravadas, sem
 * sintoma nenhum.
 *
 * ⭐ **O contrato da v2, medido (nao lido na documentacao):**
 *
 *   resposta        `{ results: [...], next: string | null }` -- cursor em `next`
 *   paginacao       segue-se o `next` ate vir `null`. NAO ha `page`/`totalPages`
 *   `createdAtFrom` ✓ aceito (200)
 *   `pageSize`      ✗ `property pageSize should not exist`
 *   `from` / `to`   ✗ idem
 *   `cursor`        ✗ idem — e e por isso que `next` **so pode ser URL ou caminho**:
 *                   nao existe parametro de cursor onde pendurar um token
 *   forma do item   identica a v1 (as mesmas 23 chaves) -> o mapeamento nao mudou
 *
 * ⭐ `GET /transactions/{id}` continua vivo (200), entao `buscarTransacao` e o
 * `transactions/updated` nao foram afetados. Morreu so a listagem.
 */

/** Teto de paginas. `next` que nunca zera viraria laco infinito num worker que paga por segundo. */
const MAX_PAGINAS = 200;

/**
 * Traduz o `next` da v2 para um caminho que o `get` aceita.
 *
 * ⚠️ **Lacuna declarada:** ate 2026-10-02 nenhuma conta medida passou de uma pagina (a maior tem
 * 102 linhas, e todas voltaram `next: null`), entao eu **nunca vi um `next` preenchido** -- nao ha
 * como forcar, porque nao existe parametro de tamanho de pagina. Trato URL absoluta e caminho
 * relativo, que sao as unicas formas possiveis (ver a recusa de `cursor` acima), e **lanco com o
 * valor cru** se vier outra coisa: o log passa a conter a forma real, que e como a gente vai
 * descobrir. Silenciar aqui repetiria exatamente o defeito que o 410 causou.
 */
function proximaPagina(next: string | null | undefined): string | null {
  if (!next) return null;
  if (next.startsWith('/')) return next;
  if (next.startsWith('http')) {
    const u = new URL(next);
    return u.pathname + u.search;
  }
  throw new Error(`next da v2 em formato inesperado: ${JSON.stringify(next).slice(0, 120)}`);
}

/**
 * Lista as transacoes de uma conta, **uma pagina por vez**.
 *
 * ⭐ Gerador, e nao lista: o chamador grava cada pagina e a descarta antes de pedir a proxima.
 * Acumular o historico inteiro para gravar no fim e o que faz uma conta grande estourar memoria
 * -- e o `546` que isso causa nao passa por `catch` nenhum. E e entre uma pagina e outra que a
 * sincronizacao confere o orcamento de tempo: a proxima so e pedida quando o chamador pede.
 *
 * ⚠️ Sem `createdAtFrom` a chamada traz o historico INTEIRO da conta -- e e isso que a
 * sincronizacao completa quer. O `transactions/created` passa o instante do evento.
 */
export async function* listarTransacoes(
  accountId: string,
  { createdAtFrom }: { createdAtFrom?: string } = {},
): AsyncGenerator<TransacaoPluggy[], void, undefined> {
  const q = new URLSearchParams({ accountId });
  if (createdAtFrom) q.set('createdAtFrom', createdAtFrom);

  let caminho: string | null = `/v2/transactions?${q}`;
  let pagina = 0;

  while (caminho) {
    const r: { results?: TransacaoPluggy[]; next?: string | null } = await get(caminho);
    pagina++;
    yield r.results ?? [];

    caminho = proximaPagina(r.next);
    if (caminho && pagina >= MAX_PAGINAS) {
      // Falha alta, nao truncagem silenciosa: gravar metade sem avisar seria pior que errar.
      throw new Error(`paginacao passou de ${MAX_PAGINAS} paginas em ${accountId}`);
    }
  }
}

// ---------------------------------------------------------------------------------------
// Contas, investimentos e emprestimos: a v1, por pagina
// ---------------------------------------------------------------------------------------

/**
 * O que uma listagem v1 devolve, e se ela veio INTEIRA.
 *
 * ⭐ `completa` e o que autoriza apagar o que nao veio. Um `total` que nao bate com o que chegou,
 * ou que muda durante a listagem, deixa `completa = false` -- e listagem parcial nunca apaga.
 */
export interface Listagem<T> {
  itens: T[];
  completa: boolean;
}

/**
 * ⭐ Medido em 2026-10-02: `pageSize=500` e aceito (ate 501 passou), e o padrao das movimentacoes
 * de investimento e **100 por pagina**. Sem paginar, um investimento com mais de 100 movimentos
 * perderia o resto em silencio.
 */
const TAMANHO_PAGINA_V1 = 500;

/**
 * Pagina um endpoint v1 (`{ total, totalPages, page, results }`).
 *
 * ⚠️ `page` comeca em **1**: medido, `page=0` devolve 500, e `page` alem do fim devolve 200 com
 * lista vazia -- por isso o laco segue `totalPages`, nao "ate vir vazio".
 */
async function paginarV1<T>(caminho: string): Promise<Listagem<T>> {
  const sep = caminho.includes('?') ? '&' : '?';
  const itens: T[] = [];
  const totais = new Set<number | undefined>();
  let totalPaginas = 1;

  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    if (pagina > MAX_PAGINAS) {
      throw new Error(`paginacao passou de ${MAX_PAGINAS} paginas em ${caminho}`);
    }
    const r = await get<{ results?: T[]; total?: number; totalPages?: number }>(
      `${caminho}${sep}pageSize=${TAMANHO_PAGINA_V1}&page=${pagina}`,
    );
    itens.push(...(r.results ?? []));
    totais.add(r.total);
    if (pagina === 1) totalPaginas = r.totalPages ?? 1;
  }

  const [total] = totais;
  return { itens, completa: totais.size === 1 && total === itens.length };
}

export const listarContas = (itemId: string) =>
  paginarV1<ContaPluggy>(`/accounts?itemId=${encodeURIComponent(itemId)}`);

export const buscarIdentidade = (itemId: string) =>
  ouIndisponivel(get<IdentidadePluggy>(`/identity?itemId=${encodeURIComponent(itemId)}`));

export const listarInvestimentos = (itemId: string) =>
  ouIndisponivel(paginarV1<InvestimentoPluggy>(`/investments?itemId=${encodeURIComponent(itemId)}`));

export const listarMovimentos = (investmentId: string) =>
  ouIndisponivel(
    paginarV1<MovimentoPluggy>(`/investments/${encodeURIComponent(investmentId)}/transactions`),
  );

export const listarEmprestimos = (itemId: string) =>
  ouIndisponivel(paginarV1<EmprestimoPluggy>(`/loans?itemId=${encodeURIComponent(itemId)}`));

// ---------------------------------------------------------------------------------------
// A conta de uma transacao, com o banco
// ---------------------------------------------------------------------------------------

export interface ContaComBanco {
  conta: ContaPluggy;
  banco: string | null;
}

/**
 * ⚠️ **`banco` nao existe no objeto Transaction.** Ele mora no conector, e so se chega la em
 * dois saltos: transacao -> conta -> item -> `connector.name`. Sao duas chamadas a mais por
 * transacao se ninguem cachear -- dai o cache abaixo.
 *
 * ⚠️ **O cache vive pelo WORKER, nao pela invocacao** -- este comentario dizia o contrario. O
 * runtime reaproveita o worker entre eventos proximos, e o `Map` vai junto. Nao ha o que
 * invalidar: conta nao muda de item, e o nome do conector quase nunca muda.
 *
 * ⛔ **Guarda a PROMISE antes do `await`**, como `apiKey`. Guardando o resultado, um evento com 100
 * transacoes da mesma conta disparava 100 `GET /accounts` simultaneos -- e um 429 em qualquer um
 * derrubava o lote inteiro.
 *
 * ⭐ `banco` nulo NAO fica no cache: quase sempre e o `buscarItem` que falhou, e a proxima
 * transacao tenta de novo em vez de herdar o buraco pelo resto da vida do worker.
 *
 * ⭐ A sincronizacao completa nao passa por aqui: ela ja tem as contas (`listarContas`) e o item, e
 * monta o par sem chamada nenhuma. Isto serve aos eventos `transactions/*`, que so trazem ids.
 */
const cacheConta = new Map<string, Promise<ContaComBanco>>();

export function contaComBanco(accountId: string): Promise<ContaComBanco> {
  const emCache = cacheConta.get(accountId);
  if (emCache) return emCache;

  const promessa = (async () => {
    const conta = await get<ContaPluggy>(`/accounts/${encodeURIComponent(accountId)}`);
    let banco: string | null = null;
    try {
      const item = await buscarItem(conta.itemId);
      banco = item.connector?.name ?? null;
    } catch {
      // ⚠️ Banco ausente nao invalida a transacao: o valor, a data e o nome ja estao corretos, e
      // `banco` e preenchivel depois a partir do `pluggy_item_id`. Derrubar a gravacao inteira
      // por causa dele trocaria um campo vazio por uma linha inexistente.
    }
    return { conta, banco };
  })();

  cacheConta.set(accountId, promessa);
  const sair = () => {
    if (cacheConta.get(accountId) === promessa) cacheConta.delete(accountId);
  };
  promessa.then((r) => { if (r.banco === null) sair(); }, sair);
  return promessa;
}
