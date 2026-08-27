/**
 * A regra de ciclo de fatura do Balanço Geral — o dono único.
 *
 * O "mês" deste sistema não é o mês do calendário: é o ciclo da fatura, definido pelo
 * `ciclo_dia` do usuário (`memory.ciclo_dia`, padrão 5). Com ciclo 5, a fatura de Janeiro
 * vai do dia 6 de Janeiro ao dia 5 de Fevereiro.
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
