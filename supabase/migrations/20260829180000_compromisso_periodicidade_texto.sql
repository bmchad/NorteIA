-- A periodicidade de um compromisso vira texto livre.
--
-- O campo existe para uma coisa só: ser lido pela IA no prompt. Para ela, "todo mês",
-- "2 vezes por semana" e "de dois em dois meses" são igualmente compreensíveis -- e nenhum
-- deles cabe num smallint. Estruturar o que só vai virar frase é cerimônia sem ganho.
--
-- `dia` sai pelo mesmo motivo: também só ia ao prompt, e "todo mês, dia 10" é uma frase só.
-- Manter um campo numérico ao lado de um texto livre, ambos servindo ao mesmo leitor, é
-- pedir que o usuário adivinhe qual usar.
--
-- ⚠️ `fixos.dia` e `fixos.periodicidade_meses` NÃO mudam: lá os dois têm função no código.
-- `periodicidade_meses` é o divisor da amortização, e `dia` é quando a cobrança cai. Aqui
-- não: são pistas. Ver context/30-decisoes-e-licoes.md.

ALTER TABLE public.compromissos
  ALTER COLUMN periodicidade_dias TYPE text
  USING CASE
    WHEN periodicidade_dias IS NULL THEN NULL
    WHEN periodicidade_dias = 1 THEN 'todo dia'
    WHEN periodicidade_dias = 7 THEN 'toda semana'
    WHEN periodicidade_dias = 30 THEN 'todo mês'
    ELSE 'a cada ' || periodicidade_dias || ' dias'
  END;

ALTER TABLE public.compromissos
  RENAME COLUMN periodicidade_dias TO periodicidade;

ALTER TABLE public.compromissos DROP COLUMN IF EXISTS dia;

COMMENT ON COLUMN public.compromissos.periodicidade IS
  'Texto livre lido pela IA: "todo mes", "2 vezes por semana", "todo dia 10". E pista, nao '
  'regra -- nenhum codigo interpreta este campo.';
