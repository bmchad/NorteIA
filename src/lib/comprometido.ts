/**
 * O comprometido do ciclo, nas três camadas de certeza.
 *
 * ⭐⭐ **Dono único do cálculo.** O painel de `/compromissos` e o card do Dashboard mostram
 * o mesmo número, e ele precisa ser o mesmo número — não dois cálculos que concordam por
 * enquanto. Foi tela calculando por conta própria que fez o Dashboard e o `/meses`
 * discordarem por um ano inteiro (D-007).
 *
 * ⛔ **As três camadas somam conjuntos disjuntos**, e é a cascata que garante isso: uma
 * transação reivindicada por uma regra não fica disponível para a seguinte. Se houver
 * dupla contagem, o número é errado — e é o número que a tese inteira defende.
 */
import { getCycleKey } from './ciclo';
import { agruparParcelas, comprometidoMensal, projecaoPorCiclo, type GrupoDeParcelas } from './parcelas';
import { comprometidoRecorrente, reivindicadasPorFixos } from './fixos-propostos';
import { agruparPorCompromisso, totalPrevisivel, type CompromissoDetectado } from './compromissos';

export interface Comprometido {
  /** Parcelas em andamento. Você deve, e tem data de fim. */
  contratado: number;
  /** Assinatura e mensalidade detectadas. Cancelável. */
  recorrente: number;
  /** Mercado, combustível. Você vai gastar, mas não é contrato. */
  previsivel: number;
  total: number;
  gruposEmAndamento: GrupoDeParcelas[];
  detectados: CompromissoDetectado[];
}

export function comprometidoDoCiclo(
  transacoes: any[],
  fixos: any[],
  tipos: any[],
  cicloDia: number,
): Comprometido {
  const gruposEmAndamento = agruparParcelas(transacoes)
    .filter(g => g.length < (g[0].parcela_total || 1));

  const fixosAtivos = fixos.filter(f => f.status === 'ativo');

  /**
   * ⭐⭐ **A cascata, atravessando as três camadas.** Cada transação pertence a uma camada
   * só; se duas contarem a mesma, o total infla. A ordem é a regra de desempate:
   *
   * ```
   * 0. compromisso_manual  → você declarou. Nada automático toma de volta
   * 1. parcela             → Contratado. Dívida contratada não é gasto previsível
   * 2. fixo ativo          → Recorrente. Mais específico e confirmado por você
   * 3. rótulo de tipo      → Previsível fica com o que sobrou
   * ```
   *
   * ⚠️ **Parcela sai antes até do passo 0.** `agruparParcelas` conta a compra inteira sem
   * olhar rótulo nenhum, então deixá-la também em Previsível é dupla contagem que a
   * declaração manual não conserta — ela só escolheria contar duas vezes de propósito.
   */
  const reivindicadas = reivindicadasPorFixos(fixosAtivos, transacoes);
  const paraPrevisivel = transacoes.filter(t => !t.parcela_total && !reivindicadas.has(t.id));

  const detectados = agruparPorCompromisso(
    paraPrevisivel,
    tipos,
    t => getCycleKey(t.data, t.mes_fatura, cicloDia),
  );

  const contratado = comprometidoMensal(gruposEmAndamento);
  const recorrente = comprometidoRecorrente(fixosAtivos);
  const previsivel = totalPrevisivel(detectados);

  return {
    contratado,
    recorrente,
    previsivel,
    total: contratado + recorrente + previsivel,
    gruposEmAndamento,
    detectados,
  };
}

export interface Alivio {
  /** Rótulo do ciclo, `Junho 2026`. */
  rotulo: string;
  /** O comprometido total a partir daquele ciclo. */
  valor: number;
  /** Quanto deixa de sair. */
  diferenca: number;
}

/**
 * Quando o comprometido cai, e para quanto.
 *
 * ⭐ **É a frase que só existe porque parcela tem fim conhecido** — e é a razão de as duas
 * telas terem virado uma. Para a assinatura não dá para dizer nada: ela pode durar para
 * sempre. Só a dívida contratada permite planejar.
 *
 * ⚠️ Recorrente e previsível entram como piso constante: eles não acabam sozinhos, então
 * o alívio vem inteiro da queda das parcelas.
 */
export function proximoAlivio(
  gruposEmAndamento: GrupoDeParcelas[],
  pisoConstante: number,
  cicloDia: number,
): Alivio | null {
  const projecao = projecaoPorCiclo(gruposEmAndamento, cicloDia, 12);
  if (projecao.length < 2) return null;

  const atual = projecao[0].valor;

  // O primeiro ciclo que sai mais barato que o corrente. Diferença de centavos não é
  // alívio: um card que anuncia "a partir de junho, R$ 0,40 a menos" é ruído.
  const alivio = projecao.slice(1).find(c => atual - c.valor >= 1);
  if (!alivio) return null;

  return {
    rotulo: alivio.rotulo,
    valor: alivio.valor + pisoConstante,
    diferenca: atual - alivio.valor,
  };
}
