-- Open Finance: unicidade escopada por USUARIO, nao global.
--
-- ⛔⛔ **O que isto conserta e um vazamento entre usuarios, nao um detalhe de indice.**
-- A migration 20260924120000 criou os dois unicos sem `user_id`:
--
--   open_finance_itens_pluggy_id    ON open_finance_itens (pluggy_item_id)
--   open_finance_transacao_unica    ON open_finance      (pluggy_transaction_id)
--
-- E `gravar.ts` grava com `upsert(..., { onConflict: 'pluggy_transaction_id' })`, com `user_id`
-- DENTRO da linha. Entao, se duas pessoas conectam a mesma conta conjunta, o upsert da segunda
-- encontra a linha da primeira pelo id da transacao e **reescreve o `user_id`**: a linha troca de
-- dono, e a primeira pessoa a perde da propria visao. Nenhum erro, nenhum log.
--
-- ⭐ Escopar em `user_id` remove a colisao por construcao: cada pessoa tem a propria copia da
-- mesma transacao externa, e mexer na de uma nao alcanca a da outra.
--
-- ⚠️ **A consequencia de desenho vem junto, e e maior que o indice:** um item passa a poder ter
-- MAIS DE UM DONO. Isso e o caso legitimo da conta conjunta -- mas tambem significa que a guarda
-- "recusar troca de dono" do `gravarItem` deixou de proteger, porque acrescentar um dono nao e
-- mais trocar. Quem protege agora e a separacao de papeis:
--
--   webhook (nao autenticado)  -> pode reivindicar item SEM dono; nunca acrescenta um segundo
--   pluggy-register-item (JWT) -> unico caminho para acrescentar dono a item JA possuido
--
-- Ver `supabase/functions/pluggy-webhook/gravar.ts` e `supabase/functions/pluggy-register-item/`.

-- ---------------------------------------------------------------------------------------
-- open_finance_itens
-- ---------------------------------------------------------------------------------------

DROP INDEX IF EXISTS public.open_finance_itens_pluggy_id;

CREATE UNIQUE INDEX IF NOT EXISTS open_finance_itens_dono_item
  ON public.open_finance_itens (user_id, pluggy_item_id);

-- Para o webhook achar TODOS os donos de um item sem varrer a tabela.
CREATE INDEX IF NOT EXISTS open_finance_itens_por_item
  ON public.open_finance_itens (pluggy_item_id);

-- ---------------------------------------------------------------------------------------
-- open_finance
-- ---------------------------------------------------------------------------------------

DROP INDEX IF EXISTS public.open_finance_transacao_unica;

-- ⚠️ NAO PARCIAL, pelo mesmo motivo da 20260924120000: o Postgres nao infere indice parcial em
-- `ON CONFLICT`, e o upsert falharia com "no unique or exclusion constraint matching".
CREATE UNIQUE INDEX IF NOT EXISTS open_finance_transacao_do_dono
  ON public.open_finance (user_id, pluggy_transaction_id);

COMMENT ON INDEX public.open_finance_transacao_do_dono IS
  'Unico por (user_id, pluggy_transaction_id), nao por pluggy_transaction_id sozinho: duas '
  'pessoas na mesma conta conjunta espelham a mesma transacao externa, cada uma na propria linha.';
