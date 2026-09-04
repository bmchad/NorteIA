/**
 * Detecção de gastos recorrentes, em cascata.
 *
 * ⭐⭐ As regras não competem pela mesma transação: **reivindicam em ordem**, e cada uma só
 * olha o que sobrou. Sem isso a mesma transação aparece em duas propostas e o painel conta
 * o mesmo dinheiro duas vezes — que é o erro que invalida o número inteiro.
 *
 * ```
 * 0. atribuição manual  → o usuário declarou. Nada automático sobrepõe
 * 1. 1.b nome + valor   → o nome é o sinal mais forte
 * 2. 1.a valor + dia    → só o que a 1.b não reivindicou
 * 3. rótulo de compromisso → o resto (fora deste módulo, ver compromissos.ts)
 * ```
 *
 * ⚠️ Parcelas ficam de fora de tudo: o comprometido delas já é contado por
 * `src/lib/parcelas.ts`, e contá-lo de novo como fixo seria dupla contagem.
 *
 * ⭐⭐ **Há uma quinta detecção neste arquivo, e ela NÃO é degrau da cascata:**
 * `detectarPropostasDeData` — nome estável, dia ±1, **valor variável** (a conta de luz). Ela existe
 * para o Mercado de Datas, onde o que importa é a data, e **não reivindica transação nenhuma**: lê
 * as mesmas linhas em paralelo e não mexe no comprometido. ⛔ Promovê-la a degrau da cascata tiraria
 * dinheiro da camada Previsível, que é onde essas transações são contadas hoje.
 */
import { getCycleKey } from './ciclo';
import { JANELA_DE_CICLOS } from './compromissos';
import { mesmoValor } from './dinheiro';

/**
 * Ocorrências mínimas para virar proposta de gasto fixo.
 *
 * ⚠️ **Dois, e não três como o resto do produto.** A memória de categoria e o compromisso
 * previsível continuam em 3. Aqui o sinal é mais forte: nome igual, valor igual e dia
 * próximo repetindo é assinatura, e esperar a terceira cobrança atrasa em um mês inteiro o
 * aviso de um gasto que já está em curso.
 *
 * ⚠️ **O que se perde:** com duas ocorrências há **um único intervalo** para deduzir a
 * cadência. Duas cobranças com três meses de distância viram "trimestral" a partir de uma
 * observação só. `periodicidadeDe` recusa intervalos irregulares, mas com uma amostra não há
 * irregularidade para detectar.
 */
export const PISO = 2;

/**
 * Ocorrências a partir das quais a proposta de **criação** é aceita sozinha.
 *
 * ⭐ Duas ocorrências levantam a hipótese; três a confirmam. Perguntar de novo o que já se
 * repetiu três vezes é transformar em trabalho o que o produto deveria resolver — e uma fila
 * de propostas óbvias é o que faz a pessoa parar de revisar e abandonar o comprometido pela
 * metade.
 *
 * ⛔ **Só `criar`.** Correção e encerramento mexem no que você já aceitou, e mudar ou
 * desligar um gasto sem perguntar é de outra categoria de erro.
 */
export const PISO_AUTO = 3;

/** Tolerância de dia: débito automático cai em dia útil e escorrega. */
const TOLERANCIA_DIA = 2;

/**
 * Tolerância de dia da detecção por **nome**, para o Mercado de Datas.
 *
 * ⚠️ **Um, e não os dois de `TOLERANCIA_DIA`.** Aquela acompanha um valor exato, que já é uma
 * evidência forte por si — pode se permitir ser frouxa no dia. Esta é a única regra que não exige
 * valor nenhum, então o dia é metade do sinal que ela tem: afrouxar aqui é aceitar qualquer coisa
 * que aconteça "mais ou menos naquela época do mês".
 */
const TOLERANCIA_DIA_NOME = 1;

export type Natureza = 'criar' | 'corrigir' | 'encerrar';

