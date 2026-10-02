/**
 * Recebe os webhooks da Pluggy (Open Finance) e espelha o item em `public.open_finance*`.
 *
 * ⭐ **O payload da Pluggy so traz IDENTIFICADORES** -- `eventId`, `itemId`, `accountId`,
 * `transactionIds`. Nunca nome, data, valor ou banco: quem quiser o dado busca na API com a
 * propria chave, entao **um webhook forjado nao injeta transacao falsa.**
 *
 * ⛔⛔ **Mas NAO conclua dai que forjar so custa cota.** Esta linha dizia isso, e estava
 * errada. Tres caminhos daqui escrevem com `service_role`, POR CIMA DA RLS:
 *
 *   `item/*`               grava `itemId -> dono`. Re-apontar o item de outra pessoa faz as
 *                          transacoes DELA nascerem com o `user_id` DELE -> exfiltracao.
 *   `transactions/deleted` apaga por `transactionIds`      -> destruicao.
 *   `transactions/*`       copia transacao para os donos do item do evento. Um par forjado
 *                          (item A, ids da conta de B) copiaria os dados de B para os donos de A.
 *
 * ⭐ Os tres estao fechados, e fechados no CODIGO, nao so no segredo -- "o segredo e forte" e uma
 * premissa que envelhece e uma guarda nao:
 *
 *   dono        vem de `buscarItem().clientUserId` (a API), nunca do payload -- `gravar.ts`
 *   delete      escopado ao item do evento -- `apagarTransacoes`
 *   copia       transacao cuja conta nao e do item do evento e descartada (`conta_de_outro_item`)
 *
 * ⚠️ **Ainda assim o segredo e a UNICA autenticacao deste endpoint.** Gere com >=128 bits
 * (`openssl rand -base64 32`). Seis letras minusculas sao 28 bits e caem em dias.
 *
 * ⛔ **A Pluggy NAO assina os webhooks.** Nao ha HMAC, nem header de assinatura, nem secret
 * nativo -- conferido na documentacao em 2026-09-24. O `x-webhook-secret` abaixo e um header
 * customizado que NOS configuramos no `POST /webhooks`, e e o unico mecanismo disponivel.
 *
 * ⛔⛔ **`verify_jwt = false` em `supabase/config.toml`, e sem isso nada funciona.** A Pluggy
 * nao manda JWT; a Edge Function devolveria 401 -- e **a Pluggy nao repete em 401**. O webhook
 * morreria na primeira entrega, para sempre, sem erro visivel em lugar nenhum.
 */

import { criarLog, type Log } from '../_shared/log.ts';
import {
  type TransacaoPluggy,
  buscarItem,
  buscarTransacao,
  contaComBanco,
  listarTransacoes,
} from './pluggy.ts';
import {
  apagarTransacoes,
  donosDoItem,
  gravarEmLotes,
  gravarItem,
  paraLinha,
  porDono,
} from './gravar.ts';
import { sincronizarItem } from './sincronizar.ts';
import { VERSAO } from './versao.ts';

const WEBHOOK_SECRET = Deno.env.get('PLUGGY_WEBHOOK_SECRET');

/** ⚠️ Quantas transacoes buscar em paralelo. Segura a mao na API da Pluggy sem serializar. */
const PARALELISMO = 5;

/** Ids de `transactions/updated` buscados e gravados por vez -- o historico nunca fica inteiro em memoria. */
const LOTE_UPDATED = 100;

const CONFLITO_TRANSACAO = 'user_id,pluggy_transaction_id';

/**
 * Compara em tempo constante. Um `===` sai no primeiro byte diferente, e o tempo de resposta
 * revela quantos caracteres do segredo estao certos. Copiado de `send-email/index.ts`.
 */
function segredoConfere(recebido: string | null): boolean {
  if (!WEBHOOK_SECRET || !recebido) return false;
  if (recebido.length !== WEBHOOK_SECRET.length) return false;
  let diferenca = 0;
  for (let i = 0; i < WEBHOOK_SECRET.length; i++) {
    diferenca |= WEBHOOK_SECRET.charCodeAt(i) ^ recebido.charCodeAt(i);
  }
  return diferenca === 0;
}

/**
 * ⛔⛔ **Os tres eventos de transacao NAO tem o mesmo formato**, e confundi-los foi o primeiro
 * defeito deste arquivo.
 *
 *   `transactions/updated` e `transactions/deleted` -> mandam `transactionIds` (a lista).
 *   `transactions/created`                          -> **NAO manda**. Manda `transactionsCount`,
 *                                                      `transactionsCreatedAtFrom` e um link.
 *
 * O motivo e de tamanho: a carga inicial de um item tem centenas de transacoes (o exemplo da
 * documentacao mostra 332) e a lista nao caberia no payload. Tratar `created` como se tivesse
 * `transactionIds` faz o evento mais importante de todos ser ignorado em silencio.
 */
