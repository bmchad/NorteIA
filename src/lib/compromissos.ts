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
  const curva = curvaDoCiclo(transacoes, cicloDia, hoje);
  if (!curva) return null;

  // ⭐ Uma leitura da curva, no dia de hoje. O cálculo em si não mora mais aqui — é o mesmo
  // motivo da D-007: duas implementações da mesma média divergem sem ninguém notar.
  const i = curva.diaDoCiclo - 1;
  const gastoAtual = curva.atual[i];
  const referencia = curva.media[i];

  // ⚠️⚠️ **A subtração volta para centavos inteiros antes de virar reais.** `16,29 − 0` em
  // ponto flutuante dá `16.289999999999992`, e `diferenca` é número exibido: subtrair dois
  // valores já divididos por 100 introduz um resto que a versão anterior não tinha, porque
  // ela subtraía centavos e dividia uma vez só. `Math.round(x * 100)` recupera o inteiro
  // exato, já que os dois lados saíram de um `Math.round` em centavos.
  const emCentavos = Math.round(gastoAtual * 100) - Math.round(referencia * 100);

  return {
    gastoAtual,
    referencia,
    diferenca: emCentavos / 100,
    ciclosDeBase: curva.ciclosDeBase,
    diaDoCiclo: curva.diaDoCiclo,
    diasDoCiclo: curva.diasDoCiclo,
    // `PISO_DE_RELEVANCIA` está em centavos, como esta diferença.
    emLinha: Math.abs(emCentavos) < PISO_DE_RELEVANCIA,
  };
}

export interface CurvaDoCiclo {
  /**
   * O acumulado **médio** dos ciclos de base, um valor por dia do ciclo, em reais.
   * `media[0]` é o dia 1. Monótona não decrescente, porque é acumulado.
   */
  media: number[];
  /**
   * O acumulado do ciclo **corrente**, no mesmo formato.
   *
   * ⚠️ Depois de `diaDoCiclo` ele fica plano: o ciclo corrente não tem dado de amanhã, e
   * inventá-lo aqui seria projeção disfarçada de medição. Quem quiser projetar o resto do
   * ciclo compõe `atual[hoje] + (media[d] − media[hoje])` — mas essa é uma decisão de quem
   * chama, não deste módulo.
   */
  atual: number[];
  /** Quantos ciclos fechados sustentam a média — inclui os que ficaram em zero. */
  ciclosDeBase: number;
  /** O dia do ciclo corrente em que a leitura foi feita, 1-based. */
  diaDoCiclo: number;
  /** O comprimento do ciclo corrente, de 28 a 31. `media.length === diasDoCiclo`. */
  diasDoCiclo: number;
}

/**
 * A curva de gasto acumulado ao longo do ciclo — a média dos ciclos passados, dia a dia.
 *
 * ⭐⭐ **É `ritmoDoCiclo` generalizada de um dia para o ciclo inteiro**, e ele passou a ser
 * uma leitura desta. Existe porque o Mercado de Datas precisa da forma da curva, não de um
 * ponto: ninguém gasta em linha reta — há pico no começo do ciclo, vale no meio, mercado no
 * fim de semana —, e uma reta de 0 até a média inventaria um formato que os dados não têm.
 *
 * Os três cuidados que já estavam em `ritmoDoCiclo` continuam valendo, e são o motivo de
 * este cálculo não ser duas linhas de `reduce` na tela:
 *
 * ⭐⭐ **A base exclui o ciclo corrente.** `amortizadoObservado` divide pelo número de ciclos
 * observados e o corrente parcial entra ali como ciclo cheio — comparar o ciclo corrente
 * contra uma média que o contém é comparar um número consigo mesmo, e o viés puxa a média
 * para baixo justamente na direção que apagaria o alerta.
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
 * ⚠️ **O comprimento do vetor é o do ciclo CORRENTE.** Um ciclo de base com 31 dias tem um dia
 * 31 que o corrente de 30 não tem, e ele é descartado — no dia 30 daquele ciclo aquela compra
 * ainda não havia acontecido. O contrário — um ciclo de base mais curto — não deixa buraco,
 * porque o acumulado do último dia dele já é o total, e é o que os dias seguintes repetem.
 *
 * @param transacoes as do tipo, **já depuradas pela cascata** (`CompromissoDetectado.transacoes`)
 */
export function curvaDoCiclo(
  // Estrutural, e não `any[]` como o resto do módulo: são os três únicos campos que a conta
  // lê, e escrevê-los aqui documenta o contrato sem exigir um tipo de transação que o
  // projeto ainda não tem. `any[]` continua atribuível a isto, então quem chama não muda.
  transacoes: { data: string; mes_fatura?: string | null; valor: unknown }[],
  cicloDia: number,
  hoje: Date = new Date(),
): CurvaDoCiclo | null {
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

  /**
   * O acumulado de um ciclo até cada dia, em centavos — um passo só sobre as transações.
   *
   * ⚠️ **O corte por dia é `<= d`, e é o mesmo predicado em todos os ciclos.** Era o
   * `dia <= posicao` de `ritmoDoCiclo`, e a razão dele não mudou: sem ele, uma transação que
   * o `mes_fatura` empurrou para o fim deste ciclo seria contada hoje contra ciclos passados
   * que só a contariam no fim — o único jeito de o número mentir.
   */
  const acumuladoPorDia = (chave: string): number[] => {
    const porDia = new Array<number>(dias).fill(0);
    for (const m of marcadas) {
      if (m.chave !== chave) continue;
      // ⚠️⚠️ **Dia além do fim do ciclo corrente é DESCARTADO, não dobrado no último dia.**
      // Um ciclo de base com 31 dias tem um dia 31 que o corrente de 30 não tem — e no dia 30
      // daquele ciclo aquela compra ainda não havia acontecido. Somá-la ao dia 30 inflaria a
      // referência com dinheiro que, no ponto comparado, ainda não tinha saído. Era o que o
      // `dia <= posicao` de `ritmoDoCiclo` já fazia; preservar isso é o que mantém o número
      // do /compromissos idêntico ao de antes.
      if (m.dia > dias) continue;
      porDia[m.dia - 1] += m.valor;
    }
    for (let d = 1; d < dias; d++) porDia[d] += porDia[d - 1];
    return porDia;
  };

  const soma = new Array<number>(dias).fill(0);
  for (const chave of base) {
    const c = acumuladoPorDia(chave);
    for (let d = 0; d < dias; d++) soma[d] += c[d];
  }

  const doCicloAtual = acumuladoPorDia(atual);

  return {
    media: soma.map(v => Math.round(v / base.length) / 100),
    // ⚠️ Plano depois de hoje: o acumulado repete o último valor conhecido porque não há
    // transação futura, não porque o gasto tenha parado. Ver o comentário do campo.
    atual: doCicloAtual.map((v, d) => (d < posicao ? v : doCicloAtual[posicao - 1]) / 100),
    ciclosDeBase: base.length,
    diaDoCiclo: posicao,
    diasDoCiclo: dias,
  };
}