export interface PropostaDeFixo {
  natureza: Natureza;
  /** `auto-nome-valor` (1.b) ou `auto-valor-dia` (1.a). */
  origem: string;
  nome: string;
  valor: number;
  dia: number;
  periodicidade_meses: number;
  /** Os lançamentos que geraram a proposta. Sem eles, aceitar é chute. */
  evidencia: any[];
  assinatura: string;
  /** Só em `corrigir` e `encerrar`: a linha de `fixos` que a proposta atinge. */
  fixoId?: string;
  /**
   * Só em `corrigir`: o nome e o valor que o fixo tem **hoje**.
   *
   * ⭐ A proposta guarda o próprio nome, e estes dois dizem o que ela corrige. Antes o nome
   * do fixo sobrescrevia o da proposta, e o card exibia "Seguro CTP Pix" com evidência de
   * "SEGURO CARTAO CTP" — o casamento errado ficava invisível justamente na tela que serve
   * para julgá-lo.
   */
  nomeDoFixo?: string;
  /** Só em `corrigir`: sem o valor antigo ao lado do novo, não dá para julgar a correção. */
  valorAtual?: number;
  /**
   * Só em `encerrar`: há quantos ciclos a cobrança não aparece.
   *
   * ⭐ O card mostra o número, não um veredito. "Sem cobrança há 2 ciclos" é um fato que
   * você confere; "cancelado" é uma conclusão que o produto não tem como ter.
   */
  silencioCiclos?: number;
}

const abs = (t: any) => Math.abs(Number(t.valor) || 0);
const diaDe = (t: any) => parseInt(String(t.data).split('-')[2], 10);

/** Elegível: confirmada, saída, e não parcelada. */
function elegivel(t: any): boolean {
  return t.pendente === false && Number(t.valor) < 0 && !t.parcela_total;
}

/**
 * Mede o intervalo entre ocorrências, em meses.
 *
 * ⭐⭐ Detectar recorrência e medir cadência são o mesmo passo, nunca dois. Sem isso, uma
 * cobrança trimestral que aparece 12 vezes em 3 anos é lida como mensal — e o painel, cujo
 * objetivo é dizer quanto sai por mês, infla o comprometido em três vezes.
 *
 * Devolve `null` quando o intervalo não é regular: três cobranças iguais em meses
 * aleatórios são coincidência, não assinatura.
 */
export function periodicidadeDe(ocorrencias: any[], cicloDia: number): number | null {
  const chaves = [...new Set(ocorrencias.map(t => getCycleKey(t.data, t.mes_fatura, cicloDia)))].sort();
  if (chaves.length < 2) return null;

  const absoluto = chaves.map(k => {
    const [ano, mes] = k.split('-').map(Number);
    return ano * 12 + (mes - 1);
  });

  const saltos: number[] = [];
  for (let i = 1; i < absoluto.length; i++) saltos.push(absoluto[i] - absoluto[i - 1]);

  const media = saltos.reduce((a, b) => a + b, 0) / saltos.length;
  const arredondado = Math.max(1, Math.round(media));

  // Irregular: algum intervalo foge mais de um mês da média.
  if (saltos.some(s => Math.abs(s - arredondado) > 1)) return null;
  return arredondado;
}

