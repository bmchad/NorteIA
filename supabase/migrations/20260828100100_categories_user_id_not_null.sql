-- Etapa 0, F7: categoria sem dono e dado orfao.
--
-- Uma linha com user_id nulo fica invisivel para todos, porque auth.uid() = NULL
-- e nulo e nao verdadeiro. Nao e falha de seguranca, mas e dado que ninguem ve e
-- ninguem apaga.
--
-- Esta migration esta separada da anterior de proposito: se houver orfa, ela
-- falha e a de seguranca ja tera sido aplicada. Falhar com mensagem legivel e
-- melhor que falhar com violacao de constraint.

DO $$
DECLARE
  orfas integer;
BEGIN
  SELECT count(*) INTO orfas FROM public.categories WHERE user_id IS NULL;

  IF orfas > 0 THEN
    RAISE EXCEPTION
      'Ha % categoria(s) com user_id nulo. Decida entre atribuir a um usuario ou apagar, e rode de novo.', orfas;
  END IF;

  ALTER TABLE public.categories ALTER COLUMN user_id SET NOT NULL;
END $$;
