/**
 * A folga da conta ao longo do ciclo — e quais cobranças mover para que ela não fique
 * negativa. É o cálculo do Mercado de Datas.
 *
 * ⭐⭐ **A pergunta que este módulo responde não é "você gasta demais?".** É outra, e melhor:
 * *dado que você ganha mais do que gasta, por que mesmo assim falta dinheiro no dia 3?* A
 * resposta é quase sempre a mesma — o salário cai no dia 8, os débitos automáticos caem no
 * dia 3, e ninguém precisa ganhar mais nem gastar menos: basta uma data mudar.
 *
 * ⛔ **Por isso a renda é um DEGRAU, não uma constante.** Se o dinheiro do mês já estivesse
 * na conta no dia 1, o único jeito de faltar seria gastar mais do que se ganha, e para isso
 * mover data nenhuma resolve — o cenário inteiro que justifica a tela desapareceria do
 * gráfico.
 *
 * ⛔ **E por isso é UMA curva cruzando o zero, não duas retas se cruzando.** Com
 * `A(d) = M·d/D` (gasto) e `B(d) = R − M·d/D` (renda descendo), o cruzamento cai em
 * `d = R·D/(2M)`. A insolvência de verdade é `A(d) = R`, em `d = R·D/M` — **o dobro**. Com
 * renda de R$ 5.000 e gasto de R$ 4.000 num ciclo de 30 dias, aquela conta alertaria no dia
 * 18,75 de um ciclo em que nunca falta nada.
 *
 * ⚠️⚠️ **`saldo` não é saldo bancário — o produto não tem esse dado —, mas ele TAMBÉM não pode
 * começar em zero.** Foi a primeira versão disto, e ela estava errada de um jeito que só
 * aparece quando se roda: com a curva partindo de zero e o salário caindo no dia 8, *qualquer*
 * gasto antes do dia 8 deixa a folga negativa. O déficit existiria em todo ciclo de todo
 * mundo, e nenhuma sugestão de data conseguiria fechá-lo — porque parte do que está antes do
 * salário é gasto difuso, que não se negocia.
 *
 * ⭐ O ponto de partida é **a sobra do ciclo anterior** (`saldoInicial`): o que entrou menos o
 * que saiu, no último ciclo fechado, com piso em zero. É medível, é explicável em uma frase
 * — "você fechou o mês passado com R$ 800, e é com isso que você vive até o dia 8" — e faz o
 * cruzamento do zero voltar a significar alguma coisa.
 *
 * 🔶 É uma **estimativa**, e ela subestima: quem mantém reserva parada tem folga maior do que
 * esta curva mostra, porque a sobra de dois ciclos atrás não é contada. Subestimar erra para o
 * lado do alarme falso, então o `PISO_DE_DEFICIT` existe para não transformar ruído em aviso.
 */
import { cicloDeHoje, diaNoCiclo, getCycleKey, isoLocal, limitesDoCiclo, passoDeCiclo } from './ciclo';
import { curvaDoCiclo } from './compromissos';
import { centavos } from './dinheiro';
import { lancamentosDoFixo, reivindicadasPorFixos } from './fixos-propostos';
import { cobrancasDoCiclo, dataNoCiclo, foraDoFimDeSemana } from './reserva';

/**
 * Os campos de `transactions` que este módulo lê — e só eles.
 *
 * ⭐ Estrutural, e não o `any[]` que o resto de `src/lib` usa: escrever o contrato aqui
 * documenta de que colunas a curva depende, e `any[]` continua atribuível a isto, então
 * nenhum chamador muda. ⚠️ `tipo` é o **instrumento** (cartão ou conta), nunca a direção do
 * dinheiro — essa é o sinal de `valor`.
 */
export interface TransacaoDaFolga {
  id: string;
  data: string;
  mes_fatura?: string | null;
  valor: unknown;
  pendente?: boolean | null;
  categoria_id?: string | null;
  nome?: string | null;
  apelido?: string | null;
  banco?: string | null;
  tipo?: string | null;
  parcela_total?: number | null;
}

