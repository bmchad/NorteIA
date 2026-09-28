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
 */
let apiKeyCache: { chave: string; expiraEm: number } | null = null;
const FOLGA_MS = 5 * 60 * 1000;

async function apiKey(): Promise<string> {
  if (apiKeyCache && Date.now() < apiKeyCache.expiraEm) return apiKeyCache.chave;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET nao configurados');
  }

  const r = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
  });
  if (!r.ok) throw new Error(`POST /auth devolveu ${r.status}`);

  const { apiKey: chave } = await r.json();
  apiKeyCache = { chave, expiraEm: Date.now() + 2 * 60 * 60 * 1000 - FOLGA_MS };
  return chave;
}

async function get<T>(caminho: string): Promise<T> {
  const r = await fetch(`${BASE}${caminho}`, {
    headers: { 'X-API-KEY': await apiKey() },
  });
  if (!r.ok) throw new Error(`GET ${caminho} devolveu ${r.status}`);
  return await r.json() as T;
}

// ---------------------------------------------------------------------------------------
// Os objetos que nos interessam. Sao PARCIAIS de proposito: o que nao esta aqui continua
// chegando inteiro e vai para a coluna `payload`.
// ---------------------------------------------------------------------------------------

export interface TransacaoPluggy {
  id: string;
  accountId: string;
  /** ⚠️ SEMPRE POSITIVO. A direcao vive em `type`, nao no sinal. */
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
}

export interface ItemPluggy {
  id: string;
  status?: string | null;
  connector?: { name?: string | null } | null;
  clientUserId?: string | null;
}

export const buscarTransacao = (id: string) =>
  get<TransacaoPluggy>(`/transactions/${id}`);

/**
 * Lista as transacoes CRIADAS numa conta a partir de um instante.
 *
 * ⭐⭐ **Existe porque `transactions/created` NAO manda `transactionIds`.** Diferente de
 * `updated` e `deleted`, o evento de criacao manda `transactionsCount`, `transactionsCreatedAtFrom`
 * e um link -- porque a carga inicial de um item tem centenas de transacoes e a lista nao caberia
 * no payload. Quem quiser as transacoes tem de pagina-las.
 *
 * ⛔⛔ **`GET /transactions` JA MORREU, e este arquivo dizia que morreria em 31/12/2026.**
 * Medido em 2026-09-28: devolve `410 ENDPOINT_DEPRECATED`. Como `get` lanca em `!r.ok`, o
 * `transactions/created` inteiro falhava, a excecao virava log e **o webhook respondia 200 do
 * mesmo jeito** -- zero linhas gravadas, sem sintoma nenhum. E o evento mais importante dos tres.
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
 * ⚠️ **Lacuna declarada:** as duas contas do sandbox tem 12 e 21 linhas e as duas voltaram
 * `next: null`, entao eu **nunca vi um `next` preenchido** -- nao ha como forcar, porque nao existe
 * parametro de tamanho de pagina. Trato URL absoluta e caminho relativo, que sao as unicas formas
 * possiveis (ver a recusa de `cursor` acima), e **lanco com o valor cru** se vier outra coisa: o
 * log passa a conter a forma real, que e como a gente vai descobrir. Silenciar aqui repetiria
 * exatamente o defeito que o 410 causou.
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

export async function listarTransacoesCriadas(
  accountId: string,
  createdAtFrom: string | undefined,
  log: { etapa(n: string, d?: Record<string, unknown>): void },
): Promise<TransacaoPluggy[]> {
  const todas: TransacaoPluggy[] = [];

  const q = new URLSearchParams({ accountId });
  // ⚠️ Sem `createdAtFrom` a chamada traz o historico INTEIRO da conta. Nao e erro -- o upsert
  // aguenta --, mas sao paginas a toa. O evento quase sempre manda o instante.
  if (createdAtFrom) q.set('createdAtFrom', createdAtFrom);

  let caminho: string | null = `/v2/transactions?${q}`;
  let pagina = 0;

  while (caminho) {
    const r: { results: TransacaoPluggy[]; next?: string | null } = await get(caminho);
    todas.push(...(r.results ?? []));
    pagina++;
    log.etapa('pagina', { pagina, n: r.results?.length ?? 0, temProxima: !!r.next });

    if (pagina >= MAX_PAGINAS) {
      // Falha alta, nao truncagem silenciosa: gravar metade sem avisar seria pior que errar.
      throw new Error(`paginacao passou de ${MAX_PAGINAS} paginas em ${accountId}`);
    }
    caminho = proximaPagina(r.next);
  }

  return todas;
}

export const buscarItem = (id: string) =>
  get<ItemPluggy>(`/items/${id}`);

/**
 * ⚠️ **`banco` nao existe no objeto Transaction.** Ele mora no conector, e so se chega la em
 * dois saltos: transacao -> conta -> item -> `connector.name`. Sao duas chamadas a mais por
 * transacao se ninguem cachear -- dai o cache abaixo.
 *
 * ⭐ Cache por invocacao: um evento traz varias transacoes da MESMA conta, entao a primeira
 * paga as duas chamadas e as outras nao pagam nenhuma.
 */
const cacheConta = new Map<string, { conta: ContaPluggy; banco: string | null }>();

export async function contaComBanco(accountId: string) {
  const emCache = cacheConta.get(accountId);
  if (emCache) return emCache;

  const conta = await get<ContaPluggy>(`/accounts/${accountId}`);
  let banco: string | null = null;
  try {
    const item = await buscarItem(conta.itemId);
    banco = item.connector?.name ?? null;
  } catch {
    // ⚠️ Banco ausente nao invalida a transacao: o valor, a data e o nome ja estao corretos, e
    // `banco` e preenchivel depois a partir do `pluggy_item_id`. Derrubar a gravacao inteira
    // por causa dele trocaria um campo vazio por uma linha inexistente.
  }

  const resultado = { conta, banco };
  cacheConta.set(accountId, resultado);
  return resultado;
}
