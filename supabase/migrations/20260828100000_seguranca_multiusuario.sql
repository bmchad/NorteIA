-- Etapa 0: fechar o banco antes de haver um segundo usuario.
-- Auditoria de 2026-08-27 sobre supabase-backup/supabase/schema.sql.
-- Ver context/30-decisoes-e-licoes.md D-009 (corrigida), D-021, D-022 e L-003.

-- ---------------------------------------------------------------------------
-- F1: `cores` era gravavel por qualquer anonimo.
--
-- A tabela tinha GRANT ALL para anon e nenhuma RLS. Como a anon key e publica e
-- esta no bundle, um DELETE pela API do PostgREST apagava a paleta de todo mundo
-- -- sem precisar nem de conta. Nao era vazamento, era destruicao.
--
-- Passa a ser o que sempre foi na intencao: paleta global, legivel por todos e
-- gravavel por ninguem. Edicao so pelo painel.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Paleta global e legivel por todos" ON public.cores;
CREATE POLICY "Paleta global e legivel por todos"
  ON public.cores FOR SELECT
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.cores FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.cores_id_seq FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- F2: `leads` era legivel por qualquer autenticado.
--
-- A policy usava auth.role() = 'authenticated', que e o papel embutido do
-- Supabase e nunca distinguiu admin de usuario. Com uma conta era inofensivo; no
-- segundo cadastro, qualquer pessoa leria nome, e-mail e telefone de todos os
-- leads. Nenhuma tela le essa tabela -- a leitura passa a ser pelo painel.
--
-- O REVOKE e cinto alem do suspensorio: derrubar a policy ja basta com RLS
-- ligada, mas ele garante que uma policy futura mal escrita nao reabra sozinha.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to read leads" ON public.leads;
REVOKE SELECT ON TABLE public.leads FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- F3: apagar uma conta era impossivel.
--
-- memory_user_id_fkey apontava para auth.users(id) SEM ON DELETE CASCADE, ao
-- contrario de categories, fixos, transactions e profiles. Deletar um usuario
-- falhava com violacao de chave estrangeira -- ou seja, nao havia direito ao
-- esquecimento. E sem policy de DELETE, nem o dono apagava a propria linha.
-- ---------------------------------------------------------------------------
ALTER TABLE public.memory DROP CONSTRAINT IF EXISTS memory_user_id_fkey;
ALTER TABLE public.memory
  ADD CONSTRAINT memory_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Usuarios podem apagar suas proprias notas" ON public.memory;
CREATE POLICY "Usuarios podem apagar suas proprias notas"
  ON public.memory FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- F6: handle_new_user era SECURITY DEFINER sem search_path fixo.
--
-- E o que o proprio Security Advisor do Supabase aponta. O corpo ja qualificava
-- public.profiles, entao fixar o search_path resolve sem mudar comportamento.
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
    RETURN new;
END;
$$;