/**
 * O que a curva lê de um gasto fixo.
 *
 * ⚠️ `dia`, `valor`, `periodicidade_meses`, `origem` e `assinatura` não são lidos aqui, mas
 * **são** por `cobrancasDoCiclo` e por `lancamentosDoFixo`, para onde a linha é repassada
 * inteira. Declarados para que o contrato desta entrada não pareça menor do que é.
 */
export interface FixoDaFolga {
  id: string;
  nome?: string | null;
  dia?: number | null;
  valor?: number | null;
  periodicidade_meses?: number | null;
  origem?: string | null;
  assinatura?: string | null;
}

/** Quantas ocorrências até uma fonte de renda ser considerada recorrente. */
export const PISO_DE_RENDA = 2;

/**
 * Abaixo desta folga negativa a tela não chama de buraco.
 *
 * ⭐ Segue `PISO_DE_RELEVANCIA` de `compromissos.ts`, e pelo mesmo motivo: um número que
 * oscila sozinho a cada importação ensina a ser ignorado. R$ 5 de estouro num ciclo inteiro
 * é ruído de arredondamento das médias, não um problema de data.
 */
export const PISO_DE_DEFICIT = 500;

export interface EventoDatado {
  /** O que aparece no marcador do gráfico. */
  rotulo: string;
  /** 1-based, dentro do ciclo corrente. */
  dia: number;
  /** Sempre positivo. `natureza` diz o sinal. */
  valor: number;
  natureza: 'renda' | 'debito' | 'fatura';
  /**
   * ⭐ Entra no mercado de datas?
   *
   * Só débito em conta. É a segunda metade do que `transactions.tipo` existe para dizer:
   * débito automático que cai no dia 20 vira multa no dia 21; a mesma cobrança no cartão não
   * vira nada — ela só espera a fatura. Oferecer ao recebedor a mudança de uma cobrança sem
   * penalidade gasta uma negociação real para resolver um problema que não existe.
   */
  movivel: boolean;
  /** A data escorregou para fora do fim de semana. */
  ajustada: boolean;
  /** Já saiu neste ciclo (`true`) ou ainda vai sair (`false`). */
  jaAconteceu: boolean;
}

export interface CurvaDeFolga {
  /** O comprimento do ciclo corrente, de 28 a 31. */
  dias: number;
  /** O dia de hoje dentro do ciclo, 1-based. */
  diaDeHoje: number;
  /** `saldo[0]` é o dia 1. Em reais, partindo de `saldoInicial`. */
  saldo: number[];
  /** A sobra estimada do ciclo anterior — de onde a curva parte. Nunca negativa. */
  saldoInicial: number;
  /** Os marcadores do gráfico, em ordem de dia. */
  eventos: EventoDatado[];
  /** Do primeiro dia negativo até o dia em que a folga volta a ficar ≥ 0. */
  deficit: { inicio: number; fim: number; pior: number; valorPior: number } | null;
  /** O pior momento do ciclo, mesmo quando não há déficit. */
  folgaMinima: { dia: number; valor: number };
  /** Quantos ciclos fechados sustentam a curva de gasto difuso. */
  ciclosDeBase: number;
  /** Cartões com lançamento no ciclo anterior e sem vencimento configurado no `/perfil`. */
  cartoesSemVencimento: { banco: string; valor: number }[];
  /** Quanto de cartão ficou de fora por não ter banco identificado. */
  semBanco: number;
}

export type ResultadoDaFolga =
  | { ok: true; curva: CurvaDeFolga }
  | { ok: false; motivo: 'sem-base'; ciclosDeBase: number }
  | { ok: false; motivo: 'sem-renda' };

export interface EntradaDaFolga {
  /** Todas as transações já aprovadas do usuário. */
  transacoes: TransacaoDaFolga[];
  /**
   * ⚠️⚠️ **Os fixos ativos, JÁ sem os que têm proposta de encerramento.** É o contrato de
   * `cobrancasDoCiclo`, e ele vale igual aqui: um fixo que parou de ser cobrado continuaria
   * derrubando a curva, e a tela diria "cai dia 18" ao lado de "sem cobrança há 3 ciclos".
   */
  fixosAtivos: FixoDaFolga[];
  /** `id` → `e_renda`, de `categories`. */
  categorias: { id: string; e_renda?: boolean | null }[];
  /** `{ banco, dia }` de `public.vencimentos`. */
  vencimentos: { banco: string; dia: number }[];
  cicloDia: number;
  hoje?: Date;
}

