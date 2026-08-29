-- Vocabulário do usuário: o que só ele sabe.
--
-- A memória de categoria (D-013) casa `nome` exato. `PIX ELIZABETH SILVA`,
-- `PIX ELIZABETH S` e `TED ELIZABETH` são três nomes diferentes -- nenhum chega a 3
-- confirmações, e o sistema nunca aprende que Elizabeth é a lavanderia. Nem o texto exato
-- nem a inferência semântica descobrem isso: só o usuário sabe.
--
-- ⭐ O mecanismo já existia e morria a cada uso: o campo de instrução livre em
-- /novos-registros ia ao prompt e sumia. Isto é o mesmo texto, guardado.
--
-- Duas formas, e a ordem entre elas importa (D-028):
--
--   regra  `nome contém X` → categoria/compromisso.  Roda no código. ZERO token.
--   nota   texto livre para o prompt.                Custa token em toda importação.
--
-- Regra primeiro: o caso motivador se resolve inteiro por substring, sem token e sem
-- variação, e pega as três grafias que a memória exata não pega. Nota fica para o que não
-- é mapeamento -- contexto ("o XP é só viagem"), regra de extração ("ignore abaixo de R$ 1").

CREATE TABLE IF NOT EXISTS public.vocabulario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('regra', 'nota')),

  -- regra
  padrao text,
  categoria_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  compromisso text,

  -- nota
  texto text,

  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Cada tipo exige o que lhe cabe, e nada além.
  CONSTRAINT vocabulario_forma CHECK (
    (tipo = 'regra' AND padrao IS NOT NULL AND (categoria_id IS NOT NULL OR compromisso IS NOT NULL))
    OR
    (tipo = 'nota' AND texto IS NOT NULL)
  )
);

COMMENT ON COLUMN public.vocabulario.padrao IS
  'Trecho procurado no `nome` da transacao, sem diferenciar maiuscula. "Elizabeth" pega '
  'PIX ELIZABETH SILVA e TED ELIZABETH.';
COMMENT ON COLUMN public.vocabulario.texto IS
  'Instrucao livre que vai ao prompt. E a unica forma que custa token -- e a unica que '
  'precisa de teto.';

ALTER TABLE public.vocabulario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem seu próprio vocabulário" ON public.vocabulario
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários criam seu próprio vocabulário" ON public.vocabulario
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários atualizam seu próprio vocabulário" ON public.vocabulario
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuários apagam seu próprio vocabulário" ON public.vocabulario
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS vocabulario_user_tipo_idx ON public.vocabulario (user_id, tipo);