interface EventoPluggy {
  event: string;
  eventId?: string;
  itemId?: string;
  accountId?: string;
  /** So em `transactions/updated` e `transactions/deleted`. */
  transactionIds?: string[];
  /** So em `transactions/created`. */
  transactionsCount?: number;
  /** So em `transactions/created`. O instante a partir do qual paginar. */
  transactionsCreatedAtFrom?: string;
  /**
   * So em eventos `item/*`. ⛔ **NAO e lido** desde 2026-10-02: o dono vem de `buscarItem()`, que
   * devolve o `clientUserId` gravado pelo Connect Token -- o mesmo valor, com procedencia de API.
   */
  clientUserId?: string;
  triggeredBy?: string;
}

/**
 * Os donos do item, com uma segunda chance quando nao ha nenhum.
 *
 * ⭐ **Fecha a corrida `item/created` x `transactions/created`.** Os dois chegam com segundos de
 * diferenca e sem ordem garantida; se o de transacao vence, o mapa ainda esta vazio e ele virava
 * `item_orfao`. Aqui ele pergunta a Pluggy de quem e o item e grava o mapa antes de desistir.
 */
async function donosOuRecuperar(itemId: string, log: Log): Promise<string[]> {
  const donos = await donosDoItem(itemId);
  if (donos.length) return donos;

  try {
    const item = await buscarItem(itemId);
    if (!item.clientUserId) return [];
    await gravarItem(itemId, item);
    log.etapa('dono_recuperado');
  } catch (e) {
    log.falha('recuperar_dono', e);
    return [];
  }
  return await donosDoItem(itemId);
}

/** Busca `ids` com `PARALELISMO` simultaneos. Uma que falha nao derruba as outras. */
async function buscarTransacoes(ids: string[], log: Log): Promise<TransacaoPluggy[]> {
  const achadas: TransacaoPluggy[] = [];
  for (let i = 0; i < ids.length; i += PARALELISMO) {
    const lote = await Promise.all(
      ids.slice(i, i + PARALELISMO).map(async (id) => {
        try {
          return await buscarTransacao(id);
        } catch (e) {
          // ⚠️ A proxima sincronizacao completa (`item/updated`) traz a que faltou.
          log.falha('transacao', e);
          return null;
        }
      }),
    );
    for (const t of lote) if (t) achadas.push(t);
  }
  return achadas;
}

/** O trabalho de verdade, que roda DEPOIS da resposta. */
async function processar(evento: EventoPluggy, log: Log) {
  const { event, itemId } = evento;

  if (event === 'item/created' || event === 'item/updated') {
    if (!itemId) {
      log.etapa('item_sem_id');
      return;
    }

    // ⭐⭐ O item vem da API, e e dele que sai o dono -- ver `gravarItem`. O payload so diz QUAL.
    const item = await buscarItem(itemId);
    log.etapa('item', { status: item.status ?? null, temDono: !!item.clientUserId });

    // ⚠️ Item sem `clientUserId` (conectado pelo painel ou pelo Meu Pluggy) nao e erro: o dono
    // pode ter vindo pelo `pluggy-register-item`, e a consulta abaixo o encontra. ⛔ E era aqui que
    // o fluxo antigo retornava cedo -- item registrado assim NUNCA era sincronizado.
    if (item.clientUserId) {
      try {
        await gravarItem(itemId, item);
        log.etapa('item_gravado');
      } catch (e) {
        log.falha('gravar_item', e);
      }
    }

    const donos = await donosDoItem(itemId);
    if (!donos.length) {
      log.etapa('item_orfao', { event });
      return;
    }

    // A Pluggy ainda esta coletando: o `item/updated` do fim da coleta traz o dado inteiro.
    if (item.status === 'UPDATING') {
      log.etapa('item_atualizando');
      return;
    }

    await sincronizarItem(itemId, item, donos, log);
    return;
  }

  if (event === 'transactions/deleted') {
    // ⛔ Sem `itemId` o delete nao tem escopo, e sem escopo ele alcanca linha de terceiro.
    // Ignorar e o comportamento certo: a Pluggy sempre manda o item neste evento.
    if (!itemId) {
      log.etapa('deleted_sem_item');
      return;
    }
    await apagarTransacoes(itemId, evento.transactionIds ?? []);
    log.etapa('transacoes_apagadas', { n: evento.transactionIds?.length ?? 0 });
    return;
  }

  if (event === 'transactions/created' || event === 'transactions/updated') {
    if (!itemId) {
      log.etapa('evento_sem_item');
      return;
    }

    // ⛔ Sem dono, a transacao nao tem a quem pertencer -- `user_id` e NOT NULL. Isto sobra quando
    // o item foi conectado sem `clientUserId` e ainda nao passou pelo `pluggy-register-item`; a
    // sincronizacao completa do registro traz o historico depois.
    const donos = await donosOuRecuperar(itemId, log);
    if (!donos.length) {
      log.etapa('item_orfao', { event });
      return;
    }

    // ⭐ Os dois eventos chegam aqui por caminhos diferentes -- ver o comentario de EventoPluggy.
    if (event === 'transactions/created') {
      if (!evento.accountId) {
        log.etapa('created_sem_conta');
        return;
      }

      // ⛔ **Escopo: a conta tem de ser do item do evento.** Sem isto, um par forjado (item A,
      // conta de B) listaria as transacoes de B e as gravaria para os donos de A.
      const cb = await contaComBanco(evento.accountId);
      if (cb.conta.itemId !== itemId) {
        log.etapa('conta_de_outro_item');
        return;
      }

      log.etapa('paginando', { esperadas: evento.transactionsCount ?? null });
      let n = 0;
      let pagina = 0;
      for await (
        const lista of listarTransacoes(evento.accountId, {
          createdAtFrom: evento.transactionsCreatedAtFrom,
        })
      ) {
        pagina++;
        const daConta = lista.filter((t) => t.accountId === cb.conta.id);
        const base = daConta.map((t) => paraLinha(t, cb, donos[0], itemId));
        await gravarEmLotes('open_finance', porDono(base, donos), CONFLITO_TRANSACAO, log);
        n += daConta.length;
        log.etapa('pagina', { pagina, n: daConta.length });
      }
      log.etapa('gravadas', { n, donos: donos.length });
      return;
    }

    // `transactions/updated`
    const ids = [...new Set(evento.transactionIds ?? [])];
    if (!ids.length) {
      log.etapa('updated_sem_ids');
      return;
    }
    log.etapa('buscando', { n: ids.length });

    let n = 0;
    let foraDoItem = 0;
    for (let i = 0; i < ids.length; i += LOTE_UPDATED) {
      const transacoes = await buscarTransacoes(ids.slice(i, i + LOTE_UPDATED), log);
      const base = [];
      for (const t of transacoes) {
        let cb;
        try {
          // ⭐ Uma busca por CONTA, nao por transacao: o cache guarda a promise (`pluggy.ts`).
          cb = await contaComBanco(t.accountId);
        } catch (e) {
          log.falha('conta', e);
          continue;
        }
        // ⛔ O mesmo escopo do `created`, aplicado linha a linha.
        if (cb.conta.itemId !== itemId) {
          foraDoItem++;
          continue;
        }
        base.push(paraLinha(t, cb, donos[0], itemId));
      }
      await gravarEmLotes('open_finance', porDono(base, donos), CONFLITO_TRANSACAO, log);
      n += base.length;
    }
    if (foraDoItem) log.etapa('conta_de_outro_item', { n: foraDoItem });
    log.etapa('gravadas', { n, donos: donos.length });
    return;
  }

  // Eventos de pagamento e de conector chegam porque o webhook e registrado com `event: "all"`,
  // que e o que cobre os cinco obrigatorios num registro so. Ignorar e o comportamento correto.
  log.etapa('ignorado', { event });
}

