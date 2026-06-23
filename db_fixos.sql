-- Criação da tabela de Gastos Fixos
CREATE TABLE IF NOT EXISTS fixos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    valor NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE fixos ENABLE ROW LEVEL SECURITY;

-- Política: Usuário pode selecionar apenas seus próprios gastos fixos
CREATE POLICY "Usuários podem ver seus próprios fixos" 
ON fixos FOR SELECT 
USING (auth.uid() = user_id);

-- Política: Usuário pode inserir seus próprios gastos fixos
CREATE POLICY "Usuários podem inserir seus próprios fixos" 
ON fixos FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Política: Usuário pode atualizar seus próprios gastos fixos
CREATE POLICY "Usuários podem atualizar seus próprios fixos" 
ON fixos FOR UPDATE 
USING (auth.uid() = user_id);

-- Política: Usuário pode deletar seus próprios gastos fixos
CREATE POLICY "Usuários podem deletar seus próprios fixos" 
ON fixos FOR DELETE 
USING (auth.uid() = user_id);
