/**
 * A identidade de um banco, para casar `transactions.banco` com `vencimentos.banco`.
 *
 * ⛔⛔ **Este arquivo NÃO contém a lista de bancos, e não vai conter.** O dono do enum é
 * `supabase/functions/ai-agents/lib/bancos.ts`, e foi a D-011 que o consolidou lá — derrubando a
 * constraint `chk_banco` justamente porque a lista estava duplicada entre o Postgres e o prompt.
 * Copiá-la para cá recriaria o mesmo defeito com outro nome. Aqui mora uma função, e só.
 *
 * ⭐ **Por que a chave existe, se o servidor já canoniza.** Desde 2026-09-03 `normalizar.ts` casa a
 * resposta da IA contra `BANCOS` e grava o valor canônico — mas isso só vale para importações
 * **futuras**, e há dois escritores que ele não alcança: o histórico já gravado, de quando nada
 * conferia, e o `<input type="text">` livre da revisão em `Pendentes.tsx`, onde se digita o que se
 * quiser. Sem esta função, "Itaú" e "Itau" na mesma conta viram dois bancos: o `/perfil` mostra a
 * linha duplicada e a fatura se parte em dois marcadores no Mercado de Datas — ou metade dela some
 * da curva, em silêncio, por não ter vencimento configurado.
 *
 * ⚠️ **É chave, não rótulo.** Casar por ela, exibir o texto original: ninguém quer ver "itau" na
 * tela.
 */

/**
 * Minúsculas, sem acento e sem espaço nas pontas.
 *
 * ⚠️ A faixa de acentos vai como escape (`\u0300-\u036f`) e não com os caracteres combinantes
 * literais: eles são invisíveis no editor, e uma cópia que os perca deixa a função com cara de
 * correta enquanto para de tirar acento.
 *
 * ⚠️ Gêmea de `chave` em `supabase/functions/ai-agents/lib/normalizar.ts`. Não dá para compartilhar
 * — uma roda no browser, a outra no Deno —, e é a mesma dívida que a normalização de nome de coluna
 * tem em outros projetos. Divergir aqui **não** vira dado errado: vira banco que não casa, e o
 * sintoma é visível (a linha aparece duas vezes no `/perfil`).
 */
export function chaveDeBanco(nome: string | null | undefined): string {
  if (!nome) return '';
  return String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
