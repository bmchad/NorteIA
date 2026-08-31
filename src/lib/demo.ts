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

/** Os seis meses gerados terminam no mês **anterior** ao de hoje. */
const MESES = 6;

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
 * Aleatoriedade com semente.
 *
 * ⭐ O mesmo dia produz o mesmo arquivo. Sem isso, dois downloads no mesmo dia dariam
 * números diferentes e nenhum defeito de importação seria reproduzível.
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
  'Curso de inglês em 2 meses — proposta, não aceite automático',
  'Internet que subiu de preço — proposta de correção de valor',
  'TV a cabo que sumiu — aviso de "sem cobrança há N ciclos"',
  'Seguro trimestral — amortização por mês e alerta no ciclo em que cai',
  'Supermercado em três bandeiras — Previsível por tipo, não por nome',
  'Combustível em dois postos — segundo tipo previsível',
  'Delivery — volume realista, alimenta a memória de categoria',
  'Compra e estorno no mesmo dia — descartados com aviso',
  'Smart TV em 10x — Contratado, com progresso e projeção',
  'Amazon em 3x, quitada — a seção Quitadas, que não entra em total nenhum',
  'Magazine Luiza em 12x e Latam em 6x — o nome muda a cada fatura, o agrupamento não',
  'Ruído de extrato — o que categorizar',
  'Devolução três semanas depois — entrada que não é renda',
];

/**
 * Monta as linhas do arquivo.
 *
 * ⚠️ **Nenhuma descrição pode conter vírgula.** O CSV é escrito sem aspas, e uma vírgula
 * dentro de um campo deslocaria a coluna de valor em silêncio.
 */
function montarLinhas(hoje: Date): Linha[] {
  const linhas: Linha[] = [];
  const r = sorteio(hoje.getFullYear() * 10000 + (hoje.getMonth() + 1) * 100 + hoje.getDate());
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

  for (let k = 0; k < MESES; k++) {
    // 1 · Renda. Sem ela, "o que sobra" não tem divisor e o card Renda fica vazio.
    adiciona(dia(hoje, k, 5), 'SALARIO EMPRESA XYZ', 5200);

    // 2 · Três assinaturas em todos os seis meses: 3+ ocorrências entram sozinhas.
    adiciona(dia(hoje, k, 15), 'NETFLIX.COM', -44.9);
    adiciona(dia(hoje, k, 8), 'SPOTIFY', -21.9);
    adiciona(dia(hoje, k, 10), 'ACADEMIA SMARTFIT', -99.9);

    // 4 · O mesmo nome com dois valores: nos três primeiros meses 99, nos três últimos 109.
    //     É o que gera a proposta de **correção** depois que o fixo já existe.
    adiciona(dia(hoje, k, 12), 'INTERNET FIBRA 300MB', k < 3 ? -99 : -109);

    // 7 · Supermercado: três bandeiras, uma natureza. O nome varia e o tipo não.
    const mercados = ['ATACADAO', 'ASSAI ATACADISTA', 'CARREFOUR'];
    const quantos = 2 + Math.floor(r(0, 2));
    for (let i = 0; i < quantos; i++) {
      adiciona(dia(hoje, k, 6 + i * 9), escolha(mercados, r(0, 3)), -r(180, 420));
    }

    // 8 · Combustível: segundo tipo previsível, pelo mesmo motivo.
    adiciona(dia(hoje, k, 9), 'POSTO IPIRANGA', -r(150, 280));
    adiciona(dia(hoje, k, 23), 'SHELL SELECT', -r(150, 280));

    // 9 · Delivery: volume. Sem ele o extrato parece sintético.
    for (let i = 0; i < 2; i++) {
      adiciona(dia(hoje, k, 7 + i * 8), 'IFOOD *RESTAURANTE', -r(25, 90));
    }

    // 12 · Ruído realista — o que existe em qualquer extrato e não é compromisso nenhum.
    const ruido = ['UBER *TRIP', 'PADARIA DO BAIRRO', 'DROGASIL', 'CINEMARK', 'PIX ENVIADO'];
    for (let i = 0; i < 3; i++) {
      adiciona(dia(hoje, k, 4 + i * 8), escolha(ruido, r(0, 5)), -r(18, 120));
    }
  }

  // 3 · Duas ocorrências só, nos dois últimos meses: fica em **proposta**, não é aceita
  //     sozinha. É o que mostra a diferença entre os dois limiares (2 e 3).
  adiciona(dia(hoje, MESES - 2, 20), 'CURSO INGLES ONLINE', -189);
  adiciona(dia(hoje, MESES - 1, 20), 'CURSO INGLES ONLINE', -189);

  // 5 · Presente nos quatro primeiros meses e ausente nos dois últimos: o card do fixo passa
  //     a dizer "sem cobrança há N ciclos". ⚠️ São quatro ocorrências, e não duas, porque o
  //     aviso só existe para fixo **ativo** — e ativo sozinho exige 3.
  for (let k = 0; k < 4; k++) adiciona(dia(hoje, k, 18), 'TV A CABO CLARO', -89.9);

  // 6 · A cada três meses. Duas ocorrências bastam para a cadência ser medida, e o painel
  //     mostra a amortização (143,70 / 3) em vez do valor cheio no mês em que cai.
  adiciona(dia(hoje, 2, 22), 'SEGURO RESIDENCIAL', -143.7);
  adiciona(dia(hoje, MESES - 1, 22), 'SEGURO RESIDENCIAL', -143.7);

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
