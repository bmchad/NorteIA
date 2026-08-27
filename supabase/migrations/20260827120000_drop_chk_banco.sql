-- O campo `banco` deixa de ser restringido pelo Postgres.
--
-- A constraint aceitava apenas 'Inter', 'XP' e 'Outros'. Isso duplicava a lista de bancos
-- entre o banco de dados e o prompt da IA, obrigando as duas a andarem em lockstep, e
-- rejeitava qualquer edicao manual do campo na tela de revisao -- que e texto livre.
--
-- O enum passa a existir em um lugar so: supabase/functions/ai-agents/lib/bancos.ts.
-- Ver context/30-decisoes-e-licoes.md D-011.

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_banco;