/** A mediana de uma lista não vazia. Robusta ao 13º e ao mês de bônus, que a média não é. */
function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[meio]
    : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2);
}

interface FonteDeRenda {
  /** Minúsculo, sem espaços nas pontas. É a chave do agrupamento, não o que se exibe. */
  nome: string;
  /**
   * O apelido como o usuário o vê.
   *
   * ⚠️ Guardado, e não recalculado a partir de `nome`. Recapitalizar com `\b` em JavaScript
   * quebra em acento: `/\b\p{L}/gu` transforma "salário" em "SalÁRio", porque a fronteira
   * antes do "á" conta como início de palavra.
   */
  rotulo: string;
  /** Dia típico dentro do ciclo, 1-based. */
  dia: number;
  /** Em centavos. */
  valor: number;
}

/**
 * As entradas recorrentes — o salário e o que se parecer com ele.
 *
 * ⭐⭐ **Agrupa só por NOME, nunca por nome + valor.** É a diferença em relação a
 * `auto-nome-valor` (`fixos-propostos.ts`): o valor de um gasto fixo é estável e por isso
 * serve de assinatura, mas o valor do salário muda todo mês — hora extra, bônus, faixa de
 * IR. Exigir valor igual faria o salário nunca ser detectado.
 *
 * ⚠️ **Renda é `categories.e_renda`, não `valor > 0`.** Estorno, reembolso e venda entram
 * positivos e não são dinheiro que se ganhou (D-025). Somá-los aqui inventaria uma entrada
 * mensal que não existe.
 *
 * 🔶 Duas fontes (salário + aluguel recebido) viram dois degraus. É o comportamento certo e
 * não custa nada a mais.
 */
export function fontesDeRenda(
  transacoes: TransacaoDaFolga[],
  categorias: { id: string; e_renda?: boolean | null }[],
  cicloDia: number,
): FonteDeRenda[] {
  const deRenda = new Set(categorias.filter(c => c.e_renda).map(c => c.id));
  if (deRenda.size === 0) return [];

  const porNome = new Map<string, { rotulo: string; ciclos: Set<string>; dias: number[]; valores: number[] }>();
  for (const t of transacoes) {
    if (!t.categoria_id || !deRenda.has(t.categoria_id)) continue;
    if (Number(t.valor) <= 0) continue;
    const nome = String(t.apelido || t.nome || '').trim().toLowerCase();
    if (!nome) continue;

    const grupo = porNome.get(nome)
      ?? { rotulo: String(t.apelido || t.nome), ciclos: new Set<string>(), dias: [], valores: [] };
    grupo.ciclos.add(getCycleKey(t.data, t.mes_fatura, cicloDia));
    grupo.dias.push(diaNoCiclo(t.data, t.mes_fatura, cicloDia));
    grupo.valores.push(centavos(t.valor));
    porNome.set(nome, grupo);
  }

  const fontes: FonteDeRenda[] = [];
  for (const [nome, g] of porNome) {
    // ⚠️ O piso conta CICLOS distintos, não lançamentos. Duas quinzenas do mesmo mês são uma
    // fonte observada uma vez, e tratá-las como duas afirmaria recorrência sem evidência.
    if (g.ciclos.size < PISO_DE_RENDA) continue;
    fontes.push({ nome, rotulo: g.rotulo, dia: mediana(g.dias), valor: mediana(g.valores) });
  }
  return fontes.sort((a, b) => b.valor - a.valor);
}

/**
 * As transações que sobram para a camada difusa — o "Previsível" da cascata.
 *
 * ⛔ **A cascata é a mesma de `comprometido.ts`, e tem de ser.** Uma transação pertence a uma
 * camada só (invariante 11, D-033): parcela sai antes de tudo, fixo ativo reivindica o que
 * ficou, e o resto é difuso. Contar a mesma transação como evento discreto *e* dentro da
 * curva média derrubaria o saldo duas vezes pelo mesmo dinheiro.
 *
 * ⭐ **E aqui há um quarto degrau, que só existe por causa do `tipo`:** gasto difuso feito no
 * cartão não sai da conta no dia da compra — ele anda na fatura. Ele sai desta curva e entra,
 * somado, no marcador da fatura.
 */
