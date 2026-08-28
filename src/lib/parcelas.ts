/**
 * O que ainda falta pagar das compras parceladas.
 *
 * Mora aqui, e não dentro de `Parcelas.tsx`, porque o mesmo número aparece também no
 * Dashboard. Regra de cálculo duplicada entre telas foi o que fez o Dashboard e o
 * `/meses` discordarem por um ano inteiro — ver context/30-decisoes-e-licoes.md D-007.
 */

import { getCycleKey, MESES } from './ciclo';

/** Um grupo de parcelas já reconhecido como a mesma compra, em `Parcelas.tsx`. */
export type GrupoDeParcelas = any[];

export interface CompromissoDoCiclo {
  /** Chave do ciclo, `YYYY-MM`. */
  cicloKey: string;
  /** Rótulo para exibição, `Março 2026`. */
  rotulo: string;
  valor: number;
}

export interface ContaDaCompra {
  valorParcela: number;
  pagas: number;
  totalParcelas: number;
  faltam: number;
  valorPago: number;
  /** ⭐ Quanto ainda vai ser cobrado desta compra. */
  valorPendente: number;
  valorTotal: number;
  concluida: boolean;
}

/**
 * A conta de uma compra parcelada.
 *
 * Mora aqui, e não dentro do card, porque o total da tela e o do Dashboard somam exatamente
 * estes números. Card calculando por conta própria é como o Dashboard e o `/meses`
 * discordarem por um ano — ver context/30-decisoes-e-licoes.md D-007.
 *
 * ⚠️ `valor` em `transactions` é assinado e a parcela é negativa. Tudo aqui sai positivo:
 * é dívida, não saída do ciclo.
 */
export function contaDaCompra(grupo: GrupoDeParcelas): ContaDaCompra {
  const base = grupo[0];
  const valorParcela = base ? Math.abs(Number(base.valor)) : 0;
  const pagas = grupo.length;
  const totalParcelas = base?.parcela_total || 1;
  const faltam = Math.max(totalParcelas - pagas, 0);

  return {
    valorParcela,
    pagas,
    totalParcelas,
    faltam,
    valorPago: valorParcela * pagas,
    valorPendente: valorParcela * faltam,
    valorTotal: valorParcela * totalParcelas,
    concluida: faltam === 0,
  };
}

/** Quanto ainda falta pagar, somando todos os grupos que não terminaram. */
export function comprometidoRestante(gruposEmAndamento: GrupoDeParcelas[]): number {
  return gruposEmAndamento.reduce(
    (total, grupo) => total + contaDaCompra(grupo).valorPendente,
    0,
  );
}

/**
 * Quanto sai **por ciclo** em parcelas — o fluxo, não o estoque.
 *
 * ⚠️ Não confundir com `comprometidoRestante`, que é a dívida inteira. Este é o que compara
 * com a renda mensal; aquele, com o patrimônio. Somar os dois seria somar grandezas
 * diferentes.
 *
 * Cada compra em andamento contribui com exatamente uma parcela por ciclo.
 */
export function comprometidoMensal(gruposEmAndamento: GrupoDeParcelas[]): number {
  return gruposEmAndamento.reduce(
    (total, grupo) => total + contaDaCompra(grupo).valorParcela,
    0,
  );
}

/** Quantas parcelas ainda vão ser cobradas, somadas todas as compras em andamento. */
export function parcelasRestantes(gruposEmAndamento: GrupoDeParcelas[]): number {
  return gruposEmAndamento.reduce((total, grupo) => total + contaDaCompra(grupo).faltam, 0);
}

/**
 * A saída por ciclo nos próximos `quantos` ciclos.
 *
 * Cada compra em andamento contribui com uma parcela por ciclo até acabar. O ciclo de
 * cada parcela sai de `getCycleKey`, o mesmo dono da regra que o resto do sistema usa —
 * senão esta projeção discordaria do `/meses` exatamente como o Dashboard discordava.
 */
export function projecaoPorCiclo(
  gruposEmAndamento: GrupoDeParcelas[],
  cicloDia: number,
  quantos = 6,
): CompromissoDoCiclo[] {
  const porCiclo = new Map<string, number>();
  const hoje = new Date();

  for (const grupo of gruposEmAndamento) {
    const base = grupo[0];
    if (!base?.data) continue;

    const valor = Math.abs(Number(base.valor));
    const faltam = Math.max((base.parcela_total || 1) - grupo.length, 0);

    // A parcela seguinte cai um mês depois da última registrada; daí em diante, uma
    // por mês. É a mesma regra de deslocamento que a extração aplica na importação.
    const [ano, mes, dia] = base.data.split('-').map(Number);
    for (let i = 1; i <= faltam; i++) {
      const d = new Date(ano, mes - 1, dia);
      d.setMonth(d.getMonth() + grupo.length + i - 1);

      const dataISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const chave = getCycleKey(dataISO, null, cicloDia);
      porCiclo.set(chave, (porCiclo.get(chave) ?? 0) + valor);
    }
  }

  // Só os próximos `quantos` ciclos a partir do corrente, em ordem.
  const cicloAtual = getCycleKey(
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`,
    null,
    cicloDia,
  );

  return [...porCiclo.entries()]
    .filter(([chave]) => chave >= cicloAtual)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, quantos)
    .map(([cicloKey, valor]) => {
      const [ano, mes] = cicloKey.split('-');
      return { cicloKey, rotulo: `${MESES[parseInt(mes) - 1]} ${ano}`, valor };
    });
}
