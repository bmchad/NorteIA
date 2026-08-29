-- Procedência da transação: como a linha entrou no banco.
--
-- Até 2026-04 o histórico veio de planilhas que guardavam apenas a categoria — o campo
-- `nome` dessas linhas é o rótulo da categoria ("Supermercado"), não um estabelecimento,
-- e há uma linha por categoria por mês. A partir de 2026-05 as transações vêm de PDFs de
-- extrato e o nome é real.
--
-- Sem esta coluna, toda medição e todo código que agrupa por `nome` conta 377 rótulos de
-- categoria como se fossem estabelecimentos recorrentes. Foi o que contaminou a cobertura
-- de 73% da memória de categoria e a contagem de nomes com valor estável.
--
-- Por que coluna e não dedução: procedência não é derivável de nenhum campo existente.
-- `banco` está preenchido nas duas eras, e `created_at` não separa — a última importação
-- de planilha e a primeira de extrato caem ambas em 2026-05-27.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'extrato';

-- O CHECK aqui é seguro, ao contrário do `chk_banco` que foi derrubado em 27/08 (D-011):
-- aquele restringia um texto vindo de extração por IA, que inventa valores novos. Este é
-- um enum fechado, escrito só pelo nosso próprio código, e o DEFAULT já é um dos válidos.
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_origem_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_origem_check
  CHECK (origem IN ('extrato', 'planilha', 'manual'));

-- Backfill único da era de planilha.
--
-- Não é escopado por usuário de propósito: a fronteira vale para a base como ela existe
-- hoje, que tem um único histórico anterior a 2026-05. Usuário novo entra pelo DEFAULT
-- 'extrato', que é o correto para quem só importa PDF.
UPDATE public.transactions
   SET origem = 'planilha'
 WHERE data < DATE '2026-05-01';
