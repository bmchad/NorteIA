-- O dia em que a fatura de cada banco vence.
--
-- Contraparte de `transactions.tipo`: a coluna diz QUE uma transacao e de cartao, esta
-- tabela diz QUANDO o dinheiro dela sai da conta. Sem as duas, o Mercado de Datas nao tem
-- como posicionar a maior saida do mes.
--
-- ⭐ Por banco, e nao um numero unico em `memory`, porque quem tem dois cartoes tem duas
-- faturas em dias diferentes -- e sao dois marcadores no grafico, nao um. `transactions.banco`
-- e o que liga uma linha de cartao ao vencimento dela.
--
-- ⚠️⚠️ VENCIMENTO NAO E FECHAMENTO, e a confusao entre os dois e cara.
--
--   memory.ciclo_dia      FECHAMENTO -- onde o ciclo corta. Mexer nele muda src/lib/ciclo.ts,
--                         o /meses, o Dashboard e as medias do proprio Mercado de Datas
--   vencimentos.dia       VENCIMENTO -- quando o dinheiro sai. Mexer nele nao muda estrutura
--                         nenhuma, so a posicao de um debito dentro do ciclo
--
-- E e justamente por isso que o vencimento da fatura e a melhor carta do produto: e a maior
-- saida do mes, e mudar a data dela e unilateral -- e produto do proprio banco, nao depende
-- de negociar com recebedor nenhum.
--
-- Regra de qual fatura cai em qual ciclo: a fatura que fecha no fim do ciclo N-1 e debitada
-- DURANTE o ciclo N, no `dia` daquele banco. E o caso realista -- fatura grande no comeco do
-- ciclo, disputando com um salario que ainda nao caiu.
--
-- ⛔ Sem linha aqui nao se chuta um dia. Cartao de banco nao configurado fica FORA da curva,
-- com a tela pedindo a configuracao -- mesmo principio do "sem historico nao se afirma nada"
-- de src/lib/reserva.ts: chutar produziria um aviso falso, pior que aviso nenhum.

CREATE TABLE IF NOT EXISTS public.vencimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ⚠️ ON DELETE CASCADE desde o nascimento. A FK de `memory` apontava para auth.users(id)
  -- sem cascade e virou divida na migration 20260828100000.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Texto livre, casando com `transactions.banco`, que tambem e livre desde a D-011. Sem FK
  -- e sem CHECK: o dono do enum de bancos e supabase/functions/ai-agents/lib/bancos.ts, e
  -- duplicar a lista no Postgres foi exatamente o que a `chk_banco` fazia de errado.
  banco text NOT NULL,
  -- ⚠️ Mesma faixa de `memory.ciclo_dia`, pelo mesmo motivo: dia 29-31 nao existe em todo
  -- mes, e um vencimento que some em fevereiro e um bug silencioso.
  dia smallint NOT NULL CHECK (dia > 0 AND dia < 29),
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.vencimentos IS
  'Dia do vencimento da fatura de cartao, por banco. Contraparte de transactions.tipo = '
  '"credito": e o dia em que a soma daquele cartao sai da conta. Configurado em /perfil.';

-- Um vencimento por banco por usuario. O /perfil edita a linha existente em vez de criar
-- outra, e o indice e quem garante que nao ha dois dias competindo pelo mesmo cartao.
CREATE UNIQUE INDEX IF NOT EXISTS vencimentos_user_banco
  ON public.vencimentos (user_id, banco);

-- ---------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------
--
-- ⛔ Na mesma migration, sempre. Tabela nova nasce com GRANT ALL para `anon`: sem politica,
-- ela esta aberta para a internet no instante em que e criada. E a licao da Etapa 0 (L-003),
-- e foi assim que `cores` ficou gravavel por qualquer anonimo por meses.

ALTER TABLE public.vencimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem seus próprios vencimentos" ON public.vencimentos;
CREATE POLICY "Usuários veem seus próprios vencimentos" ON public.vencimentos
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários criam seus próprios vencimentos" ON public.vencimentos;
CREATE POLICY "Usuários criam seus próprios vencimentos" ON public.vencimentos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ⚠️ UPDATE precisa de USING E WITH CHECK. Só o USING deixaria trocar o `user_id` da
-- própria linha e entregá-la a outra conta.
DROP POLICY IF EXISTS "Usuários editam seus próprios vencimentos" ON public.vencimentos;
CREATE POLICY "Usuários editam seus próprios vencimentos" ON public.vencimentos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários apagam seus próprios vencimentos" ON public.vencimentos;
CREATE POLICY "Usuários apagam seus próprios vencimentos" ON public.vencimentos
  FOR DELETE USING (auth.uid() = user_id);
