/**
 * A sincronizacao COMPLETA e idempotente de um item: contas, todas as transacoes, identidade,
 * investimentos, emprestimos e movimentacoes.
 *
 * ⭐⭐ **Existe por causa de um item que recebeu 100 de 302 transacoes.** Ele nasceu sem
 * `clientUserId`; o `transactions/created` chegou quando ainda nao havia dono (`item_orfao`, tudo
 * descartado), e o registro pelo `pluggy-register-item` so veio no dia seguinte. **Nada refazia a
 * carga quando um item ganhava dono** -- os eventos da Pluggy sao avisos de mudanca, nao uma fila
 * que espera o dono aparecer. Rodar a carga inteira em todo `item/*` e em todo registro conserta
 * esse caso e, de brinde, transforma a sincronizacao diaria da Pluggy em RECONCILIACAO: evento
 * perdido (546, janela de deploy, 429) se conserta sozinho no proximo `item/updated`.
 *
 * ⭐ **Idempotente por construcao:** tudo e `upsert` pela chave da Pluggy, e o trigger
 * `open_finance_nao_regride` impede que uma listagem atrasada regrida uma linha que um
 * `transactions/updated` acabou de escrever. Rodar duas vezes da o mesmo banco.
 *
 * ⚠️ **Orcamento de tempo, conferido antes de cada etapa e de cada pagina** -- como `lib/gemini.ts`
 * no `ai-agents`. Estourar o teto de parede nao devolve erro: mata o worker, e nenhum log de fim
 * sai. O que nao coube fica `adiado`, e o resumo diz isso; a proxima sincronizacao completa.
 */

import type { Log } from '../_shared/log.ts';
import { type ContaComBanco, type ItemPluggy, listarContas, listarTransacoes } from './pluggy.ts';
import { gravarEmLotes, marcarSincronizado, paraLinha, porDono } from './gravar.ts';
import {
  sincronizarEmprestimos,
  sincronizarIdentidade,
  sincronizarInvestimentos,
  sincronizarMovimentos,
} from './produtos.ts';

/**
 *   ok            a etapa rodou inteira
 *   falhou        lancou -- o log tem o porque. As outras etapas rodaram do mesmo jeito
 *   adiado        o orcamento acabou antes ou durante. O que ja foi gravado fica
 *   indisponivel  o item nao tem o produto (404), ou a instancia nao tem o secret dele
 */
export type StatusEtapa = 'ok' | 'falhou' | 'adiado' | 'indisponivel';

export interface ResultadoEtapa {
  status: StatusEtapa;
  /** Quantos objetos DA PLUGGY a etapa gravou -- nao linhas: com dois donos, as linhas dobram. */
  n: number;
  /** A listagem veio com menos itens que o `total` da Pluggy. Nada foi apagado por causa dela. */
  incompleta?: true;
}

export type ResumoSincronizacao = Record<
  'contas' | 'transacoes' | 'identidade' | 'investimentos' | 'emprestimos' | 'movimentos',
  ResultadoEtapa
>;

export interface Orcamento {
  esgotado(): boolean;
}

/**
 * Folga entre "parar de comecar coisa nova" e o teto. Uma pagina buscada + um lote gravado cabem
 * nisto com sobra; o que nao pode e a ultima etapa comecar com 1 s de prazo.
 */
const MARGEM_MS = 10_000;

/** O resultado de uma etapa, com o que ela passa adiante para a seguinte. */
interface ResultadoComCarga extends ResultadoEtapa {
  contas?: ContaComBanco[];
  ids?: string[];
}

/**
 * Roda uma etapa isolada: confere o orcamento, loga ao ENTRAR (`_shared/log.ts`) e transforma
 * excecao em `falhou`. ⭐ Uma etapa que quebra nunca impede as outras -- emprestimo fora do ar nao e
 * motivo para deixar de gravar transacao.
 */
async function etapa(
  nome: string,
  orcamento: Orcamento,
  log: Log,
  trabalho: () => Promise<ResultadoComCarga>,
): Promise<ResultadoComCarga> {
  if (orcamento.esgotado()) {
    log.etapa(`${nome}.adiado`);
    return { status: 'adiado', n: 0 };
  }
  log.etapa(nome);
  try {
    return await trabalho();
  } catch (e) {
    log.falha(nome, e);
    return { status: 'falhou', n: 0 };
  }
}

const semCarga = ({ status, n, incompleta }: ResultadoComCarga): ResultadoEtapa =>
  incompleta ? { status, n, incompleta } : { status, n };

/**
 * Todas as transacoes de cada conta, pagina por pagina.
 *
 * ⭐ Cada pagina e mapeada, gravada e DESCARTADA antes de pedir a proxima -- o historico inteiro
 * nunca fica em memoria. ⚠️ Uma conta que falha nao derruba as outras: as que deram certo ficam
 * gravadas, e a etapa sai `falhou` para o resumo nao mentir.
 */
