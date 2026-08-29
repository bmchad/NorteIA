-- A tela `/compromissos`: tipos de compromisso, rótulo na transação e o que `fixos` precisa
-- para guardar decisão em vez de só valor.
--
-- Ver zz_implementation/ETAPA-1-B1-v2.md.

-- ---------------------------------------------------------------------------------------
-- 1. `fixos` passa a guardar decisão, não só o número
-- ---------------------------------------------------------------------------------------
--
-- `fixos` continua consultativa: aceitar uma proposta NÃO lança transação. Um gasto fixo
-- que se auto-lança duplica em silêncio quando o lançamento real chega pelo extrato.

ALTER TABLE public.fixos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS periodicidade_meses smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ajuste_dia text,
  ADD COLUMN IF NOT EXISTS assinatura text,
  ADD COLUMN IF NOT EXISTS evidencia jsonb;

COMMENT ON COLUMN public.fixos.status IS 'ativo | rascunho | recusado | encerrado';
COMMENT ON COLUMN public.fixos.origem IS 'manual | auto-nome-valor | auto-valor-dia';
COMMENT ON COLUMN public.fixos.periodicidade_meses IS
  'Em quantos meses a cobrança se repete. O painel amortiza: valor / periodicidade. Sem '
  'isso uma cobrança trimestral entra como mensal e infla o comprometido em tres vezes.';
COMMENT ON COLUMN public.fixos.assinatura IS
  'Identifica a proposta para nao repropor o que foi recusado. NAO inclui valor: valor muda '
  'e a recusa deixaria de casar.';
COMMENT ON COLUMN public.fixos.evidencia IS
  'Os lancamentos que geraram a proposta. E o que a torna discutivel -- proposta que nao se '
  'explica nao e aceita nem revista.';

-- ---------------------------------------------------------------------------------------
-- 2. O rótulo de compromisso na transação
-- ---------------------------------------------------------------------------------------

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS compromisso text,
  ADD COLUMN IF NOT EXISTS compromisso_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transactions.compromisso IS
  'Slug do tipo de compromisso, ou nulo. Vem da regra deterministica (nome ja rotulado) ou '
  'da IA, nessa ordem.';
COMMENT ON COLUMN public.transactions.compromisso_manual IS
  'O usuario atribuiu ou removeu este rotulo a mao. Detecao automatica nao sobrescreve -- '
  'sem isso, a proxima importacao devolve o que ele tirou.';

-- ---------------------------------------------------------------------------------------
-- 3. Os tipos de compromisso
-- ---------------------------------------------------------------------------------------
--
-- Uma tabela só para tipo e compromisso detectado, e não duas: uma linha nasce como tipo
-- -- vocabulário que o prompt carrega -- e vira compromisso quando 3 ou mais transações
-- recebem o rótulo. São 1:1.
--
-- ⚠️ `ativo` e `status` são coisas diferentes: `ativo` diz se o tipo entra no prompt;
-- `status` é o ciclo de vida da proposta que ele gerou.

CREATE TABLE IF NOT EXISTS public.compromissos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  titulo text NOT NULL,
  origem text NOT NULL DEFAULT 'default',
  ativo boolean NOT NULL DEFAULT true,
  valor_mensal numeric,
  periodicidade_meses smallint,
  dia smallint,
  status text NOT NULL DEFAULT 'rascunho',
  assinatura text,
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, slug)
);

COMMENT ON COLUMN public.compromissos.ativo IS
  'O tipo entra no prompt da extracao. E o que o /perfil edita.';
COMMENT ON COLUMN public.compromissos.valor_mensal IS
  'Amortizado por mes. Editavel, e NAO recalcula sozinho: valor que persegue a propria media '
  'nunca discorda do usuario. O sistema avisa quando diverge; a decisao e dele.';
COMMENT ON COLUMN public.compromissos.status IS 'rascunho | aceito | recusado';

-- ⛔ RLS na mesma migration. Tabela nova nasce com GRANT ALL para `anon` -- e a licao da
-- Etapa 0, e ela vale exatamente aqui.
ALTER TABLE public.compromissos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem seus próprios compromissos" ON public.compromissos
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários criam seus próprios compromissos" ON public.compromissos
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários atualizam seus próprios compromissos" ON public.compromissos
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuários apagam seus próprios compromissos" ON public.compromissos
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS compromissos_user_ativo_idx
  ON public.compromissos (user_id, ativo);
CREATE INDEX IF NOT EXISTS transactions_compromisso_idx
  ON public.transactions (user_id, compromisso) WHERE compromisso IS NOT NULL;
