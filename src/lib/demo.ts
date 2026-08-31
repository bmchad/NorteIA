/**
 * O `.csv` de demonstração de `/novos-registros`.
 *
 * ⭐⭐ **É um argumento, não um monte de dados.** Cada bloco abaixo existe para provar um
 * comportamento específico do produto: aceite automático, proposta, correção, silêncio,
 * amortização, parcela, estorno, entrada que não é renda. Tirar um bloco tira uma tese da
 * demonstração — e o roteiro está escrito em `ROTEIRO` justamente para que se saiba qual.
 *
 * ⭐ **As datas são relativas ao dia do download.** Um `.csv` fixo no repositório envelhece:
 * baixado daqui a seis meses mostraria histórico morto, nenhuma cobrança futura e o card
 * "deixe reservado" vazio — justamente o que a demo deveria exibir.
 *
 * ⛔ **Isto não semeia o banco.** O arquivo existe para **passar pelos agentes**: é o que o
 * torna um teste do pipeline inteiro, e não um preenchimento de tabela.
 */

/** Os seis ciclos FECHADOS terminam no mês anterior ao de hoje. */
const MESES = 6;

/**
 * Até que dia do mês corrente a demonstração vai.
 *
 * ⭐⭐ **O ciclo corrente entra pela metade de propósito**, e é isso que faz duas features do
 * produto saírem do mudo: o ritmo da camada Previsível ganha o que comparar (contra um ciclo
 * vazio ele só sabia dizer "abaixo do normal" pela referência inteira), e o card "deixe
 * reservado" passa a mostrar os dois estados lado a lado — o que já caiu e o que ainda vem.
 *
 * ⚠️ **A D-050 continua valendo para os ciclos FECHADOS.** O que a motivou foi a contagem de
 * cada bloco depender do dia do download, quebrando os limiares. Nenhum limiar mora no ciclo
 * corrente, e os blocos sensíveis ficam deliberadamente fora dele.
 *
 * ⚠️ Corte em dia de calendário, não em dia de ciclo: o gerador não sabe o `ciclo_dia` do
 * usuário. Com o padrão 1 — o único valor que uma conta nova tem — os dias 4 a 16 caem todos
 * no ciclo corrente. 🔶 Com `ciclo_dia` maior que 16 o efeito se perde.
 */
const DIA_DE_CORTE = 16;

export const NOME_DO_ARQUIVO = 'demo-whatchamacalliting.csv';

interface Linha {
  data: string;
  descricao: string;
  valor: number;
}

/**
 * O dia `dia` do k-ésimo mês do recorte, em `YYYY-MM-DD`.
 *
 * `k = 0` é o mês mais antigo e `k = MESES - 1` o mês anterior ao de hoje. ⚠️ **O mês
 * corrente fica de fora de propósito:** incluí-lo pela metade faria a quantidade de linhas
 * de cada bloco depender do dia em que a pessoa baixou o arquivo, e um bloco de duas
 * ocorrências viraria de uma — sem proposta nenhuma para mostrar.
 *
 * ⚠️ `k` negativo é válido e é assim que a data de compra das parcelas é calculada.
 *
 * ⚠️ Dia 31 em mês de 30 vira o último dia do mês: `new Date` com dia 31 em abril rolaria
 * para 01/05 e mudaria a linha de mês.
 */