export function transacoesDifusas(
  transacoes: TransacaoDaFolga[],
  fixosAtivos: FixoDaFolga[],
): TransacaoDaFolga[] {
  const reivindicadas = reivindicadasPorFixos(fixosAtivos, transacoes);
  return transacoes.filter(t =>
    t.tipo !== 'credito'
    && Number(t.valor) < 0
    && !t.parcela_total
    && !reivindicadas.has(t.id),
  );
}

/** O instrumento de um fixo sai das transações que o originaram — `fixos` não tem a coluna. */
function fixoEhDeCartao(fixo: FixoDaFolga, transacoes: TransacaoDaFolga[]): boolean {
  const ocorrencias = lancamentosDoFixo(fixo, transacoes);
  if (ocorrencias.length === 0) return false;
  // Maioria simples: um fixo que migrou de conta para cartão no meio do histórico é
  // classificado pelo que ele é hoje, e o histórico recente pesa mais por ser mais numeroso.
  const noCartao = ocorrencias.filter(t => t.tipo === 'credito').length;
  return noCartao * 2 > ocorrencias.length;
}

export function curvaDeFolga({
  transacoes,
  fixosAtivos,
  categorias,
  vencimentos,
  cicloDia,
  hoje = new Date(),
}: EntradaDaFolga): ResultadoDaFolga {
  const cicloAtual = cicloDeHoje(cicloDia, hoje);
  const { dias } = limitesDoCiclo(cicloAtual, cicloDia);
  const diaDeHoje = diaNoCiclo(isoLocal(hoje), null, cicloDia);

  const aprovadas = transacoes.filter(t => t.pendente === false);

  const fontes = fontesDeRenda(aprovadas, categorias, cicloDia);
  if (fontes.length === 0) return { ok: false, motivo: 'sem-renda' };

  // ---------------------------------------------------------------------------------------
  // A componente difusa
  // ---------------------------------------------------------------------------------------
  const difusas = transacoesDifusas(aprovadas, fixosAtivos);
  const curvaDifusa = curvaDoCiclo(difusas, cicloDia, hoje);
  if (!curvaDifusa) {
    // Sem três ciclos fechados não se afirma qual é o "seu normal". Contar quantos existem é
    // o que deixa a tela dizer "faltam N" em vez de mostrar uma curva chutada.
    const chaves = new Set(difusas.map(t => getCycleKey(t.data, t.mes_fatura, cicloDia)));
    chaves.delete(cicloAtual);
    return { ok: false, motivo: 'sem-base', ciclosDeBase: chaves.size };
  }

  /**
   * O difuso acumulado até cada dia: medido no passado, projetado no futuro.
   *
   * ⭐ A emenda é no dia de hoje, e ela preserva o nível já observado: o futuro herda o
   * *formato* da média (`media[d] − media[hoje]`), não o *valor* dela. Quem gastou o dobro do
   * normal até hoje continua com o dobro no resto do ciclo, em vez de a curva dar um salto
   * para trás no dia seguinte.
   */
  const difusoAte = (d: number): number => {
    const i = d - 1;
    if (d <= diaDeHoje) return curvaDifusa.atual[i];
    const jaGasto = curvaDifusa.atual[diaDeHoje - 1];
    return jaGasto + Math.max(0, curvaDifusa.media[i] - curvaDifusa.media[diaDeHoje - 1]);
  };

  // ---------------------------------------------------------------------------------------
  // Os eventos discretos
  // ---------------------------------------------------------------------------------------
  const eventos: EventoDatado[] = [];

  // 1. Renda. Se a fonte já caiu neste ciclo, vale o que caiu de verdade — dia e valor.
  for (const fonte of fontes) {
    const desteCiclo = aprovadas.filter(t =>
      String(t.apelido || t.nome || '').trim().toLowerCase() === fonte.nome
      && getCycleKey(t.data, t.mes_fatura, cicloDia) === cicloAtual
      && Number(t.valor) > 0,
    );
    const caiu = desteCiclo.length > 0;
    eventos.push({
      rotulo: fonte.rotulo,
      dia: caiu ? Math.min(...desteCiclo.map(t => diaNoCiclo(t.data, t.mes_fatura, cicloDia))) : fonte.dia,
      valor: (caiu ? desteCiclo.reduce((s, t) => s + centavos(t.valor), 0) : fonte.valor) / 100,
      natureza: 'renda',
      movivel: false,
      ajustada: false,
      jaAconteceu: caiu,
    });
  }

  // 2. Débitos em conta. `cobrancasDoCiclo` já resolve periodicidade, âncora derivada e o
  //    ajuste de fim de semana no sentido que aquele fixo costuma escorregar.
  const doCartao = new Set(fixosAtivos.filter(f => fixoEhDeCartao(f, aprovadas)).map(f => f.id));
  const emConta = fixosAtivos.filter(f => !doCartao.has(f.id));
  const { pendentes, jaCairam } = cobrancasDoCiclo(emConta, aprovadas, cicloDia, hoje);
  for (const c of [...jaCairam, ...pendentes]) {
    eventos.push({
      rotulo: String(c.fixo.nome || 'Cobrança'),
      dia: diaNoCiclo(c.data, null, cicloDia),
      valor: c.valor,
      natureza: 'debito',
      // ⭐ O único tipo de evento que entra no mercado de datas.
      movivel: true,
      ajustada: c.ajustada,
      jaAconteceu: jaCairam.includes(c),
    });
  }

  // 3. As faturas. A que fecha no fim do ciclo N−1 é debitada DURANTE o ciclo N.
  const cicloAnterior = passoDeCiclo(cicloAtual, -1);
  const porBanco = new Map<string, number>();
  let semBanco = 0;
  for (const t of aprovadas) {
    if (t.tipo !== 'credito' || Number(t.valor) >= 0) continue;
    if (getCycleKey(t.data, t.mes_fatura, cicloDia) !== cicloAnterior) continue;
    const banco = String(t.banco ?? '').trim();
    if (!banco) { semBanco += centavos(t.valor); continue; }
    porBanco.set(banco, (porBanco.get(banco) ?? 0) + centavos(t.valor));
  }

  const cartoesSemVencimento: { banco: string; valor: number }[] = [];
  for (const [banco, total] of porBanco) {
    const config = vencimentos.find(v => v.banco === banco);
    // ⛔ Sem vencimento não se chuta um dia. O cartão fica de fora e a tela pede a
    // configuração — chutar produziria um aviso falso, pior que aviso nenhum.
    if (!config) { cartoesSemVencimento.push({ banco, valor: total / 100 }); continue; }

    const nominal = dataNoCiclo(cicloAtual, config.dia, cicloDia);
    // O banco adia o vencimento que cai em fim de semana; ele não antecipa a própria cobrança.
    const ajustada = foraDoFimDeSemana(nominal, 'adiar');
    const dia = diaNoCiclo(isoLocal(ajustada), null, cicloDia);
    eventos.push({
      rotulo: `Fatura ${banco}`,
      dia,
      valor: total / 100,
      natureza: 'fatura',
      // ⚠️ Não entra no mercado — mas por um motivo diferente do resto. A fatura É móvel, e é
      // a mais móvel de todas: é produto do próprio banco, e mudar o vencimento não depende
      // de negociar com recebedor nenhum. O que falta é a API, não a permissão. Ver §5 de
      // zz_implementation/ETAPA-1-NEW-IMP.md.
      movivel: false,
      ajustada: isoLocal(ajustada) !== isoLocal(nominal),
      jaAconteceu: dia < diaDeHoje,
    });
  }

  eventos.sort((a, b) => a.dia - b.dia || b.valor - a.valor);

  // ---------------------------------------------------------------------------------------
  // A curva
  // ---------------------------------------------------------------------------------------
  //
  // ⭐ De onde ela parte: a sobra do último ciclo fechado. `valor` é assinado, então a soma
  // simples de tudo já é "o que entrou menos o que saiu".
  //
  // ⚠️ **Cartão entra nesta soma**, ao contrário do resto do módulo. Aqui não se está
  // posicionando dinheiro no tempo, e sim fechando um ciclo inteiro: ao longo de um ciclo
  // completo, o total que entrou menos o que saiu é o mesmo, tenha a fatura sido paga naquele
  // mês ou no seguinte. Excluir o cartão inflaria a sobra pelo valor da fatura.
  //
  // ⛔ Piso em zero: um ciclo anterior deficitário não vira dívida carregada para dentro deste
  // — isso seria afirmar um cheque especial que ninguém mediu.
  const sobraAnterior = aprovadas.reduce(
    (soma, t) => (getCycleKey(t.data, t.mes_fatura, cicloDia) === cicloAnterior
      ? soma + Math.round(Number(t.valor) * 100)
      : soma),
    0,
  );
  const saldoInicial = Math.max(0, sobraAnterior) / 100;

  const saldo = montarSaldo(eventos, difusoAte, dias, saldoInicial);

  return {
    ok: true,
    curva: {
      dias,
      diaDeHoje,
      saldo,
      saldoInicial,
      eventos,
      deficit: janelaDeDeficit(saldo),
      folgaMinima: folgaMinima(saldo),
      ciclosDeBase: curvaDifusa.ciclosDeBase,
      cartoesSemVencimento,
      semBanco: semBanco / 100,
    },
  };
}

