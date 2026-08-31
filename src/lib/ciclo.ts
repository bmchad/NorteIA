/**
 * A regra de ciclo de fatura do Balanço Geral — o dono único.
 *
 * O "mês" deste sistema não é o mês do calendário: é o ciclo da fatura, definido pelo
 * `ciclo_dia` do usuário (`memory.ciclo_dia`, padrão **1** desde a D-052). Com ciclo 5, a
 * fatura de Janeiro vai do dia 6 de Janeiro ao dia 5 de Fevereiro.
 *
 * ⚠️⚠️ **Com `ciclo_dia = 1` — o padrão, e portanto o caso de todo mundo — o ciclo de Janeiro
 * vai de 02/01 a 01/02.** É o mês do calendário **deslocado em um dia**, e não o mês do
 * calendário: o dia 1º pertence sempre ao ciclo anterior, porque a regra é `dia <= ciclo_dia`.
 * O mês exato exigiria `ciclo_dia = 0`, que o `CHECK` da coluna proíbe. → D-052
 *
 * Toda tela que agrupa transações por período usa este módulo. Duplicar a regra foi o que
 * fez o /dashboard e o /meses divergirem por um ano inteiro.
 */

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/** Mês absoluto: ano * 12 + mês (0-11). Torna a virada de ano aritmética, não condicional. */
const toAbsMonth = (ano: number, mes: number) => ano * 12 + mes;

/**
 * O ciclo de fatura ao qual uma transação pertence, como `"YYYY-MM"`.
 *
 * @param data       data da transação, em `YYYY-MM-DD`
 * @param mesFatura  o mês do balanço deduzido pela IA (nome em português), ou nulo
 * @param cicloDia   o dia em que a fatura fecha
 */