function dia(hoje: Date, k: number, diaDoMes: number): string {
  const absoluto = hoje.getFullYear() * 12 + hoje.getMonth() - (MESES - k);
  const ano = Math.floor(absoluto / 12);
  const mes = absoluto % 12;
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  const d = Math.min(diaDoMes, ultimo);
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * O quanto o dia de cada ciclo escorrega do dia típico.
 *
 * ⭐⭐ **Débito automático não cai no mesmo número todo mês** — ele escorrega para o dia útil.
 * Sem essa variação, três mecanismos do produto ficam sem uso: a tolerância de ±2 dias no
 * agrupamento, a **moda** dos dias que decide o `dia` do gasto fixo, e o ajuste de fim de
 * semana. ⛔ E `ajusteDeDia` **nunca** devolvia `'adiar'`, porque empate resolve para
 * `'antecipar'` e o dado nunca desempatava.
 *
 * ⚠️ **Os três números foram escolhidos, não sorteados:**
 * · **amplitude 2** (de −1 a +1) porque a regra `valor + dia` compara todas as ocorrências
 *   contra a **primeira do array**, não entre si. Espalhar mais deixaria uma ponta fora da
 *   tolerância quando a âncora calhasse na outra ponta — e a órfã cairia na camada
 *   Previsível, virando dupla contagem;
 * · **o 0 aparecendo mais vezes** para a moda ser folgada. Moda instável faria o produto
 *   emitir uma proposta de *corrigir* cuja única diferença é o dia, porque ali a comparação
 *   de dia é por igualdade exata;
 * · **mais deslocamentos para cima que para baixo** (dois +1 contra um −1), que é o que faz
 *   `ajusteDeDia` finalmente devolver `'adiar'`.
 */
const OSCILACAO = [0, 1, -1, 0, 1, 0];

/**
 * O dia `diaDoMes` do mês corrente, ou `null` se ele ainda não chegou.
 *
 * ⛔⛔ **Nunca no futuro.** Gerar uma linha adiante de hoje seria pior que não gerar: um
 * lançamento datado à frente faz o gasto fixo contar como **"já caiu"** sem ter caído — a
 * regra é "existe transação deste fixo no ciclo?", e não "a data já passou?" — e ainda infla
 * os balanços com dinheiro que não saiu da conta.
 */
function diaCorrente(hoje: Date, diaDoMes: number): string | null {
  if (diaDoMes > Math.min(DIA_DE_CORTE, hoje.getDate())) return null;
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${hoje.getFullYear()}-${mes}-${String(diaDoMes).padStart(2, '0')}`;
}

/**
 * Aleatoriedade com semente.
 *
 * ⭐ **A semente é o ano e o mês, e de propósito não o dia.** Assim os seis ciclos fechados
 * saem idênticos em qualquer download do mesmo mês — só o recorte do ciclo corrente muda com
 * a data. Com o dia na semente, um defeito relatado ontem não se reproduzia hoje, porque o
 * arquivo inteiro vinha com outros valores.
 */
function sorteio(semente: number) {
  let estado = semente % 2147483647;
  if (estado <= 0) estado += 2147483646;
  return (min: number, max: number) => {
    estado = (estado * 16807) % 2147483647;
    const t = (estado - 1) / 2147483646;
    return min + t * (max - min);
  };
}

/** ⚠️ `Math.floor` sobre um sorteio que pode devolver o teto exato estouraria o índice. */
function escolha<T>(lista: T[], t: number): T {
  return lista[Math.min(lista.length - 1, Math.floor(t))];
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** O que cada bloco do arquivo existe para provar. Documentação, não código. */
export const ROTEIRO: string[] = [
  'Salário mensal — alimenta Renda e "o que sobra"',
  'Netflix, Spotify e academia — aceite automático (3+ ocorrências)',
  '⭐ A conta de R$ 94,90 com um nome diferente a cada mês — só a regra valor + dia a pega',
  'Dias que escorregam ±1 — a tolerância, a moda e o ajuste de fim de semana',
  'Curso de inglês em 2 meses — proposta, não aceite automático',
  'Internet que subiu de preço — proposta de correção de valor',
  'TV a cabo que sumiu — aviso de "sem cobrança há N ciclos"',
  'Seguro bimestral — amortização por mês, e o alerta no ciclo em que ele cai',
  'Plano odonto no dia 25 — o pendente mensal do card "deixe reservado"',
  'Supermercado em três bandeiras — Previsível por tipo, não por nome',
  'Combustível em dois postos — segundo tipo previsível',
  'Delivery — volume realista, alimenta a memória de categoria',
  'Compra e estorno no mesmo dia — descartados com aviso',
  'Smart TV em 10x — Contratado, com progresso e projeção',
  'Amazon em 3x, quitada — a seção Quitadas, que não entra em total nenhum',
  'Magazine Luiza em 12x e Latam em 6x — o nome muda a cada fatura, o agrupamento não',
  'Ruído de extrato — o que categorizar',
  'Devolução três semanas depois — entrada que não é renda',
  'O ciclo corrente até o dia 16 — o que já caiu, e o que o ritmo tem para comparar',
];

/**
 * Monta as linhas do arquivo.
 *
 * ⚠️ **Nenhuma descrição pode conter vírgula.** O CSV é escrito sem aspas, e uma vírgula
 * dentro de um campo deslocaria a coluna de valor em silêncio.
 */
function montarLinhas(hoje: Date): Linha[] {
  const linhas: Linha[] = [];
  const r = sorteio(hoje.getFullYear() * 100 + hoje.getMonth() + 1);
  const adiciona = (data: string, descricao: string, valor: number) =>
    linhas.push({ data, descricao, valor: centavos(valor) });

  /**
   * Uma compra parcelada, do jeito que a fatura de cartão a apresenta.
   *
   * `nomes` traz um estabelecimento por parcela — ⭐ **é isso que exercita a D-008**: o nome
   * varia entre faturas da mesma compra, e o agrupamento tem de sobreviver a ele.
   *
   * ⚠️ Todas as linhas levam a **data da compra**, e é ela que decide onde cada parcela cai:
   * o servidor desloca cada uma para `compra + (atual − 1)` meses. Por isso a data se calcula
   * de trás para frente, a partir de onde a primeira parcela mostrada deve aparecer.
   *
   * ⭐ A última parcela difere de um centavo, sempre para cima. É o resto da divisão que o
   * banco joga na última, e o único caso em que a tolerância de `mesmoValor` importa.
   * ⛔ Só a última, e só um centavo: a comparação é sempre contra a **primeira** linha do
   * grupo, então um espalhamento de dois centavos partiria a compra em duas.
   */
  const parcelada = (
    nomes: string[],
    total: number,
    primeira: number,
    kDaPrimeira: number,
    base: number,
    diaDoMes: number,
  ) => {
    const compra = dia(hoje, kDaPrimeira - (primeira - 1), diaDoMes);
    const largura = String(total).length;
    nomes.forEach((nome, i) => {
      const numero = String(primeira + i).padStart(largura, '0');
      const valor = i === nomes.length - 1 ? base + 0.01 : base;
      adiciona(compra, `${nome} PARC ${numero}/${total}`, -valor);
    });
  };

  /** O dia típico do ciclo `k`, já escorregado. Ver `OSCILACAO`. */
  const diaUtil = (k: number, tipico: number) => dia(hoje, k, tipico + OSCILACAO[k % OSCILACAO.length]);

  // ⭐ Sujeira de maquininha: é assim que o nome chega no extrato. Aqui ela testa a
  //    **classificação pela IA**, que precisa achar a bandeira sob o prefixo da adquirente —
  //    outro mecanismo, não o da detecção de recorrente.
  // ⚠️ Sujo, mas não irreconhecível: `PAG*ATACADAO` mantém a marca, `PAG*4412 SP` não. Se a
  //    IA parar de classificar, a camada Previsível esvazia e a demonstração piora.
  const mercados = ['PAG*ATACADAO SUPERM', 'MP *ASSAI ATACADISTA', 'CARREFOUR COM BR 4412'];
  const ruido = ['UBER *TRIP SP', 'PAG*PADARIA DO BAIRRO', 'DROGASIL 1147', 'CINEMARK BR', 'PIX ENVIADO'];

  /**
   * ⭐⭐ A conta cujo nome muda a cada mês — o caso que só a regra `valor + dia` pega.
   *
   * Num extrato de verdade a mesma cobrança chega como Pix com código de barras, como débito
   * automático com número de contrato, e como o nome do provedor por extenso. ⛔ A regra
   * `nome + valor` vê seis cobranças distintas, cada uma com uma ocorrência, e não reivindica
   * nenhuma — elas sobram inteiras para a segunda regra, que é o ponto.
   *
   * ⚠️ **O valor tem de ser idêntico nas seis**, e isso é contraintuitivo: a tolerância de um
   * centavo vale para *casar com um fixo já aceito*, mas o **agrupamento** compara o valor
   * como texto. Um centavo aqui partiria a cobrança em dois grupos.
   *
   * ⛔⛔ **E nenhum nome pode conter um padrão `N/M`.** O prompt manda extrair parcela quando
   * ele aparece escrito na linha, então um `ref 08/2026` vira "parcela 8 de 202" e a cobrança
   * some da camada Recorrente para virar um parcelamento inventado. É o defeito exato que a
   * D-048 abriu espaço para existir, e o único jeito de não cair nele é não escrever datas
   * com barra nas descrições.
   */
  const CONTA_CAOTICA = [
    'Debito automatico: "0071845220196"',
    'CLARO NET FIXO',
    'Pix enviado: "Cp :48213097-CLARO"',
    'Débito automático Net Serviço',
    'PAGTO CONTA CLARO SA',
    'DEB AUT CLARO 0071845220196',
  ];

  for (let k = 0; k < MESES; k++) {
    // 1 · Renda. Sem ela, "o que sobra" não tem divisor e o card Renda fica vazio.
    adiciona(diaUtil(k, 5), 'SALARIO EMPRESA XYZ', 5200);

    // 2 · Três assinaturas em todos os seis meses: 3+ ocorrências entram sozinhas.
    //     ⭐ O dia oscila e o agrupamento não sente: com nome estável quem reivindica é a
    //     regra `nome + valor`, que ignora o dia por completo. A oscilação só alimenta a moda
    //     e o ajuste de fim de semana.
    adiciona(diaUtil(k, 15), 'NETFLIX.COM', -44.9);
    adiciona(diaUtil(k, 8), 'SPOTIFY', -21.9);
    adiciona(diaUtil(k, 10), 'ACADEMIA SMARTFIT', -99.9);

    // 4 · O mesmo nome com dois valores: nos três primeiros meses 99, nos três últimos 109.
    //     É o que gera a proposta de **correção** depois que o fixo já existe.
    adiciona(diaUtil(k, 12), 'INTERNET FIBRA 300MB', k < 3 ? -99 : -109);

    // 16 · ⭐⭐ A conta de nome caótico, por volta do dia 10. Ver `CONTA_CAOTICA`.
    adiciona(diaUtil(k, 10), CONTA_CAOTICA[k % CONTA_CAOTICA.length], -94.9);

    // 7 · Supermercado: três bandeiras, uma natureza. O nome varia e o tipo não.
    const quantos = 2 + Math.floor(r(0, 2));
    for (let i = 0; i < quantos; i++) {
      adiciona(diaUtil(k, 6 + i * 9), escolha(mercados, r(0, 3)), -r(180, 420));
    }

    // 8 · Combustível: segundo tipo previsível, pelo mesmo motivo.
    adiciona(diaUtil(k, 9), 'POSTO IPIRANGA AUTO', -r(150, 280));
    adiciona(diaUtil(k, 23), 'SHELL SELECT 0413', -r(150, 280));

    // 9 · Delivery: volume. Sem ele o extrato parece sintético.
    for (let i = 0; i < 2; i++) {
      adiciona(diaUtil(k, 7 + i * 8), 'IFOOD *IFD BRASIL', -r(25, 90));
    }

    // 12 · Ruído realista — o que existe em qualquer extrato e não é compromisso nenhum.
    // ⚠️ Dois por ciclo, e não três: o arquivo cresceu com o ciclo corrente, e o gargalo da
    // importação é o limite de SAÍDA do modelo — um objeto JSON por transação.
    for (let i = 0; i < 2; i++) {
      adiciona(diaUtil(k, 4 + i * 8), escolha(ruido, r(0, 5)), -r(18, 120));
    }
  }

  // 3 · Duas ocorrências só, nos dois últimos meses: fica em **proposta**, não é aceita
  //     sozinha. É o que mostra a diferença entre os dois limiares (2 e 3).
  adiciona(diaUtil(MESES - 2, 20), 'CURSO INGLES ONLINE', -189);
  adiciona(diaUtil(MESES - 1, 20), 'CURSO INGLES ONLINE', -189);

  // 5 · Presente nos quatro primeiros meses e ausente nos dois últimos: o card do fixo passa
  //     a dizer "sem cobrança há N ciclos". ⚠️ São quatro ocorrências, e não duas, porque o
  //     aviso só existe para fixo **ativo** — e ativo sozinho exige 3.
  for (let k = 0; k < 4; k++) adiciona(diaUtil(k, 18), 'TV A CABO CLARO', -89.9);

  // 6 · ⭐⭐ A cobrança NÃO MENSAL, e ela está posicionada com precisão: a cada dois ciclos,
  //     em k=0, 2 e 4, de modo que a **próxima caia no ciclo corrente**. É o caso que o card
  //     "deixe reservado" foi criado para resolver (D-047) — o alerta de uma cobrança que só
  //     aparece no ciclo em que ela realmente cai.
  //     ⚠️ Três ocorrências, e não duas: com duas ela ficaria em proposta, e o pendente só
  //     existiria depois de um clique. Com três ela é aceita sozinha.
  //     ⚠️ E o silêncio de 2 ciclos fica abaixo do limiar `periodicidade + 1 = 3`, então não
  //     dispara alarme falso de encerramento. O painel amortiza 143,70 / 2 por mês.
  for (const k of [0, 2, 4]) adiciona(diaUtil(k, 22), 'SEGURO RESIDENCIAL', -143.7);

  // 14 · ⭐ O pendente mensal. Dia 25 — depois do corte do ciclo corrente —, então ele nunca
  //      tem lançamento neste ciclo e o card diz "cai dia 25". Seis ocorrências nos ciclos
  //      fechados o fazem ser aceito sozinho, sem clique nenhum.
  for (let k = 0; k < MESES; k++) adiciona(diaUtil(k, 25), 'PLANO ODONTO', -89);

  // 10 · Estorno. ⚠️ **Mesmo dia, mesmo nome, mesmo valor absoluto** — a regra de
  //      `separarEstornos` é estrita nos três campos, e um nome diferente ("ESTORNO IFOOD")
  //      não casaria: as duas linhas entrariam, e o reembolso viraria renda.
  const diaDoEstorno = dia(hoje, MESES - 1, 14);
  adiciona(diaDoEstorno, 'IFOOD *RESTAURANTE', -89.9);
  adiciona(diaDoEstorno, 'IFOOD *RESTAURANTE', 89.9);

  // 11 · Parcelas. ⚠️⚠️ **A data é a da compra, não a da cobrança.** O servidor desloca cada
  //      parcela para `compra + (atual - 1)` meses (D-003), então todas as linhas de uma
  //      compra carregam a mesma data e só o número muda — é assim que uma fatura de cartão
  //      as apresenta, e é o que faz elas caírem em meses consecutivos depois da importação.
  //      ⚠️ O padrão `N/M` **escrito na descrição** é o que autoriza a extração da parcela
  //      numa planilha. Sem ele, cada linha vira gasto avulso.
  //
  // ⭐⭐ As três compras novas provam o que a **D-008** decidiu: o agrupamento é por valor,
  //     total e dia — **nunca por nome**. Cada parcela chega com o estabelecimento escrito
  //     de um jeito, como o extrato real entrega, e as quatro viram uma compra só.
  // ⭐ E a última parcela de cada uma difere de **um centavo**: é o arredondamento que o
  //     banco distribui, e o caso que a tolerância de `dinheiro.ts` existe para cobrir.
  parcelada(['SMART TV 55 LG', 'SMART TV 55 LG', 'SMART TV 55 LG', 'SMART TV 55 LG', 'SMART TV 55 LG', 'SMART TV 55 LG'], 10, 3, 0, 389.9, 15);

  // ⭐ Quitada: as três parcelas presentes. Ela aparece em **Quitadas** e ⚠️ não entra em
  //   total nenhum — o comprometido é o que ainda vai sair, e esta já saiu inteira.
  parcelada(['AMAZON BR', 'AMZN MKTPLACE BR', 'AMAZON.COM.BR'], 3, 1, 0, 129.9, 8);

  parcelada(
    ['MAGAZINE LUIZA', 'MAGALU *LOJA 042', 'MAGAZ LUIZA SA', 'MAGALU PAGAMENTOS', 'MAGAZINE LUIZA SA', 'MAGALU *MKTPLACE'],
    12, 5, 0, 249.9, 20,
  );

  parcelada(['LATAM AIRLINES', 'LATAM LINHAS AEREAS', 'TAM LINHAS AEREAS', 'LATAM *PASSAGEM'], 6, 2, 2, 89.9, 26);

  // 13 · Reembolso tardio. ⭐ Não é estorno: nome diferente e três semanas depois, então as
  //      duas linhas ficam. A devolução entra positiva e **não é renda** — é para ela que a
  //      categoria "Reembolsos" existe.
  adiciona(dia(hoje, MESES - 2, 8), 'LOJA X MOVEIS E DECORACAO', -240);
  adiciona(dia(hoje, MESES - 2, 29), 'DEVOLUCAO COMPRA LOJA X', 240);

  // 15 · ⭐⭐ O CICLO CORRENTE, pela metade.
  //
  //      Tudo aqui cai no dia 16 ou antes, então todo gasto fixo deste bloco aparece como
  //      **"já caiu neste ciclo"** — e os que ficaram de fora (dias 18, 20, 22 e 25) aparecem
  //      como **"cai dia N"**. É a única forma de a tela mostrar os dois estados de uma vez.
  //
  //      ⛔ O que NÃO entra aqui, e cada um por um motivo diferente:
  //      · `CURSO INGLES ONLINE` (20) tem de ficar em exatamente 2 ocorrências — uma terceira
  //        o faria ser aceito sozinho, e o bloco existe para mostrar a diferença dos limiares;
  //      · `TV A CABO CLARO` (18) é o bloco do silêncio, e uma cobrança nova apaga o aviso;
  //      · `SEGURO` (22) e `PLANO ODONTO` (25) são os pendentes — é a ausência deles que
  //        produz o "cai dia N";
  //      · as parcelas, cujas contagens já estão certas e que não ganham tese com mais uma.
  const agora = (diaDoMes: number, descricao: string, valor: number) => {
    const data = diaCorrente(hoje, diaDoMes);
    if (data) adiciona(data, descricao, valor);
  };

  agora(5, 'SALARIO EMPRESA XYZ', 5200);
  agora(8, 'SPOTIFY', -21.9);
  agora(10, 'ACADEMIA SMARTFIT', -99.9);
  agora(12, 'INTERNET FIBRA 300MB', -109);
  agora(15, 'NETFLIX.COM', -44.9);
  // ⭐ A conta caótica também cai neste ciclo, e com o sétimo nome. Ela aparece em "já caiu"
  //   com um nome que não diz nada — que é exatamente a tese: o produto a reconheceu assim.
  agora(10, 'Deb aut CLARO NET FIXO', -94.9);
  agora(6, escolha(mercados, r(0, 3)), -r(180, 420));
  agora(15, escolha(mercados, r(0, 3)), -r(180, 420));
  agora(9, 'POSTO IPIRANGA AUTO', -r(150, 280));
  agora(7, 'IFOOD *IFD BRASIL', -r(25, 90));
  agora(15, 'IFOOD *IFD BRASIL', -r(25, 90));
  agora(4, escolha(ruido, r(0, 5)), -r(18, 120));
  agora(12, escolha(ruido, r(0, 5)), -r(18, 120));

  return linhas.sort((a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao));
}

/**
 * O arquivo inteiro, como texto.
 *
 * Três colunas — o mínimo universal de export bancário. ⚠️ `Valor` com **ponto** decimal e
 * **sinal**: negativo é saída. É o que o prompt já espera, e evita que a demo teste de quebra
 * o parser de formatos exóticos, que é outro problema.
 *
 * ⚠️ O BOM não é enfeite: sem ele o Excel abre o arquivo em ANSI e a acentuação do cabeçalho
 * quebra na tela de quem for conferir.
 */
export function csvDeDemonstracao(hoje = new Date()): string {
  const linhas = montarLinhas(hoje).map(l => `${l.data},${l.descricao},${l.valor.toFixed(2)}`);
  return `\ufeffData,Descrição,Valor\n${linhas.join('\n')}\n`;
}

/**
 * Gera e entrega o arquivo.
 *
 * ⛔ Sem dependência nova: `URL.createObjectURL` sobre um `Blob` basta. ⚠️ O `revokeObjectURL`
 * não é zelo — sem ele o blob fica preso na memória da aba até um F5.
 */
export function baixarDemonstracao(hoje = new Date()): void {
  const blob = new Blob([csvDeDemonstracao(hoje)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = NOME_DO_ARQUIVO;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
