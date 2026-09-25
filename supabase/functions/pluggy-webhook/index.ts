/**
 * Recebe os webhooks da Pluggy (Open Finance) e espelha as transacoes em `public.open_finance`.
 *
 * ⭐⭐ **O payload da Pluggy so traz IDENTIFICADORES** -- `eventId`, `itemId`, `accountId`,
 * `transactionIds`. Nunca nome, data, valor ou banco. Quem quiser o dado busca na API. Isso tem
 * uma consequencia de seguranca que vale escrever: **um webhook forjado nao injeta transacao
 * falsa**; no pior caso faz a funcao buscar os proprios dados de novo, com a propria chave.
 * Custo de cota, nao de integridade. A protecao real e essa, e nao o segredo:
 * **o payload e aviso, nunca dado.**
 *
 * ⛔ **A Pluggy NAO assina os webhooks.** Nao ha HMAC, nem header de assinatura, nem secret
 * nativo -- conferido na documentacao em 2026-09-24. O `x-webhook-secret` abaixo e um header
 * customizado que NOS configuramos no `POST /webhooks`, e e o unico mecanismo disponivel.
 *
 * ⛔⛔ **`verify_jwt = false` em `supabase/config.toml`, e sem isso nada funciona.** A Pluggy
 * nao manda JWT; a Edge Function devolveria 401 -- e **a Pluggy nao repete em 401**. O webhook
 * morreria na primeira entrega, para sempre, sem erro visivel em lugar nenhum.
 */

import { criarLog } from '../_shared/log.ts';
import { buscarTransacao, listarTransacoesCriadas, TransacaoPluggy } from './pluggy.ts';
import { donoDoItem, gravarItem, gravarTransacoes, apagarTransacoes, paraLinha } from './gravar.ts';

const WEBHOOK_SECRET = Deno.env.get('PLUGGY_WEBHOOK_SECRET');

/** ⚠️ Quantas transacoes buscar em paralelo. Segura a mao na API da Pluggy sem serializar. */
const PARALELISMO = 5;

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
  /** So em eventos `item/*`. E o `user_id` do NorteIA, definido no Connect Token. */
  clientUserId?: string;
  triggeredBy?: string;
}

/** O trabalho de verdade, que roda DEPOIS da resposta. */
async function processar(evento: EventoPluggy, log: ReturnType<typeof criarLog>) {
  const { event, itemId } = evento;

  if (event === 'item/created' || event === 'item/updated') {
    // ⭐ O `clientUserId` e o `user_id` do NorteIA, definido no Connect Token. E o unico
    // momento em que a Pluggy diz de quem e o item -- os eventos de transacao nao dizem.
    if (!itemId || !evento.clientUserId) {
      log.etapa('item_sem_dono', { temItem: !!itemId, temUsuario: !!evento.clientUserId });
      return;
    }
    await gravarItem(itemId, evento.clientUserId);
    log.etapa('item_gravado');
    return;
  }

  if (event === 'transactions/deleted') {
    await apagarTransacoes(evento.transactionIds ?? []);
    log.etapa('transacoes_apagadas', { n: evento.transactionIds?.length ?? 0 });
    return;
  }

  if (event === 'transactions/created' || event === 'transactions/updated') {
    if (!itemId) {
      log.etapa('evento_sem_item');
      return;
    }

    // ⛔ Sem o mapa, a transacao nao tem dono e a linha seria inutil -- `user_id` e NOT NULL.
    // Isto acontece quando o item foi conectado sem `clientUserId` no Connect Token, e nesse
    // caso nao ha conserto retroativo: a Pluggy nao guarda a quem o item pertencia.
    const userId = await donoDoItem(itemId);
    if (!userId) {
      log.etapa('item_orfao', { event });
      return;
    }

    // ⭐ Os dois eventos chegam aqui por caminhos diferentes -- ver o comentario de EventoPluggy.
    let transacoes: TransacaoPluggy[];

    if (event === 'transactions/created') {
      if (!evento.accountId) {
        log.etapa('created_sem_conta');
        return;
      }
      log.etapa('paginando', { esperadas: evento.transactionsCount ?? null });
      transacoes = await listarTransacoesCriadas(
        evento.accountId, evento.transactionsCreatedAtFrom, log,
      );
    } else {
      const ids = evento.transactionIds ?? [];
      if (!ids.length) {
        log.etapa('updated_sem_ids');
        return;
      }
      log.etapa('buscando', { n: ids.length });
      transacoes = [];
      for (let i = 0; i < ids.length; i += PARALELISMO) {
        const lote = await Promise.all(
          ids.slice(i, i + PARALELISMO).map(async (id) => {
            try {
              return await buscarTransacao(id);
            } catch (e) {
              // ⚠️ Uma transacao que falha nao derruba o lote: a Pluggy reenvia o evento, e o
              // upsert torna a segunda passagem inofensiva.
              log.falha('transacao', e);
              return null;
            }
          }),
        );
        for (const t of lote) if (t) transacoes.push(t);
      }
    }

    const linhas = await Promise.all(transacoes.map((t) => paraLinha(t, userId, itemId)));
    await gravarTransacoes(linhas);
    log.etapa('gravadas', { n: linhas.length });
    return;
  }

  // Eventos de pagamento e de conector chegam porque o webhook e registrado com `event: "all"`,
  // que e o que cobre os cinco obrigatorios num registro so. Ignorar e o comportamento correto.
  log.etapa('ignorado', { event });
}

/** ⚠️ `EdgeRuntime` existe no runtime do Supabase mas nao no tipo padrao do Deno. */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

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

  log.etapa('recebido', { event: evento.event, temItem: !!evento.itemId });

  // ⭐⭐ **Responde ANTES de processar, e nao e otimizacao -- e correcao.** A Pluggy espera 2XX
  // em 10 s e trata o estouro como falha, reenviando o evento. Uma sincronizacao inicial tem
  // centenas de transacoes e passa disso com folga: sem o `waitUntil`, o caminho feliz viraria
  // retry, e o retry chegaria enquanto o primeiro ainda roda.
  const trabalho = processar(evento, log).catch((e) => log.falha('processar', e));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(trabalho);
  else await trabalho; // fallback local, onde `EdgeRuntime` nao existe

  return new Response(JSON.stringify({ recebido: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