/** A moda dos dias observados — o dia que a proposta carrega. */
function diaTipico(ocorrencias: any[]): number {
  const contagem = new Map<number, number>();
  for (const t of ocorrencias) {
    const d = diaDe(t);
    contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * A direção do ajuste de dia útil, inferida do histórico.
 *
 * Débito que cai em fim de semana escorrega para um lado só, e qual lado é do banco.
 * ⭐ Sem histórico suficiente, **antecipar** — errar para antes avisa cedo demais, errar
 * para depois avisa tarde demais, e só o segundo custa juros.
 */
export function ajusteDeDia(ocorrencias: any[]): 'adiar' | 'antecipar' {
  const tipico = diaTipico(ocorrencias);
  let antes = 0;
  let depois = 0;
  for (const t of ocorrencias) {
    const d = diaDe(t);
    if (d < tipico) antes++;
    else if (d > tipico) depois++;
  }
  return depois > antes ? 'adiar' : 'antecipar';
}

/**
 * Uma transação, reduzida ao que decide se ela é de um fixo.
 *
 * ⛔ **Não tem apelido de propósito.** O apelido é rótulo de exibição — a IA gera um por
 * transação e o usuário edita à mão —, e usá-lo como chave foi o defeito que fez um fixo com
 * quatro cobranças no banco mostrar uma só.
 */
interface Candidato {
  /** O nome **cru** do extrato. É por ele que a detecção agrupou. */
  nome: string;
  valor: number;
  dia: number;
}

/**
 * ⭐⭐ **"Isto é o mesmo compromisso que aquele fixo?"** — a pergunta, com um dono só.
 *
 * Ela aparece em dois lugares: quais lançamentos um fixo explica (`lancamentosDoFixo`) e se
 * uma proposta se refere a um fixo que já existe (`casarComFixo`). Eram duas respostas
 * diferentes, e a divergência produzia um erro concreto: duas cobranças distintas no mesmo
 * dia — `SEGURO CTP PIX` de R$ 5,00 e `SEGURO CARTAO CTP` de R$ 3,90 — viravam uma
 * "correção de valor" uma da outra.
 *
 * ⭐⭐ **A chave é a assinatura, não o nome.** `fixos.nome` guarda o **apelido** — é o que se
 * lê melhor no card ("Seguro Cartão Inter" em vez de "SEGURO CARTAO CTP") —, mas a detecção
 * agrupou pelo nome **cru**, e a assinatura é calculada dele. Casar pelo nome de exibição fez
 * um fixo com quatro cobranças no banco mostrar **uma**: as outras três tinham o mesmo nome
 * cru e apelidos diferentes.
 *
 * ⭐ Reusar `assinaturaDe` nos dois lados é o ponto. Se um deles montar a chave à mão, ela
 * volta a divergir — e foi assim das duas vezes (ver L-006).
 *
 * | `origem` | casa por |
 * |---|---|
 * | `auto-valor-dia` | **valor e dia** — esta regra existe para cobranças cujo nome muda entre faturas, então nome não serve |
 * | com `assinatura` | ⭐ **a própria assinatura**, recalculada a partir do nome cru da transação |
 * | `manual` (sem assinatura) | o **nome digitado**, que o formulário pede exato |
 *
 * ⛔ **Dia sozinho deixou de ser a regra geral.** Era, por `OR`, e com tolerância de dois
 * dias isso fazia quaisquer dois fixos mensais vizinhos casarem — arbitrariamente, já que
 * quem vencia era o primeiro do array.
 *
 * ⚠️ Fixo manual antigo, com nome amigável, não casa com nada. É o comportamento certo: a
 * cobrança real ganha proposta própria, visível, em vez de virar uma correção silenciosa.
 *
 * ⚠️ **O valor nunca entra**, e pelo mesmo motivo de sempre: uma mensalidade que subiu
 * continua sendo do mesmo fixo. Exigir valor a tiraria dele e a jogaria para a camada de
 * baixo (dupla contagem), e mataria a proposta de correção — que existe justamente para
 * anunciar que o valor divergiu.
 */
function mesmoCompromisso(fixo: any, c: Candidato): boolean {
  if (fixo.origem === 'auto-valor-dia') {
    const diaBate = fixo.dia != null && Math.abs(Number(fixo.dia) - c.dia) <= TOLERANCIA_DIA;
    return diaBate && mesmoValor(fixo.valor, c.valor);
  }

  if (fixo.assinatura) {
    return assinaturaDe(c.nome, fixo.periodicidade_meses ?? 1) === fixo.assinatura;
  }

  const nome = String(fixo.nome ?? '').trim().toUpperCase();
  return !!nome && String(c.nome ?? '').trim().toUpperCase() === nome;
}

/**
 * Os lançamentos que um gasto fixo já explica.
 *
 * ⭐⭐ Responde a uma pergunta só, usada em dois lugares: o card do fixo mostra estes
 * lançamentos, e a camada Previsível precisa **não** contá-los. Ver a evidência e evitar a
 * dupla contagem são a mesma pergunta, então são a mesma função — com um dono só, as duas
 * respostas não têm como divergir.
 *
 * ⚠️ **Fixo criado à mão só casa se o nome for o do extrato** — é o que o formulário pede.
 * Nome amigável devolve vazio, e isso é honesto: cair no mesmo dia não é evidência de nada,
 * porque todo mundo compra alguma coisa no dia 3.
 */
export function lancamentosDoFixo(fixo: any, transacoes: any[]): any[] {
  return transacoes.filter(
    t => elegivel(t) && mesmoCompromisso(fixo, { nome: t.nome, valor: abs(t), dia: diaDe(t) }),
  );
}

/**
 * Os ids que os gastos fixos ativos reivindicam — o passo 1 da cascata entre camadas.
 *
 * ⛔ **A cascata não pode parar dentro da detecção de fixos.** Ela impede que duas regras
 * briguem pela mesma transação, mas não impedia que a mesma transação fosse contada por
 * Recorrente **e** por Previsível. Medido: uma academia de R$ 99,90 rotulada `academia` e
 * aceita como fixo virava R$ 199,80 no total — e o total é a tese inteira do produto.
 *
 * ⚠️ **`compromisso_manual` vence.** Se você arrastou a transação para um compromisso à mão,
 * nenhuma regra automática a toma de volta. Mesma precedência que já vale na importação.
 */
export function reivindicadasPorFixos(fixosAtivos: any[], transacoes: any[]): Set<string> {
  const ids = new Set<string>();
  for (const fixo of fixosAtivos) {
    for (const t of lancamentosDoFixo(fixo, transacoes)) {
      if (t.compromisso_manual === true) continue;
      ids.add(t.id);
    }
  }
  return ids;
}

/**
 * Prefixo que separa a recusa de uma **correção** da recusa de uma **criação**.
 *
 * ⚠️ Fossem a mesma assinatura, recusar "o valor certo é mesmo R$ 39,90" mataria também a
 * proposta de criar o fixo — ou o contrário.
 */
export const PREFIXO_CORRECAO = 'CORRIGIR::';

/** Assinatura para não repropor o recusado. ⚠️ Sem o valor: valor muda, a recusa cairia. */
export function assinaturaDe(nome: string, periodicidade: number): string {
  return `${nome.trim().toUpperCase()}::${periodicidade}`;
}

/**
 * Regra 1.b — mesmo nome e mesmo valor exato.
 *
 * ⭐ Prioritária porque o nome é o sinal mais forte. Valor exato, sem tolerância: a medição
 * mostrou que afrouxar compra pouco e custa a assinatura da recusa, que não poderia mais
 * incluir o valor.
 */
function detectarPorNomeEValor(transacoes: any[], cicloDia: number) {
  const grupos = new Map<string, any[]>();
  for (const t of transacoes) {
    const chave = `${t.nome}::${abs(t).toFixed(2)}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(t);
    grupos.set(chave, lista);
  }

  const propostas: PropostaDeFixo[] = [];
  const reivindicadas = new Set<any>();

  for (const lista of grupos.values()) {
    if (lista.length < PISO) continue;
    const periodicidade = periodicidadeDe(lista, cicloDia);
    if (periodicidade === null) continue;

    const base = lista[0];
    propostas.push({
      natureza: 'criar',
      origem: 'auto-nome-valor',
      nome: base.apelido || base.nome,
      valor: abs(base),
      dia: diaTipico(lista),
      periodicidade_meses: periodicidade,
      evidencia: lista,
      assinatura: assinaturaDe(base.nome, periodicidade),
    });
    lista.forEach(t => reivindicadas.add(t));
  }

  return { propostas, reivindicadas };
}

/**
 * Regra 1.a — mesmo valor, dia próximo, **só o que a 1.b não pegou**.
 *
 * ⭐ Existe para um caso só: cobrança cujo nome muda entre faturas. Se o nome fosse estável,
 * a 1.b já teria pego.
 */
function detectarPorValorEDia(transacoes: any[], cicloDia: number) {
  const grupos = new Map<string, any[]>();

  for (const t of transacoes) {
    const valor = abs(t).toFixed(2);
    const dia = diaDe(t);
    // Casa com um grupo de mesmo valor cujo dia esteja dentro da tolerância.
    const existente = [...grupos.keys()].find(k => {
      const [v, d] = k.split('::');
      return v === valor && Math.abs(Number(d) - dia) <= TOLERANCIA_DIA;
    });
    const chave = existente ?? `${valor}::${dia}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(t);
    grupos.set(chave, lista);
  }

  const propostas: PropostaDeFixo[] = [];
  for (const lista of grupos.values()) {
    if (lista.length < PISO) continue;
    const periodicidade = periodicidadeDe(lista, cicloDia);
    if (periodicidade === null) continue;

    const base = lista[0];
    propostas.push({
      natureza: 'criar',
      origem: 'auto-valor-dia',
      nome: base.apelido || base.nome,
      valor: abs(base),
      dia: diaTipico(lista),
      periodicidade_meses: periodicidade,
      evidencia: lista,
      assinatura: assinaturaDe(base.nome, periodicidade),
    });
  }
  return propostas;
}


/**
 * Uma cobrança de **valor variável** proposta para o Mercado de Datas.
 *
 * ⚠️ Não é `PropostaDeFixo`, e o tipo separado é de propósito: ela não vira gasto fixo, não entra
 * no comprometido e não tem `natureza` — só existe `criar`, porque correção e encerramento não
 * fazem sentido para algo cujo valor muda por definição.
 */
/**
 * Os campos de `transactions` que a detecção por nome lê.
 *
 * ⭐ Estrutural, e não o `any[]` que o resto deste módulo usa. Escrever o contrato deixa visível que
 * ela depende de `origem` — a coluna que separa a era planilha, e o corte que impede a regra de
 * transformar rótulo de categoria em cobrança. `any[]` continua atribuível, então nada muda para
 * quem chama.
 */
export interface TransacaoDaData {
  id: string;
  data: string;
  mes_fatura?: string | null;
  valor: unknown;
  pendente?: boolean | null;
  nome?: string | null;
  apelido?: string | null;
  origem?: string | null;
  parcela_total?: number | null;
}

export interface PropostaDeData {
  /** `assinaturaDe(nome cru, periodicidade)` — a identidade, **sem o valor**. */
  assinatura: string;
  /** O apelido, para exibir. */
  nome: string;
  /** Dia do MÊS em que costuma cair, como `fixos.dia`. */
  dia: number;
  /** A **média** das últimas ocorrências, não o valor de nenhuma delas. */
  valorMedio: number;
  periodicidade_meses: number;
  /** As transações que sustentam a proposta, da mais antiga para a mais nova. */
  evidencia: TransacaoDaData[];
}

/**
 * Cobranças de nome estável, dia estável e **valor variável** — a conta de luz.
 *
 * ⭐⭐ **Por que ela não é uma regra da cascata, e não pode virar uma.** A cascata de
 * `detectarPropostas` existe para impedir dupla contagem no **comprometido**: cada regra reivindica
 * transações e as tira das camadas seguintes. Esta detecção **não reivindica nada** — ela lê as
 * mesmas transações em paralelo e não muda o painel. Transformá-la em degrau da cascata tiraria
 * dinheiro da camada Previsível, que é onde essas transações são contadas hoje, e mudaria um número
 * que a decisão de produto manda não mexer.
 *
 * ⚠️⚠️ **Nada disto é aceito sozinho.** As outras regras têm `PISO_AUTO`; esta não tem equivalente,
 * e a medição diz por quê: o filtro pega a conta de internet (CV de 5%) e pega junto o posto de
 * gasolina (CV de 13% a 23%). Nenhum teto de dispersão separa os dois — 10% barraria os postos e
 * barraria também uma Enel sazonal, que é o caso de uso. A diferença entre "conta que eu devo" e
 * "compra que eu escolho" não está nos números, então quem decide é a pessoa.
 *
 * Os quatro cortes, e o que cada um evita:
 *
 * 1. **Nome cru idêntico** — o mesmo agrupamento da 1.b, sem o valor na chave.
 * 2. **Dia dentro de ±1** do típico (`TOLERANCIA_DIA_NOME`).
 * 3. ⛔ **No máximo uma ocorrência por ciclo.** É o corte que impede o supermercado de virar
 *    cobrança de data fixa, e ⚠️ **`periodicidadeDe` NÃO protege disso**: ela deduplica por chave
 *    de ciclo antes de medir os saltos, então cinco compras no mesmo mês são lidas como um ciclo só
 *    e a cadência sai "mensal". Medido na base: este corte levou 43 grupos candidatos para 28.
 * 4. ⛔ **`origem <> 'planilha'`.** Até 2026-04 o histórico veio de planilhas que guardavam só a
 *    categoria: o `nome` daquelas linhas é o rótulo ("Supermercado"), há uma por categoria por mês,
 *    e todas caem no mesmo dia porque o prompt preenche dia faltante com o `ciclo_dia`. Elas passam
 *    nos três cortes acima com folga. ⭐ **Esta é a primeira regra que dispararia nelas, porque é a
 *    primeira que abre mão do valor** — a 1.b e a 1.a nunca disparam ali, já que o total da
 *    categoria muda todo mês. Medido: sem este corte, **os 10 candidatos da base são todos
 *    planilha**, e nenhum é conta de consumo. → migration 20260828120000
 *
 * ⚠️ O filtro fica **só aqui**, e não em `elegivel`: mexer lá mudaria a 1.b e a 1.a, que não têm o
 * problema.
 *
 * @param fixos       para não propor o que já é gasto fixo ativo
 * @param decididos   as assinaturas já aceitas ou recusadas no mercado, que não voltam a aparecer
 */
export function detectarPropostasDeData(
  transacoes: TransacaoDaData[],
  fixos: { status?: string | null; assinatura?: string | null }[],
  decididos: { assinatura: string }[],
  cicloDia: number,
): PropostaDeData[] {
  const jaDecidido = new Set(decididos.map(d => d.assinatura));
  // ⭐ Fixo ativo casa por `assinatura`, que é nome + periodicidade sem valor — a mesma chave desta
  // detecção. É o dedup que substitui a FK que a ideia original previa: sem ele, uma Enel cadastrada
  // à mão em `fixos` reapareceria aqui como proposta.
  const doFixo = new Set(
    fixos.filter(f => f.status === 'ativo' && f.assinatura).map(f => f.assinatura as string),
  );

  const grupos = new Map<string, TransacaoDaData[]>();
  for (const t of transacoes) {
    if (!elegivel(t) || t.origem === 'planilha') continue;
    const nome = String(t.nome ?? '');
    if (!nome) continue;
    const lista = grupos.get(nome) ?? [];
    lista.push(t);
    grupos.set(nome, lista);
  }

  const propostas: PropostaDeData[] = [];

  for (const [nomeCru, lista] of grupos) {
    if (lista.length < PISO) continue;

    // ⛔ Uma por ciclo. Ver o corte 3 acima.
    const ciclos = new Set(lista.map(t => getCycleKey(t.data, t.mes_fatura, cicloDia)));
    if (ciclos.size !== lista.length) continue;

    // ⭐ Valor variando é o que define este grupo: se todos são iguais, a 1.b já o pegou, e propor
    // aqui seria oferecer duas vezes a mesma cobrança em duas telas.
    const valores = new Set(lista.map(t => abs(t).toFixed(2)));
    if (valores.size < 2) continue;

    // ⚠️⚠️ **A referência é a MEDIANA dos dias, não a moda — e a diferença rejeitava o caso real.**
    // `diaTipico` devolve a moda, e numa distribuição plana (dias 10, 11, 12 duas vezes cada) a moda
    // cai no primeiro da ordenação: o 10. Testar ±1 a partir dele exclui o dia 12, e o grupo é
    // recusado. Foi exatamente o que aconteceu com `INTERNET FIBRA 300MB` da base, que oscila entre
    // 10 e 12. A mediana está sempre dentro da janela e não depende de qual dia repetiu mais.
    const ordenados = lista.map(diaDe).sort((a, b) => a - b);
    const dia = ordenados[Math.floor(ordenados.length / 2)];

    // ⭐ "±1" é uma janela de TRÊS dias — o dia e seus vizinhos —, então a amplitude observada tem
    // de caber em `2 × TOLERANCIA_DIA_NOME`. Medir a distância de cada ocorrência à referência daria
    // o mesmo resultado, mas esconderia que o que importa é a largura do grupo.
    if (ordenados[ordenados.length - 1] - ordenados[0] > 2 * TOLERANCIA_DIA_NOME) continue;

    const periodicidade = periodicidadeDe(lista, cicloDia);
    if (periodicidade === null) continue;

    const base = lista[0];
    const assinatura = assinaturaDe(nomeCru, periodicidade);
    if (jaDecidido.has(assinatura) || doFixo.has(assinatura)) continue;

    // ⭐ Média das últimas `JANELA_DE_CICLOS` ocorrências, e não de todas: é a mesma razão escrita
    // na constante em `compromissos.ts` -- "hábito de um ano atrás não é o normal de hoje". Uma
    // conta de luz de 2024 não diz nada sobre a tarifa de agora.
    const recentes = [...lista]
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .slice(-JANELA_DE_CICLOS);
    const valorMedio = recentes.reduce((soma, t) => soma + abs(t), 0) / recentes.length;

    propostas.push({
      assinatura,
      nome: base.apelido || nomeCru,
      dia,
      valorMedio: Math.round(valorMedio * 100) / 100,
      periodicidade_meses: periodicidade,
      evidencia: recentes,
    });
  }

  return propostas.sort((a, b) => b.valorMedio - a.valorMedio);
}

/**
 * A cascata inteira, comparada com o que já existe em `fixos`.
 *
 * ⚠️ A detecção é derivada, não guardada: roda ao abrir a tela, sobre o histórico. O que
 * persiste em `fixos` é o que foi **decidido** — aceito, recusado, encerrado. Mesmo desenho
 * de D-013: não guarde o que dá para derivar.
 */
export function detectarPropostas(
  transacoes: any[],
  fixos: any[],
  cicloDia: number,
): PropostaDeFixo[] {
  const candidatas = transacoes.filter(elegivel);

  const porNome = detectarPorNomeEValor(candidatas, cicloDia);
  const sobraram = candidatas.filter(t => !porNome.reivindicadas.has(t));
  const porValor = detectarPorValorEDia(sobraram, cicloDia);

  const brutas = [...porNome.propostas, ...porValor];
  const saida: PropostaDeFixo[] = [];

  for (const p of brutas) {
    const casado = casarComFixo(p, fixos);

    // ⭐ A checagem de recusa depende da natureza, e a natureza só se conhece depois de
    // casar. Criação e correção têm assinaturas separadas de propósito: recusar "não é um
    // gasto fixo" não pode matar também "o valor certo é 39,90", nem o contrário.
    const assinatura = casado ? PREFIXO_CORRECAO + p.assinatura : p.assinatura;

    // ⛔ `encerrado` conta junto com `recusado`. Sem isso, encerrar um gasto fixo não
    // encerrava nada: o histórico continuava lá, a detecção repropunha na carga seguinte, e
    // com PISO_AUTO a proposta virava fixo ativo de novo. A decisão do usuário durava até o
    // próximo F5.
    //
    // ⚠️ E dispensar é para valer: se a cobrança voltar de verdade, quem reativa é o usuário,
    // na seção de dispensados. Ressuscitar sozinho desfaria uma decisão sem ele saber.
    const dispensada = (f: any) =>
      (f.status === 'recusado' || f.status === 'encerrado') && f.assinatura === assinatura;
    if (fixos.some(dispensada)) continue;

    if (!casado) {
      saida.push(p);
      continue;
    }
    // Casa e concorda: nada a propor.
    if (mesmoValor(casado.valor, p.valor) && Number(casado.dia) === p.dia) continue;

    saida.push({
      ...p,
      natureza: 'corrigir',
      fixoId: casado.id,
      nomeDoFixo: casado.nome,
      valorAtual: Number(casado.valor),
    });
  }

  return [...saida, ...detectarEncerramentos(transacoes, fixos, cicloDia)];
}

/**
 * Casa um candidato com uma linha de `fixos`.
 *
 * ⭐ A chave é periodicidade + valor + (dia ±2 **ou** nome idêntico), e o "ou" cobre as duas
 * origens com uma regra só: cadastro manual casa pelo dia (o nome você digitou, o extrato
 * diz outro), proposta aceita casa pelo nome (veio do extrato). Deduplicar só por nome
 * deixaria todo cadastro manual passar batido — que é o caso mais comum.
 */
function casarComFixo(p: PropostaDeFixo, fixos: any[]): any | null {
  return (
    fixos.find(f => {
      if (f.status === 'recusado' || f.status === 'encerrado') return false;
      if ((f.periodicidade_meses ?? 1) !== p.periodicidade_meses) return false;

      // ⭐ A proposta já carrega a própria assinatura, calculada do nome cru. Comparar as
      // duas é mais direto e mais correto que remontar a chave a partir de `p.nome`, que é
      // o apelido — e era por ali que a identidade se perdia.
      if (f.assinatura && p.assinatura) return f.assinatura === p.assinatura;

      return mesmoCompromisso(f, { nome: p.nome, valor: p.valor, dia: p.dia });
    }) ?? null
  );
}

/**
 * Fixo ativo sem lançamento há 2 ciclos além da periodicidade.
 *
 * ⭐ É o que impede a lista de envelhecer com assinatura cancelada: sem isso, o comprometido
 * mostra dinheiro que já parou de sair.
 */
function detectarEncerramentos(transacoes: any[], fixos: any[], cicloDia: number): PropostaDeFixo[] {
  const hoje = new Date();
  const cicloAtual = hoje.getFullYear() * 12 + hoje.getMonth();

  return fixos
    .filter(f => f.status === 'ativo' && f.origem !== 'manual')
    .flatMap(f => {
      // ⛔ Isto reimplementava o casamento por `f.nome` -- que é o APELIDO. Para um fixo
      // cujo apelido não é o nome do extrato, `relacionadas` vinha sempre vazio e o aviso de
      // encerramento NUNCA aparecia, sem erro nenhum. Um dono só para a pergunta.
      const relacionadas = lancamentosDoFixo(f, transacoes);
      if (relacionadas.length === 0) return [];

      const ultima = relacionadas
        .map(t => getCycleKey(t.data, t.mes_fatura, cicloDia))
        .sort()
        .pop()!;
      const [ano, mes] = ultima.split('-').map(Number);
      const silencio = cicloAtual - (ano * 12 + (mes - 1));

      // ⚠️ O limiar é `periodicidade + 1`, e não um ciclo: uma cobrança que escorrega alguns
      // dias sobre a virada do ciclo seria anunciada como cancelada. Alarme falso custa mais
      // que aviso tardio — quem cancela assinatura por engano perde o serviço.
      if (silencio <= (f.periodicidade_meses ?? 1) + 1) return [];

      return [{
        natureza: 'encerrar' as Natureza,
        origem: f.origem,
        nome: f.nome,
        valor: Number(f.valor),
        dia: Number(f.dia ?? 1),
        periodicidade_meses: f.periodicidade_meses ?? 1,
        evidencia: relacionadas.slice(-3),
        // ⚠️ Da assinatura do fixo, não do nome: `f.nome` é o apelido, e uma recusa
        // ancorada nele deixaria de casar assim que o apelido mudasse.
        assinatura: `ENCERRAR::${f.assinatura ?? assinaturaDe(f.nome, f.periodicidade_meses ?? 1)}`,
        fixoId: f.id,
        silencioCiclos: silencio,
      }];
    });
}

/** O comprometido mensal da camada "recorrente": amortizado pela periodicidade. */
export function comprometidoRecorrente(fixosAtivos: any[]): number {
  return fixosAtivos.reduce(
    (acc, f) => acc + Number(f.valor || 0) / Math.max(Number(f.periodicidade_meses) || 1, 1),
    0,
  );
}
