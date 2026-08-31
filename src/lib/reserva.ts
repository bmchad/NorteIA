/**
 * O que ainda vai cair neste ciclo — e quanto deixar na conta por causa disso.
 *
 * ⭐⭐ A aba Recorrente diz **quanto** você tem comprometido por mês e não dizia **quando**.
 * "Dia 3" solto não responde a única pergunta que muda o que você faz hoje: o dia 3 já
 * passou, ou vem aí? A primeira resposta é histórico; a segunda é dinheiro que precisa estar
 * na conta.
 *
 * ⭐ Nada aqui é guardado. A âncora de uma cobrança não mensal se **deriva** da última
 * ocorrência observada — última + periodicidade = próxima. Foi o que dispensou a coluna
 * `mes_ancora` que a P27 pedia. É a D-013: não guarde o que dá para derivar.
 *
 * ⚠️⚠️ **Contrato de quem chama: não passe fixo com proposta de encerramento.** Esta função
 * não sabe do silêncio — quem mede isso é `detectarEncerramentos`, e o critério tem de ter um
 * dono só. Sem esse filtro, um fixo que parou de ser cobrado continua pedindo reserva, e a
 * tela diz "cai dia 18" ao lado de "sem cobrança há 3 ciclos".
 */
import { getCycleKey } from './ciclo';
import { ajusteDeDia, lancamentosDoFixo } from './fixos-propostos';

export interface Cobranca {
  fixo: any;
  /** `YYYY-MM-DD`, já com o ajuste de fim de semana aplicado. */
  data: string;
  valor: number;
  /** O dia nominal do fixo caiu num fim de semana e a data foi empurrada. */
  ajustada: boolean;
}

export interface ReservaDoCiclo {
  /** A soma do que ainda falta cair. É o "X" de "reserve X". */
  aReservar: number;
  /** Ordenadas por data. */
  pendentes: Cobranca[];
  jaCairam: Cobranca[];
  /** Último dia do ciclo corrente, `YYYY-MM-DD` — o prazo da reserva. */
  fimDoCiclo: string;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * O dia `dia` dentro do ciclo `chave`, como data real.
 *
 * ⚠️⚠️ **A sutileza que esconde um erro de um mês.** Com `ciclo_dia = 5`, o ciclo de Janeiro
 * vai de 06/01 a 05/02. Um fixo de **dia 3 cai em fevereiro**; um de dia 10, em janeiro. É a
 * regra do `getCycleKey` invertida, e ignorá-la põe a cobrança no mês errado.
 *
 * ⚠️ Dia 31 em mês de 30 vira o último dia do mês, não o dia 1 do seguinte: `new Date` com
 * dia 31 em abril rolaria para 01/05 e mudaria de ciclo.
 */
function dataNoCiclo(chave: string, dia: number, cicloDia: number): Date {
  const [ano, mes] = chave.split('-').map(Number);
  const abs = ano * 12 + (mes - 1) + (dia <= cicloDia ? 1 : 0);
  const anoAlvo = Math.floor(abs / 12);
  const mesAlvo = abs % 12;
  const ultimoDia = new Date(anoAlvo, mesAlvo + 1, 0).getDate();
  return new Date(anoAlvo, mesAlvo, Math.min(dia, ultimoDia));
}

/**
 * Empurra a data para fora do fim de semana, no sentido que aquele fixo costuma escorregar.
 *
 * ⭐ `ajusteDeDia` estava escrita, testada e **sem nenhum chamador** desde que foi criada — a
 * P26. É aqui que ela serve: o histórico do próprio fixo diz se o banco antecipa ou adia.
 *
 * 🔶 Só sábado e domingo. Feriado exigiria um calendário que o projeto não tem, e fingir
 * precisão seria pior que declarar o limite.
 */
function foraDoFimDeSemana(d: Date, sentido: 'adiar' | 'antecipar'): Date {
  const passo = sentido === 'adiar' ? 1 : -1;
  const ajustada = new Date(d);
  while (ajustada.getDay() === 0 || ajustada.getDay() === 6) {
    ajustada.setDate(ajustada.getDate() + passo);
  }
  return ajustada;
}

export function cobrancasDoCiclo(
  fixosAtivos: any[],
  transacoes: any[],
  cicloDia: number,
  hoje = new Date(),
): ReservaDoCiclo {
  const cicloAtual = getCycleKey(iso(hoje), null, cicloDia);
  const [anoC, mesC] = cicloAtual.split('-').map(Number);
  // O ciclo de Janeiro termina no dia `cicloDia` de fevereiro.
  const fim = new Date(anoC, mesC, Math.min(cicloDia, new Date(anoC, mesC + 1, 0).getDate()));

  const pendentes: Cobranca[] = [];
  const jaCairam: Cobranca[] = [];

  for (const fixo of fixosAtivos) {
    const ocorrencias = lancamentosDoFixo(fixo, transacoes);

    // ⛔ Sem histórico não se afirma nada. Um fixo recém-cadastrado à mão não tem âncora, e
    // chutar uma produziria um aviso falso — pior que aviso nenhum.
    if (ocorrencias.length === 0) continue;

    const ciclos = ocorrencias.map(t => getCycleKey(t.data, t.mes_fatura, cicloDia)).sort();
    const periodicidade = Math.max(1, Number(fixo.periodicidade_meses) || 1);
    const dia = Number(fixo.dia) || 1;
    const valor = Math.abs(Number(fixo.valor) || 0);

    const nesteCiclo = ciclos.includes(cicloAtual);

    if (!nesteCiclo) {
      // ⚠️ Não mensal: o ciclo em que cai é o último observado mais a periodicidade. Se ainda
      // não chegou a vez dele, este ciclo simplesmente não o vê.
      if (periodicidade > 1) {
        const [au, mu] = ciclos[ciclos.length - 1].split('-').map(Number);
        const absProximo = au * 12 + (mu - 1) + periodicidade;
        if (absProximo !== anoC * 12 + (mesC - 1)) continue;
      }
    }

    const nominal = dataNoCiclo(cicloAtual, dia, cicloDia);
    const ajustada = foraDoFimDeSemana(nominal, ajusteDeDia(ocorrencias));
    const cobranca: Cobranca = {
      fixo,
      data: iso(ajustada),
      valor,
      ajustada: iso(ajustada) !== iso(nominal),
    };

    // ⭐ Já saiu neste ciclo? Então não se reserva para ela. É a diferença entre "você deve" e
    // "você precisa ter na conta".
    (nesteCiclo ? jaCairam : pendentes).push(cobranca);
  }

  pendentes.sort((a, b) => a.data.localeCompare(b.data));
  jaCairam.sort((a, b) => a.data.localeCompare(b.data));

  return {
    aReservar: pendentes.reduce((acc, c) => acc + c.valor, 0),
    pendentes,
    jaCairam,
    fimDoCiclo: iso(fim),
  };
}
