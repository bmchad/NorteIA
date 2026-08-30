-- Corrige o indice criado na migration anterior: ele nao podia ser parcial.
--
-- ⛔ `CREATE UNIQUE INDEX ... WHERE assinatura IS NOT NULL` funciona como restricao, mas o
-- Postgres **nao infere indice parcial** num `ON CONFLICT (user_id, assinatura)` -- a
-- inferencia so acontece quando a propria consulta repete o predicado, coisa que o PostgREST
-- nao emite. O `upsert` do aceite automatico falharia com "no unique or exclusion constraint
-- matching the ON CONFLICT specification".
--
-- ⭐ E o `WHERE` era desnecessario desde o inicio: num indice unico o Postgres trata `NULL`
-- como DISTINTO de outro `NULL`, entao varios fixos manuais (assinatura nula) ja conviviam
-- sem ele. O filtro nao protegia nada e custava a inferencia.

DROP INDEX IF EXISTS public.fixos_assinatura_unica;

CREATE UNIQUE INDEX IF NOT EXISTS fixos_assinatura_unica
  ON public.fixos (user_id, assinatura);
