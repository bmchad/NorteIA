/**
 * Compromisso: dinheiro que já tem dono antes de você decidir qualquer coisa.
 *
 * Este módulo é o dono de duas coisas — a lista semente de tipos e a agregação por rótulo.
 * O cálculo mora aqui, e não dentro da tela, porque o painel de `/compromissos` e o card do
 * Dashboard somam exatamente estes números. Tela calculando por conta própria foi o que
 * fez o Dashboard e o `/meses` discordarem por um ano (D-007).
 */

/**
 * Quantas transações rotuladas até o tipo entrar na camada Previsível.
 *
 * ⭐ **Dois**, alinhado com o piso da detecção de recorrente. O 3 sobrevive só na memória de
 * categoria, onde ele decide sobrescrever a IA em silêncio — ali o custo de errar é o
 * usuário não entender por que a categoria mudou sozinha, e vale exigir mais.
 *
 * ⚠️ Aqui o custo de errar é outro: um tipo que demora a aparecer deixa o comprometido
 * **menor do que é**, e subestimar o que já tem dono é errar para o lado que diz que sobra
 * mais dinheiro do que sobra.
 */
export const PISO_COMPROMISSO = 2;

/** Teto de tipos que entram no prompt. Acima disso o modelo começa a forçar encaixe. */
export const TETO_TIPOS_ATIVOS = 25;

/**
 * Exemplos de transação por tipo.
 *
 * ⛔ O teto existe por causa da escala do prompt: com 25 tipos ativos, 10 exemplos cada já
 * são 250 linhas em toda importação. O banco também impõe (trigger `teto_exemplos`), porque
 * o front não é o único caminho até a tabela.
 */
export const TETO_EXEMPLOS = 10;

/**
 * ⚠️ **A lista dos 18 tipos semente NÃO mora mais aqui.** Ela foi para
 * `public.semear_conta`, na migration `20260830240000_semente_no_cadastro.sql`, junto com
 * as 28 categorias — porque a semente só tem sentido no instante em que a conta nasce, e
 * esse instante acontece no banco. Manter uma cópia aqui seria um segundo dono do mesmo
 * fato, e um dos dois envelheceria calado. ⭐ Os três testes que decidem o que entra na
 * lista estão escritos junto dela, no comentário da migration. → D-053
 */

export interface CompromissoDetectado {
  slug: string;
  titulo: string;
  /** Média por ciclo observada no histórico. */
  amortizadoObservado: number;
  /** O que o usuário fixou, quando fixou. É este que o painel soma. */
  valorFixado: number | null;
  transacoes: any[];
  ciclos: number;
  /** ⚠️ O observado divergiu do fixado o bastante para valer um aviso. */
  divergente: boolean;
}

/** Acima disto o observado e o fixado divergem o bastante para avisar. */
const DIVERGENCIA = 0.2;

/**
 * Agrupa as transações rotuladas por tipo e calcula o amortizado por mês.
 *
 * ⭐ Aqui periodicidade não importa: seis compras de mercado em 30 dias e um imposto por
 * trimestre produzem a mesma pergunta — quanto sai por mês, em média. O divisor é o número
 * de ciclos distintos em que o tipo apareceu, não o número de transações.
 *
 * ⛔ O valor fixado pelo usuário NUNCA é recalculado aqui. Valor que persegue a própria
 * média não pode discordar de quem o gerou: estourou três meses, a média sobe e a
 * "sugestão" sobe junto. O sistema avisa da divergência e a decisão fica com o usuário.
 */
export function agruparPorCompromisso(
  transacoes: any[],
  tipos: any[],
  chaveDeCiclo: (t: any) => string,
): CompromissoDetectado[] {
  const porSlug = new Map<string, any[]>();

  for (const t of transacoes) {
    if (!t.compromisso) continue;
    const lista = porSlug.get(t.compromisso) ?? [];
    lista.push(t);
    porSlug.set(t.compromisso, lista);
  }

  const detectados: CompromissoDetectado[] = [];

  for (const [slug, lista] of porSlug) {
    if (lista.length < PISO_COMPROMISSO) continue;

    const tipo = tipos.find(x => x.slug === slug);
    const ciclos = new Set(lista.map(chaveDeCiclo)).size || 1;
    const total = lista.reduce((acc, t) => acc + Math.abs(Number(t.valor) || 0), 0);
    const amortizadoObservado = total / ciclos;
    const valorFixado = tipo?.valor_mensal != null ? Number(tipo.valor_mensal) : null;

    detectados.push({
      slug,
      titulo: tipo?.titulo ?? slug,
      amortizadoObservado,
      valorFixado,
      transacoes: lista,
      ciclos,
      divergente:
        valorFixado != null &&
        valorFixado > 0 &&
        Math.abs(amortizadoObservado - valorFixado) / valorFixado > DIVERGENCIA,
    });
  }

  return detectados.sort((a, b) => valorDoCompromisso(b) - valorDoCompromisso(a));
}

/** O que o painel soma: o que o usuário fixou, ou o observado enquanto ele não fixou. */
export function valorDoCompromisso(c: CompromissoDetectado): number {
  return c.valorFixado ?? c.amortizadoObservado;
}

/** Soma da camada "previsível" do painel. */
export function totalPrevisivel(detectados: CompromissoDetectado[]): number {
  return detectados.reduce((acc, c) => acc + valorDoCompromisso(c), 0);
}
