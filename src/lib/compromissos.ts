import { cicloDeHoje, ciclosNoIntervalo, diaNoCiclo, getCycleKey, isoLocal, limitesDoCiclo, passoDeCiclo } from './ciclo';
import { centavos } from './dinheiro';

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

/**
 * Quantos ciclos fechados a comparação de ritmo exige para existir.
 *
 * ⭐ **Três, e não os dois do resto do sistema.** `PISO_COMPROMISSO` decide se um tipo
 * *existe*, e ali errar custa pouco. Aqui o número afirma qual é o **seu normal**: com dois
 * ciclos, um mês atípico desloca a referência pela metade, e a comparação vira ruído com cara
 * de fato.
 */
export const MINIMO_DE_CICLOS_DE_BASE = 3;

/**
 * Até quantos ciclos fechados entram na referência.
 *
 * ⭐ Hábito de um ano atrás não é o "normal" de hoje. A janela impede que uma mudança de vida
 * — mudou de cidade, trocou de mercado — fique diluída para sempre numa média longa demais.
 */
export const JANELA_DE_CICLOS = 6;

/**
 * Abaixo desta diferença a tela diz "em linha", e não um número.
 *
 * ⭐ Segue o precedente de `proximoAlivio`, que ignora diferenças abaixo de R$ 1 porque
 * "diferença de centavos não é alívio". Sem o piso, o card alternaria entre "R$ 2 acima" e
 * "R$ 3 abaixo" a cada importação, e um número que oscila sozinho ensina a ser ignorado.
 */
export const PISO_DE_RELEVANCIA = 500;

export interface RitmoDoCiclo {
  /** Quanto já saiu deste tipo neste ciclo, até hoje. */
  gastoAtual: number;
  /** Quanto costuma ter saído até o MESMO dia do ciclo. */
  referencia: number;
  /** `gastoAtual − referencia`. Positivo é acima do normal. */
  diferenca: number;
  /** Quantos ciclos fechados sustentam a referência — inclui os que ficaram em zero. */
  ciclosDeBase: number;
  /** O dia do ciclo corrente em que a leitura foi feita, 1-based. */
  diaDoCiclo: number;
  /** O comprimento do ciclo corrente, de 28 a 31. */
  diasDoCiclo: number;
  /** A diferença é pequena demais para valer um número. */
  emLinha: boolean;
}

/**
 * O gasto deste ciclo contra o que se costuma ter gasto **no mesmo ponto do ciclo**.
 *
 * ⭐⭐ **A referência exclui o ciclo corrente, e é o ponto inteiro da função.**
 * `amortizadoObservado` divide pelo número de ciclos observados, e o ciclo corrente parcial
 * entra ali como ciclo cheio — comparar o ciclo corrente contra uma média que o contém é
 * comparar um número consigo mesmo, e o viés puxa a média para baixo justamente na direção
 * que apagaria o alerta.
 *
 * ⭐ **"Mesmo ponto" é medido em dias decorridos, não em fração do ciclo.** Ciclos têm de 28 a
 * 31 dias; o dia 18 de um e o dia 18 do outro tiveram a mesma quantidade de oportunidades de
 * gastar. Converter para porcentagem compararia 58% com 64% e trocaria um eixo que a pessoa
 * vive por um que ela não vive.
 *
 * ⭐ **Ciclo vazio conta como zero — mas só a partir da primeira ocorrência.** Um mês sem
 * supermercado é informação sobre o hábito e tem de diluir a média. ⛔ Já um ciclo anterior à
 * primeira compra é ausência de dado, e contá-lo inventaria uma economia que não houve.
 *
 * ⚠️ Devolve `null` quando não há base suficiente. A tela precisa distinguir isso de "está
 * normal", senão o silêncio fica ambíguo.
 *
 * @param transacoes as do tipo, **já depuradas pela cascata** (`CompromissoDetectado.transacoes`)
 */
export function ritmoDoCiclo(
  transacoes: any[],
  cicloDia: number,
  hoje: Date = new Date(),
): RitmoDoCiclo | null {
  if (transacoes.length === 0) return null;

  const atual = cicloDeHoje(cicloDia, hoje);
  const { dias } = limitesDoCiclo(atual, cicloDia);
  // ⭐ A posição de hoje sai do mesmo primitivo que a das transações: uma régua só.
  const posicao = diaNoCiclo(isoLocal(hoje), null, cicloDia);

  const marcadas = transacoes.map(t => ({
    chave: getCycleKey(t.data, t.mes_fatura, cicloDia),
    dia: diaNoCiclo(t.data, t.mes_fatura, cicloDia),
    valor: centavos(t.valor),
  }));

  const primeira = marcadas.reduce((min, m) => (m.chave < min ? m.chave : min), marcadas[0].chave);
  const janela = passoDeCiclo(atual, -JANELA_DE_CICLOS);
  const base = ciclosNoIntervalo(
    primeira > janela ? primeira : janela,
    passoDeCiclo(atual, -1),
  );

  if (base.length < MINIMO_DE_CICLOS_DE_BASE) return null;

  // ⚠️ O mesmo predicado dos dois lados, inclusive no ciclo corrente. Sem o `dia <= posicao`
  // aqui, uma transação que o `mes_fatura` empurrou para o fim deste ciclo seria contada hoje
  // contra ciclos passados que só a contariam no fim — o único jeito de o número mentir.
  const acumulado = (chave: string) => marcadas.reduce(
    (soma, m) => (m.chave === chave && m.dia <= posicao ? soma + m.valor : soma), 0,
  );

  const referencia = Math.round(base.reduce((soma, k) => soma + acumulado(k), 0) / base.length);
  const gastoAtual = acumulado(atual);
  const diferenca = gastoAtual - referencia;

  return {
    gastoAtual: gastoAtual / 100,
    referencia: referencia / 100,
    diferenca: diferenca / 100,
    ciclosDeBase: base.length,
    diaDoCiclo: posicao,
    diasDoCiclo: dias,
    emLinha: Math.abs(diferenca) < PISO_DE_RELEVANCIA,
  };
}
