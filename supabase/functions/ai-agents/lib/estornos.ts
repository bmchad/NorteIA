/**
 * Descarta pares de compra e estorno que se anulam dentro do mesmo lote.
 *
 * O caso: R$ 20 no iFood pelo cartao, e o reembolso dos mesmos R$ 20. O extrato traz as
 * duas linhas, mesmo dia, mesmo nome, sinais opostos. Nenhuma das duas e despesa nem
 * renda -- somadas dao zero, e mantidas contaminam o total do ciclo, a categoria e,
 * principalmente, as entradas: reembolso entrando como se fosse dinheiro que voce ganhou.
 *
 * Ate aqui isso era trabalho manual a cada importacao.
 *
 * ⚠️ A regra e deliberadamente estrita -- mesmo dia, mesmo nome, mesmo valor absoluto.
 * Num cartao, duas linhas de mesmo estabelecimento, mesmo dia e valores opostos identicos
 * SAO um estorno, por definicao. Afrouxar qualquer um dos tres campos abre espaco para
 * apagar transacao legitima, e apagar em silencio e pior que nao apagar.
 */

/** O minimo que o pareamento precisa ler. */
export interface Pareavel {
  data: string;
  nome: string;
  valor: number;
}

/**
 * Transferencia entre pessoas nao entra na regra.
 *
 * Num Pix o `nome` e o de uma pessoa, nao de um estabelecimento: mandar R$ 50 para alguem
 * e receber R$ 50 dela no mesmo dia pode ser troco, divisao de conta ou dinheiro indo e
 * voltando entre contas suas -- eventos legitimos e independentes, nao um estorno.
 *
 * 🔶 TED e "TRANSFER" entram pelo mesmo motivo; se aparecer falso positivo, e aqui.
 */
const TRANSFERENCIA = /\b(PIX|TED|DOC|TRANSFER)/i;

/**
 * Separa o lote em transacoes que ficam e pares que se anulam.
 *
 * Cada linha casa no maximo uma vez: tres compras de R$ 20 e um estorno de R$ 20 removem
 * um par e deixam duas compras de pe.
 */
export function separarEstornos<T extends Pareavel>(linhas: T[]): { ficam: T[]; estornos: T[] } {
  const casado = new Set<number>();

  linhas.forEach((positiva, iPos) => {
    if (positiva.valor <= 0 || casado.has(iPos)) return;
    if (TRANSFERENCIA.test(positiva.nome)) return;

    const par = linhas.findIndex((negativa, iNeg) =>
      iNeg !== iPos &&
      !casado.has(iNeg) &&
      negativa.valor < 0 &&
      negativa.data === positiva.data &&
      negativa.nome === positiva.nome &&
      Math.abs(negativa.valor) === Math.abs(positiva.valor)
    );

    if (par !== -1) {
      casado.add(iPos);
      casado.add(par);
    }
  });

  const ficam: T[] = [];
  const estornos: T[] = [];
  linhas.forEach((linha, i) => (casado.has(i) ? estornos : ficam).push(linha));

  return { ficam, estornos };
}
