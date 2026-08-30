-- Exemplos de transação por tipo de compromisso.
--
-- ⭐ Um tipo hoje é slug, título e valor. Passa a ter também os lançamentos que você aponta
-- como sendo dele. Serve a duas coisas ao mesmo tempo: ensina o agente que classifica
-- `compromisso`, e documenta para você o que "aquele tipo" quer dizer.
--
-- Ver zz_implementation/ETAPA-1-B1-v4.md, bloco B2.

CREATE TABLE IF NOT EXISTS public.compromisso_exemplos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  -- ⚠️ Tabela, e não um array jsonb em `compromissos`: id de transação guardado solto fica
  -- pendurado quando a transação é apagada. Com a FK, o cascade limpa sozinho.
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, slug, transaction_id)
);

COMMENT ON TABLE public.compromisso_exemplos IS
  'Ate 10 transacoes por tipo, apontadas pelo usuario ou herdadas de uma proposta aceita. '
  'Entram no prompt do agente que classifica compromisso.';

-- ---------------------------------------------------------------------------------------
-- O teto de 10, no banco
-- ---------------------------------------------------------------------------------------
--
-- ⛔ O teto existe por causa da escala do prompt: com 25 tipos ativos, 10 exemplos cada ja
-- sao 250 linhas em toda importacao. Checar so no front deixa a porta aberta -- PostgREST
-- aceita insert de qualquer cliente autenticado, e o front nao e o unico caminho ate a
-- tabela.

CREATE OR REPLACE FUNCTION public.checar_teto_exemplos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.compromisso_exemplos
    WHERE user_id = NEW.user_id AND slug = NEW.slug
  ) >= 10 THEN
    RAISE EXCEPTION 'Limite de 10 exemplos por compromisso atingido para "%".', NEW.slug
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teto_exemplos ON public.compromisso_exemplos;
CREATE TRIGGER teto_exemplos
  BEFORE INSERT ON public.compromisso_exemplos
  FOR EACH ROW EXECUTE FUNCTION public.checar_teto_exemplos();

-- ---------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------
--
-- ⛔ Na mesma migration, sempre. Tabela nova nasce com GRANT ALL para `anon`: sem politica,
-- ela esta aberta para a internet no instante em que e criada. E a licao da Etapa 0.

ALTER TABLE public.compromisso_exemplos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem seus próprios exemplos" ON public.compromisso_exemplos
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários criam seus próprios exemplos" ON public.compromisso_exemplos
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários apagam seus próprios exemplos" ON public.compromisso_exemplos
  FOR DELETE USING (auth.uid() = user_id);

-- Sem policy de UPDATE de proposito: exemplo se acrescenta e se remove, nao se edita.

CREATE INDEX IF NOT EXISTS compromisso_exemplos_user_slug_idx
  ON public.compromisso_exemplos (user_id, slug);
