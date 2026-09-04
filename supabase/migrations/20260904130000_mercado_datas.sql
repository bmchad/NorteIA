-- As cobrancas de VALOR VARIAVEL que o usuario aceitou (ou recusou) no Mercado de Datas.
--
-- ⭐⭐ **Por que uma cobranca de valor variavel vale para o mercado, mas nao para o comprometido.**
-- Conta de consumo -- Enel, agua, internet -- tem nome estavel e dia estavel, e valor que muda todo
-- mes. Para o painel de comprometido isso a torna um mau gasto fixo: afirmar "R$ 240 por mes" e
-- afirmar um numero que ninguem mediu. Para o Mercado de Datas e o contrario: **a DATA e confiavel
-- mesmo quando o valor nao e**, e e a data que aquela tela usa. Entao ela entra la, e o painel de
-- comprometido nao muda -- as transacoes continuam contadas como Previsivel, pelo rotulo.
--
-- ⭐ **Guarda a DECISAO, nao a deteccao** -- mesmo desenho de `fixos` (D-013). Quais grupos existem
-- e recalculado do historico a cada carga; o que nao da para derivar e se o usuario aceitou.
--
-- ⚠️⚠️ **Nada aqui e aceito sozinho, e a medicao explica por que.** O filtro (nome identico, dia
-- ±1, uma vez por ciclo, valor variando) pega a conta de internet -- CV de 5% -- e pega junto o
-- posto de gasolina, com CV de 13% a 23%. Nenhum teto de dispersao separa os dois com seguranca:
-- 10% barraria os postos e barraria tambem uma Enel sazonal, que e justamente o caso de uso. Como
-- a diferenca entre "conta que eu devo" e "compra que eu escolho" nao esta nos numeros, quem decide
-- e a pessoa. Toda linha desta tabela nasceu de um clique.
--
-- ⚠️ **NAO tem `fixo_id`.** A versao inicial da ideia previa uma linha por cobranca do mercado,
-- incluindo os fixos ativos, ligadas por FK com ON DELETE CASCADE. Fixo ativo nao e linha aqui: ele
-- continua derivado por `cobrancasDoCiclo` a cada carga, e persisti-lo criaria um problema que o
-- cascade nao resolve -- **encerrar um fixo nao e DELETE**, e o status `encerrado` deixaria uma
-- cobranca fantasma no mercado para sempre. O que o cascade tentava evitar, um dedup por
-- `assinatura` resolve melhor: grupo que ja casa com fixo ativo nao e proposto.

CREATE TABLE IF NOT EXISTS public.mercado_datas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ⚠️ ON DELETE CASCADE desde o nascimento, pelo motivo da migration 20260828100000: a FK de
  -- `memory` nasceu sem ele e virou divida.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ⭐⭐ A identidade, e ela e `assinaturaDe(nome, periodicidade)` -- **sem o valor**. E o que
  -- permite o valor variar sem a cobranca perder a identidade, e e a mesma chave que
  -- `mesmoCompromisso` usa no ramo de assinatura, entao os dois lados casam a mesma coisa.
  assinatura text NOT NULL,
  -- O apelido, so para exibir. ⚠️ A deteccao agrupa pelo nome CRU; este e o nome bonito.
  nome text NOT NULL,
  -- Dia do mes em que ela costuma cair. ⚠️ Dia do MES, como `fixos.dia` -- nao dia do ciclo.
  dia smallint NOT NULL CHECK (dia > 0 AND dia < 32),
  periodicidade_meses smallint NOT NULL DEFAULT 1 CHECK (periodicidade_meses > 0),
  -- ⛔ `recusado` e um estado, nao uma linha ausente: sem ele a proposta recusada volta na carga
  -- seguinte, e a decisao do usuario dura ate o proximo F5. Foi a licao que `fixos.status` ja
  -- carrega (ver o comentario de `dispensada` em src/lib/fixos-propostos.ts).
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'recusado')),
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.mercado_datas IS
  'Cobrancas de valor variavel aceitas ou recusadas no Mercado de Datas. Guarda a decisao, nunca a '
  'deteccao. Nao inclui gastos fixos, que continuam derivados de `fixos` por cobrancasDoCiclo.';

-- Uma decisao por cobranca por usuario. E tambem o que faz o aceite ser idempotente.
CREATE UNIQUE INDEX IF NOT EXISTS mercado_datas_user_assinatura
  ON public.mercado_datas (user_id, assinatura);

-- ---------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------
--
-- ⛔ Na mesma migration, sempre. Tabela nova nasce com GRANT ALL para `anon`: sem politica, ela
-- esta aberta para a internet no instante em que e criada. E a licao da Etapa 0 (L-003), e foi
-- assim que `cores` ficou gravavel por qualquer anonimo por meses.

ALTER TABLE public.mercado_datas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem seu próprio mercado de datas" ON public.mercado_datas;
CREATE POLICY "Usuários veem seu próprio mercado de datas" ON public.mercado_datas
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários criam no próprio mercado de datas" ON public.mercado_datas;
CREATE POLICY "Usuários criam no próprio mercado de datas" ON public.mercado_datas
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ⚠️ UPDATE precisa de USING E WITH CHECK. Só o USING deixaria trocar o `user_id` da própria
-- linha e entregá-la a outra conta.
DROP POLICY IF EXISTS "Usuários editam o próprio mercado de datas" ON public.mercado_datas;
CREATE POLICY "Usuários editam o próprio mercado de datas" ON public.mercado_datas
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários apagam do próprio mercado de datas" ON public.mercado_datas;
CREATE POLICY "Usuários apagam do próprio mercado de datas" ON public.mercado_datas
  FOR DELETE USING (auth.uid() = user_id);