export function getCycleKey(data: string, mesFatura: string | null | undefined, cicloDia: number): string {
  const [anoStr, mesStr, diaStr] = data.split('-');
  // Parse como data local: `new Date('2026-01-03')` seria interpretado como UTC e poderia
  // recuar um dia dependendo do fuso — justamente na borda do ciclo, onde isso importa.
  const date = new Date(parseInt(anoStr), parseInt(mesStr) - 1, parseInt(diaStr));
  const dia = date.getDate();

  // Ciclo de fallback: até o dia do fechamento, a transação ainda pertence ao mês anterior.
  let abs = toAbsMonth(date.getFullYear(), date.getMonth());
  if (dia <= cicloDia) abs -= 1;

  // Quando a IA preencheu o mês do balanço, ele manda sobre o cálculo por dia. Mas ele diz
  // só o mês — o ano vem de escolher, entre os candidatos, o mais próximo do fallback.
  // Sem isso, uma transação de 03/01/2026 com mes_fatura "Dezembro" cairia em Dezembro/2026.
  const mesIndex = mesFatura ? MESES.indexOf(mesFatura) : -1;
  if (mesIndex !== -1) {
    const fallback = abs;
    const base = Math.floor(fallback / 12) * 12 + mesIndex;
    // No empate exato de 6 meses o `mes_fatura` esta longe demais da `data` para significar
    // algo — nesse caso fica o ano da propria `data`, que e o comportamento historico.
    const anoData = date.getFullYear();
    abs = [base - 12, base, base + 12].reduce((melhor, candidato) => {
      const dCand = Math.abs(candidato - fallback);
      const dMelhor = Math.abs(melhor - fallback);
      if (dCand !== dMelhor) return dCand < dMelhor ? candidato : melhor;
      return Math.floor(candidato / 12) === anoData ? candidato : melhor;
    });
  }

  const ano = Math.floor(abs / 12);
  const mes = abs % 12;
  return `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

/** O ano do ciclo ao qual a transação pertence. Atalho para o Dashboard Anual. */
export function getCycleYear(data: string, mesFatura: string | null | undefined, cicloDia: number): number {
  return parseInt(getCycleKey(data, mesFatura, cicloDia).split('-')[0]);
}

/** O nome do mês de uma chave de ciclo `"YYYY-MM"`, para exibição. */
export function formatCycleKey(cycleKey: string): { mes: string; ano: string } {
  const [ano, mes] = cycleKey.split('-');
  return { mes: MESES[parseInt(mes) - 1], ano };
}

/**
 * `YYYY-MM-DD` de uma data local.
 *
 * ⚠️ `toISOString()` converte para UTC e pode recuar um dia — justamente na borda do ciclo,
 * que é onde isso decide a qual mês a transação pertence.
 */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Dias inteiros entre duas datas `YYYY-MM-DD`.
 *
 * ⚠️⚠️ **Em UTC, e não sobre datas locais.** No dia da virada de horário de verão o dia tem
 * 23 ou 25 horas, `(b - a) / 86400000` dá 0,96 e o `Math.floor` **come um dia** — exatamente
 * na aritmética que define a posição dentro do ciclo.
 */
function diffDias(de: string, ate: string): number {
  const [a1, m1, d1] = de.split('-').map(Number);
  const [a2, m2, d2] = ate.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** O ciclo em que uma data cai, pela regra do dia. Sem `mes_fatura`: hoje não tem um. */
export function cicloDeHoje(cicloDia: number, hoje: Date = new Date()): string {
  return getCycleKey(isoLocal(hoje), null, cicloDia);
}

/** Anda `passos` ciclos a partir de uma chave. Aceita negativo. */
export function passoDeCiclo(chave: string, passos: number): string {
  const [ano, mes] = chave.split('-').map(Number);
  const abs = toAbsMonth(ano, mes - 1) + passos;
  return `${Math.floor(abs / 12)}-${String((abs % 12) + 1).padStart(2, '0')}`;
}

/**
 * O primeiro dia, o último dia e o comprimento de um ciclo.
 *
 * ⭐⭐ **É a inversa de `getCycleKey`, e carrega a mesma sutileza de um mês:** o ciclo da chave
 * `2026-01` **começa em 06/01** e termina em 05/02, com `ciclo_dia = 5`. Ler a chave como "o
 * mês de janeiro" erra por um mês, e é o erro que a D-007 levou um ano para achar.
 *
 * ⚠️ O comprimento **varia de 28 a 31 dias**, e é por isso que ele é devolvido: comparar
 * posições entre ciclos sem saber o comprimento de cada um é comparar réguas diferentes.
 */
export function limitesDoCiclo(chave: string, cicloDia: number): { inicio: string; fim: string; dias: number } {
  const [ano, mes] = chave.split('-').map(Number);
  const ultimoDoMes = new Date(ano, mes, 0).getDate();

  // ⚠️ Ramo inalcançável pela tela, que limita `ciclo_dia` a 27 — mas a coluna não impõe
  // nada, e sem ele um ciclo_dia de 31 produziria comprimento negativo.
  const inicio = cicloDia + 1 <= ultimoDoMes
    ? new Date(ano, mes - 1, cicloDia + 1)
    : new Date(ano, mes, 1);

  const fimAbs = toAbsMonth(ano, mes - 1) + 1;
  const anoFim = Math.floor(fimAbs / 12);
  const mesFim = fimAbs % 12;
  const fim = new Date(anoFim, mesFim, Math.min(cicloDia, new Date(anoFim, mesFim + 1, 0).getDate()));

  const i = isoLocal(inicio);
  const f = isoLocal(fim);
  return { inicio: i, fim: f, dias: diffDias(i, f) + 1 };
}

/** Todas as chaves de `de` até `ate`, inclusive e em ordem. Vazio se `de` vier depois. */
export function ciclosNoIntervalo(de: string, ate: string): string[] {
  const chaves: string[] = [];
  let atual = de;
  // ⚠️ Comparação de string funciona porque a chave é `YYYY-MM` com mês preenchido a zero.
  while (atual <= ate) {
    chaves.push(atual);
    atual = passoDeCiclo(atual, 1);
  }
  return chaves;
}

/**
 * Em que dia do ciclo (1-based) a transação caiu.
 *
 * ⭐ A posição é medida **dentro do ciclo que o `getCycleKey` atribuiu**, e não recalculada a
 * partir da data: `getCycleKey` é o dono único de "qual ciclo", e uma segunda leitura da
 * mesma regra é o defeito que a D-007 registra.
 *
 * ⚠️ Daí o grampo. Quando `mes_fatura` joga a transação num ciclo que **não contém a data
 * dela**, a posição sai fora de `[1, dias]`. Grampeada, ela acerta nos dois sentidos: cobrança
 * empurrada para a frente conta desde o dia 1 do ciclo novo, cobrança puxada para trás só
 * conta no fim do ciclo antigo.
 */
export function diaNoCiclo(data: string, mesFatura: string | null | undefined, cicloDia: number): number {
  const { inicio, dias } = limitesDoCiclo(getCycleKey(data, mesFatura, cicloDia), cicloDia);
  return Math.min(Math.max(diffDias(inicio, data) + 1, 1), dias);
}