/**
 * `saldo(d) = saldoInicial + renda acumulada − (difuso acumulado + débitos acumulados)`.
 */
function montarSaldo(
  eventos: EventoDatado[],
  difusoAte: (d: number) => number,
  dias: number,
  saldoInicial: number,
): number[] {
  const saldo: number[] = [];
  for (let d = 1; d <= dias; d++) {
    let discreto = 0;
    for (const e of eventos) {
      if (e.dia > d) continue;
      discreto += e.natureza === 'renda' ? e.valor : -e.valor;
    }
    saldo.push(Math.round((saldoInicial + discreto - difusoAte(d)) * 100) / 100);
  }
  return saldo;
}

/**
 * Do primeiro dia negativo até o dia em que a folga volta a ficar ≥ 0.
 *
 * ⭐ **A janela é o que importa, não o ponto do cruzamento.** É dela que saem os candidatos a
 * mover: uma cobrança que cai *depois* de a folga já ter voltado ao positivo não participou
 * do buraco, e empurrá-la para a frente não fecha buraco nenhum — que é o que o desenho
 * original propunha.
 */
export function janelaDeDeficit(
  saldo: number[],
): { inicio: number; fim: number; pior: number; valorPior: number } | null {
  const inicio = saldo.findIndex(v => Math.round(v * 100) < -PISO_DE_DEFICIT);
  if (inicio === -1) return null;

  let fim = saldo.length - 1;
  for (let i = inicio + 1; i < saldo.length; i++) {
    if (saldo[i] >= 0) { fim = i - 1; break; }
  }

  let pior = inicio;
  for (let i = inicio; i <= fim; i++) if (saldo[i] < saldo[pior]) pior = i;

  return { inicio: inicio + 1, fim: fim + 1, pior: pior + 1, valorPior: saldo[pior] };
}

