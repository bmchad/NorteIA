-- ---------------------------------------------------------------------------
-- A linha de `memory` passa a nascer com a conta.
--
-- O sintoma: `GET /rest/v1/memory?select=ciclo_dia&user_id=eq.<uid>` devolvia
-- `406 Not Acceptable` em cinco telas. Nao era permissao -- era cardinalidade:
-- `.single()` manda `Accept: application/vnd.pgrst.object+json`, que exige
-- exatamente UMA linha, e a tabela nao tinha nenhuma. `memory` so era criada
-- quando o usuario salvava o ciclo no /perfil ou uma nota no Dashboard, isto e,
-- talvez nunca.
--
-- O erro era engolido (`PGRST116`) e o front caia no padrao, entao nada quebrava
-- na tela. Mas o padrao vivia em oito lugares no TypeScript, e o banco nao tinha
-- opiniao nenhuma sobre o assunto.
--
-- Duas coisas mudam junto, e as duas fecham a mesma falha:
--   1. a linha existe desde o cadastro  -> nunca mais zero linhas;
--   2. `user_id` vira unico             -> nunca mais duas linhas.
-- ⭐ `.single()` responde 406 nos DOIS casos. Consertar so o primeiro deixaria
--    metade do defeito de pe.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Duplicatas, antes do indice.
--
-- A tabela e documentada como "uma linha por usuario" e nunca teve como garantir
-- isso: o codigo faz `select id` e decide entre update e insert, o que e uma
-- corrida. Fica a linha mais recente; as outras saem.
-- ---------------------------------------------------------------------------
DELETE FROM public.memory m
USING public.memory outra
WHERE m.user_id = outra.user_id
  AND (
    COALESCE(m.updated_at, '-infinity'::timestamptz) < COALESCE(outra.updated_at, '-infinity'::timestamptz)
    OR (m.updated_at IS NOT DISTINCT FROM outra.updated_at AND m.id < outra.id)
  );

-- ---------------------------------------------------------------------------
-- 2. Uma linha por usuario, imposta pelo banco.
--
-- ⚠️ Indice NAO parcial de proposito: `user_id` e NOT NULL aqui, e um indice
-- parcial nao pode ser inferido por `ON CONFLICT` -- foi o que quebrou o upsert
-- de `fixos` em 30/08.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS memory_user_id_unico
  ON public.memory (user_id);

-- ---------------------------------------------------------------------------
-- 3. O padrao passa a ser o dia 1.
--
-- ⭐ Dia 1 e o mes do calendario, que e o que a pessoa espera antes de configurar
-- qualquer coisa. O 5 era a ancora de salario de quem escreveu o sistema, e o
-- produto e horizontal.
--
-- ⭐ O numero mora AQUI, e a funcao abaixo nao o repete: um fato, um dono. Mudar
-- o padrao de novo e mexer nesta linha, nao em duas.
-- ---------------------------------------------------------------------------
ALTER TABLE public.memory ALTER COLUMN ciclo_dia SET DEFAULT 1;

-- ---------------------------------------------------------------------------
-- 4. Quem ja existe ganha a linha que faltava, tambem com 1.
--
-- O padrao novo vale para todo mundo, e nao so para conta nova.
-- ---------------------------------------------------------------------------
INSERT INTO public.memory (user_id)
SELECT u.id
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.memory m WHERE m.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4b. As linhas que ainda carregam o padrao ANTIGO passam para o novo.
--
-- ⚠️⚠️ Nao ha como distinguir um 5 escolhido de um 5 herdado. O `insert` de
-- nota do Dashboard grava `memory` sem `ciclo_dia`, entao a linha nascia com o
-- DEFAULT antigo sem ninguem ter decidido nada -- e fica identica a de quem
-- digitou 5 no /perfil. Trocar os dois e a decisao tomada: o dia 1 vale tambem
-- para as contas que ja existem.
--
-- ⛔ O que NAO se toca: qualquer valor diferente de 5. Um 7, um 10 ou um 15 so
-- pode ter vindo do campo do /perfil, e ali houve escolha explicita. Ciclo e o
-- campo de maior alcance do sistema -- mover o de quem escolheu reescreveria a
-- fronteira de todos os balancos dessa conta, em silencio.
-- ---------------------------------------------------------------------------
UPDATE public.memory SET ciclo_dia = 1 WHERE ciclo_dia = 5;

-- ---------------------------------------------------------------------------
-- 5. A conta nova nasce com a linha.
--
-- ⭐ Entra na `handle_new_user`, que ja existe e ja dispara no cadastro, em vez
-- de um segundo trigger em `auth.users`: "o que se cria quando uma conta nasce"
-- passa a ter um dono so. Trigger novo em `auth.users` tambem e coisa que o
-- Supabase desencoraja.
--
-- ⚠️ `SET search_path = ''` continua, e por isso todo nome e qualificado.
-- ⚠️ `ON CONFLICT DO NOTHING` para que um re-disparo nao derrube o cadastro: a
-- funcao roda dentro da transacao que cria o usuario, e falhar aqui significaria
-- a pessoa nao conseguir criar conta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (new.id, new.email);

    -- Sem `ciclo_dia` na lista: o valor e o DEFAULT da coluna, dono unico do numero.
    INSERT INTO public.memory (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN new;
END;
$$;

COMMENT ON COLUMN public.memory.ciclo_dia IS
  'O dia em que o mes do usuario comeca. Padrao 1 (mes do calendario). A linha nasce com a conta, por handle_new_user.';