async function sincronizarTransacoes(
  itemId: string,
  contas: ContaComBanco[],
  donos: string[],
  log: Log,
  orcamento: Orcamento,
): Promise<ResultadoEtapa> {
  let n = 0;
  let falhas = 0;
  let adiado = false;

  for (const cb of contas) {
    if (adiado) break;
    const rotulo = cb.conta.subtype ?? cb.conta.type ?? null;
    const paginas = listarTransacoes(cb.conta.id);
    let pagina = 0;
    let daConta = 0;

    try {
      while (true) {
        if (orcamento.esgotado()) {
          adiado = true;
          break;
        }
        log.etapa('sync.transacoes.pagina', { conta: rotulo, pagina: pagina + 1 });
        const proxima = await paginas.next();
        if (proxima.done) break;
        pagina++;

        // ⚠️ A listagem e por `accountId`, entao isto nao deveria filtrar nada. Esta aqui pelo
        // mesmo motivo do escopo do `index.ts`: linha de outra conta nunca entra com este item.
        const doItem = proxima.value.filter((t) => t.accountId === cb.conta.id);
        const base = doItem.map((t) => paraLinha(t, cb, donos[0], itemId));
        await gravarEmLotes('open_finance', porDono(base, donos), 'user_id,pluggy_transaction_id', log);
        daConta += doItem.length;
      }
      log.etapa('sync.transacoes.conta', { conta: rotulo, paginas: pagina, n: daConta });
    } catch (e) {
      falhas++;
      log.falha('sync.transacoes.conta', e);
    } finally {
      // Fecha o gerador se saimos no meio (orcamento): nenhuma pagina a mais e pedida.
      await paginas.return(undefined);
    }
    n += daConta;
  }

  return { status: falhas ? 'falhou' : adiado ? 'adiado' : 'ok', n };
}

/**
 * Sincroniza o item inteiro para `donos`.
 *
 * ⛔ **`item` e o objeto da API**, buscado por quem chama -- nunca o payload de um evento. E dele
 * que saem o nome do banco e o `status` que autoriza a limpeza de investimentos e emprestimos.
 *
 * ⭐ **A ordem e de prioridade**, porque o orcamento pode acabar no meio: transacao primeiro (e o
 * que o produto usa hoje), movimentacao por ultimo (e a mais numerosa e a menos urgente).
 *
 * ⭐ `sincronizado_em` so e carimbado se NENHUMA etapa falhou, foi adiada ou veio incompleta.
 * `indisponivel` conta como sucesso: o produto nao existir nao e uma divida da sincronizacao.
 */
export async function sincronizarItem(
  itemId: string,
  item: ItemPluggy,
  donos: string[],
  log: Log,
  { orcamentoMs = 120_000 }: { orcamentoMs?: number } = {},
): Promise<ResumoSincronizacao> {
  if (!donos.length) throw new Error('sincronizarItem sem donos -- quem chama confere antes');

  const prazo = Date.now() + orcamentoMs;
  const orcamento: Orcamento = { esgotado: () => Date.now() > prazo - MARGEM_MS };
  log.etapa('sync', { donos: donos.length, status: item.status ?? null, orcamentoMs });

  // 1. Contas: uma chamada, e com o `item` ja buscado o par {conta, banco} sai sem cache nenhum.
  const contas = await etapa('sync.contas', orcamento, log, async () => {
    const lista = await listarContas(itemId);
    const banco = item.connector?.name ?? null;
    const doItem = lista.itens
      .filter((conta) => conta.itemId === itemId)
      .map((conta) => ({ conta, banco }));
    return {
      status: 'ok',
      n: doItem.length,
      ...(lista.completa ? {} : { incompleta: true as const }),
      contas: doItem,
    };
  });

  // 2. Transacoes. Sem contas nao ha o que listar, e o resumo herda o motivo.
  const listaContas = contas.contas;
  const transacoes = listaContas
    ? await etapa(
      'sync.transacoes', orcamento, log,
      () => sincronizarTransacoes(itemId, listaContas, donos, log, orcamento),
    )
    : { status: contas.status === 'adiado' ? 'adiado' as const : 'falhou' as const, n: 0 };

  // 3–5. Os produtos sem evento proprio.
  const identidade = await etapa(
    'sync.identidade', orcamento, log, () => sincronizarIdentidade(itemId, log),
  );
  const investimentos = await etapa(
    'sync.investimentos', orcamento, log, () => sincronizarInvestimentos(itemId, item, donos, log),
  );
  const emprestimos = await etapa(
    'sync.emprestimos', orcamento, log, () => sincronizarEmprestimos(itemId, item, donos, log),
  );

  // 6. Movimentacoes: dependem dos ids da etapa 4, e herdam o status dela quando nao os tem.
  const ids = investimentos.ids;
  const movimentos = ids
    ? await etapa(
      'sync.movimentos', orcamento, log,
      () => sincronizarMovimentos(itemId, ids, donos, log, orcamento),
    )
    : { status: investimentos.status, n: 0 };

  const resumo: ResumoSincronizacao = {
    contas: semCarga(contas),
    transacoes: semCarga(transacoes),
    identidade: semCarga(identidade),
    investimentos: semCarga(investimentos),
    emprestimos: semCarga(emprestimos),
    movimentos: semCarga(movimentos),
  };

  const limpa = Object.values(resumo).every(
    (r) => r.status === 'indisponivel' || (r.status === 'ok' && !r.incompleta),
  );
  if (limpa) {
    try {
      await marcarSincronizado(itemId, donos);
    } catch (e) {
      // O carimbo e observabilidade; perde-lo nao desfaz nada do que foi gravado.
      log.falha('sync.marcar', e);
    }
  }

  // ⛔ So contagens e status -- nunca valor, nome ou hash (ver `_shared/log.ts`).
  log.etapa('sync.fim', {
    marcado: limpa,
    ...Object.fromEntries(
      Object.entries(resumo).map(([k, r]) => [k, `${r.status}:${r.n}${r.incompleta ? ':incompleta' : ''}`]),
    ),
  });
  return resumo;
}
