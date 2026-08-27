-- Etapa 1, C2: comentario livre na transacao.
--
-- E onde mora "isso foi presente da minha mae", que nenhuma categoria captura.
-- Opcional: Pendentes.tsx insere sem ele.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS comentario text;