/** ⚠️ `EdgeRuntime` existe no runtime do Supabase mas nao no tipo padrao do Deno. */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/**
 * ⭐⭐ **O diagnostico de um 546 DEPOIS do 200.** O trabalho roda em `waitUntil`, entao a Pluggy ja
 * recebeu 200 quando o worker morre por CPU, tempo de parede ou memoria -- e nada aparece em lugar
 * nenhum, nem no status da resposta. O runtime avisa antes de desligar, com o motivo
 * (`CPUTime`, `WallClockTime`, `MemoryLimit`...). Esta linha e a unica testemunha.
 */
addEventListener('beforeunload', (ev) => {
  const motivo = (ev as Event & { detail?: { reason?: string } }).detail?.reason ?? null;
  criarLog('pluggy-webhook').etapa('desligando', { motivo });
});

Deno.serve(async (req: Request) => {
  const log = criarLog('pluggy-webhook');

  // A primeirissima coisa, antes de ler o corpo. Ver `send-email`, D-024.
  if (!segredoConfere(req.headers.get('x-webhook-secret'))) {
    log.etapa('nao_autorizado');
    // ⚠️ 401 de proposito, e a Pluggy NAO repete em 401 -- que e o certo para uma requisicao
    // que nao veio dela. ⛔ Mas e por isso que a ordem de implantacao morde: se o segredo for
    // configurado errado, TODA entrega legitima morre na primeira tentativa. Ver L-004.
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401,
    });
  }

  let evento: EventoPluggy;
  try {
    evento = await req.json();
  } catch {
    // 400 tambem nao e repetido pela Pluggy, e esta certo: corpo invalido nao melhora com o tempo.
    return new Response(JSON.stringify({ error: 'JSON invalido' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  log.etapa('recebido', { event: evento.event, temItem: !!evento.itemId, versao: VERSAO });

  // ⭐⭐ **Responde ANTES de processar, e nao e otimizacao -- e correcao.** A Pluggy espera 2XX
  // em 10 s e trata o estouro como falha, reenviando o evento. Uma sincronizacao completa tem
  // centenas de transacoes e passa disso com folga: sem o `waitUntil`, o caminho feliz viraria
  // retry, e o retry chegaria enquanto o primeiro ainda roda.
  const trabalho = processar(evento, log).catch((e) => log.falha('processar', e));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(trabalho);
  else await trabalho; // fallback local, onde `EdgeRuntime` nao existe

  return new Response(JSON.stringify({ recebido: true, versao: VERSAO }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