function folgaMinima(saldo: number[]): { dia: number; valor: number } {
  let i = 0;
  for (let d = 1; d < saldo.length; d++) if (saldo[d] < saldo[i]) i = d;
  return { dia: i + 1, valor: saldo[i] };
}

export interface Sugestao {
  /** A cobrança a mover. */
  evento: EventoDatado;
  /** Os dias que mantêm a curva **inteira** ≥ 0, em ordem crescente. */
  diasOfertados: number[];
  /** Mover esta sozinha já resolve o ciclo inteiro. */
  resolve: boolean;
  /** A folga mínima do ciclo depois de mover para `diasOfertados[0]`. */
  folgaResultante: number;
}

/**
 * Qual cobrança mover, e para quando.
 *
 * ⭐⭐ **Uma de cada vez, com a curva recalculada.** Se três débitos caem no dia 3 e o buraco é
 * de R$ 400, mover só o menor pode já resolver — sugerir os três pediria três negociações
 * para um problema que uma resolvia. E "mude **uma** data" é uma frase que se aceita; "mude
 * todas" é uma que se ignora.
 *
 * ⭐ **Entre os dias que funcionam, o mais cedo.** Empurrar para o fim do ciclo resolve no
 * papel e cria atraso na vida real; a data mais cedo que funciona é a que o recebedor tem
 * mais chance de aceitar.
 *
 * ⚠️ **Candidato é o que cai DENTRO da janela de déficit**, e só o que é `movivel` — débito em
 * conta. Cobrança de cartão não vira multa amanhã, ela apenas espera a fatura.
 *
 * ⚠️ **Cobrança que já saiu não é candidata.** O dinheiro foi; negociar a data dela seria
 * negociar o passado. Ela continua na curva, derrubando o saldo — só não se oferece mover.
 */
