-- Marca quais categorias contam como renda.
--
-- Nem toda transação positiva é renda: estorno de compra, reembolso de consulta e venda
-- de um objeto entram com valor positivo e não são dinheiro que você ganhou. Somar tudo
-- infla o divisor de "% da renda comprometida" e faz o comprometimento parecer menor do
-- que é -- que é errar para o lado perigoso.
--
-- Por que uma coluna em `categories` e não um array em `memory`: array não tem chave
-- estrangeira por elemento, então apagar uma categoria deixaria um id pendurado ali em
-- silêncio. Aqui a marca vive na própria linha e some junto com ela.
--
-- Por que booleano e não "categoria de salário": há quem tenha várias fontes -- três
-- empregadores, mais receitas avulsas. A pergunta que a marca responde é "isto conta como
-- renda?", não "isto é salário?".
--
-- Ver context/30-decisoes-e-licoes.md D-025.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS e_renda boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.categories.e_renda IS
  'Conta como renda no cálculo de proporção e projeção. Entrada que não é renda (estorno, '
  'reembolso, venda) fica de fora. Enquanto nenhuma categoria estiver marcada, o front cai '
  'no comportamento antigo: toda transação positiva.';
