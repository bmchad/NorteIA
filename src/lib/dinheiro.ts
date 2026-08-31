/**
 * Comparação de dinheiro, em centavos.
 *
 * ⛔⛔ **`Math.abs(a - b) < 0.01` não admite uma diferença de um centavo — e pior, admite às
 * vezes.** A diferença nominal é a mesma em todos os casos abaixo, e o resultado muda com a
 * grandeza dos números, por ruído de ponto flutuante:
 *
 * ```
 * 129,90 vs 129,91  →  0.009999999999990905  →  agrupa
 * 389,90 vs 389,91  →  0.010000000000047748  →  NÃO agrupa
 * 129,89 vs 129,90  →  0.010000000000019327  →  NÃO agrupa
 * ```
 *
 * ⭐ **Dinheiro é inteiro, não decimal.** Um centavo é a menor unidade que existe, então a
 * comparação se faz em centavos e a tolerância se conta em centavos. Aí "um centavo de
 * diferença" quer dizer exatamente isso, em qualquer ordem de grandeza.
 *
 * ⚠️ A tolerância existe porque o banco distribui o arredondamento da compra entre as
 * parcelas, e a última costuma diferir de um centavo das outras.
 */

/** O valor absoluto em centavos, arredondado. */
export const centavos = (v: unknown) => Math.round(Math.abs(Number(v) || 0) * 100);

/**
 * Dois valores são o mesmo dinheiro, a menos de `tolerancia` centavos?
 *
 * ⚠️ Sempre em valor absoluto: `transactions.valor` é assinado e a mesma quantia aparece
 * negativa numa tabela e positiva noutra.
 */
export function mesmoValor(a: unknown, b: unknown, tolerancia = 1): boolean {
  return Math.abs(centavos(a) - centavos(b)) <= tolerancia;
}