export function sugestaoDeData(curva: CurvaDeFolga, difusoAte?: (d: number) => number): Sugestao | null {
  const { deficit, eventos, dias, saldo, saldoInicial } = curva;
  if (!deficit) return null;

  // A componente difusa reconstruída a partir do saldo e dos eventos: `montarSaldo` é
  // inversível para ela, e assim a simulação não precisa que a página guarde a curva difusa.
  const difuso = difusoAte ?? ((d: number) => {
    let discreto = 0;
    for (const e of eventos) {
      if (e.dia > d) continue;
      discreto += e.natureza === 'renda' ? e.valor : -e.valor;
    }
    return saldoInicial + discreto - saldo[d - 1];
  });

  const candidatos = eventos.filter(e =>
    e.movivel && !e.jaAconteceu && e.dia >= deficit.inicio && e.dia <= deficit.fim,
  );
  if (candidatos.length === 0) return null;

  // O menor primeiro: a menor cobrança que resolve é a negociação mais barata de conseguir.
  const ordenados = [...candidatos].sort((a, b) => a.valor - b.valor);

  let melhor: Sugestao | null = null;
  for (const alvo of ordenados) {
    const outros = eventos.filter(e => e !== alvo);
    const ofertados: number[] = [];
    // O alívio de cada destino, para não simular a mesma coisa duas vezes.
    let melhorMinimo = -Infinity;
    let melhorDestino = alvo.dia;

    for (let destino = 1; destino <= dias; destino++) {
      if (destino === alvo.dia) continue;
      const minimo = Math.min(...montarSaldo([...outros, { ...alvo, dia: destino }], difuso, dias, saldoInicial));
      if (Math.round(minimo * 100) >= -PISO_DE_DEFICIT) ofertados.push(destino);
      if (minimo > melhorMinimo) { melhorMinimo = minimo; melhorDestino = destino; }
    }

    if (ofertados.length > 0) {
      // ⭐ O mais cedo entre os que funcionam — não o que deixa a maior folga. Empurrar para
      // o fim do ciclo resolve no papel e cria atraso na vida real.
      const escolhido = ofertados[0];
      const folga = Math.min(...montarSaldo([...outros, { ...alvo, dia: escolhido }], difuso, dias, saldoInicial));
      return { evento: alvo, diasOfertados: ofertados, resolve: true, folgaResultante: folga };
    }

    // ⚠️ **Nenhum dia resolve sozinho — e aqui a regra se inverte.** Enquanto há solução, a
    // menor cobrança ganha: é a negociação mais barata de conseguir. Quando não há, o que se
    // oferece é o maior alívio possível, venha da cobrança que vier — sugerir mover R$ 420
    // de um buraco de R$ 2.660 porque era a primeira da fila é dar um conselho inútil com
    // cara de conselho. A tela dirá "isto ajuda, mas não basta".
    if (melhorDestino !== alvo.dia && (!melhor || melhorMinimo > melhor.folgaResultante)) {
      melhor = { evento: alvo, diasOfertados: [melhorDestino], resolve: false, folgaResultante: melhorMinimo };
    }
  }

  return melhor;
}
