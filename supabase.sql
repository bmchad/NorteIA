-- Criação da tabela de categorias
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ativar RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Políticas para Categories
CREATE POLICY "Usuários podem ver suas próprias categorias" 
ON categories FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir suas próprias categorias" 
ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias categorias" 
ON categories FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias categorias" 
ON categories FOR DELETE USING (auth.uid() = user_id);

-- Criação da tabela de transações
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  data DATE NOT NULL,
  nome TEXT NOT NULL,
  apelido TEXT,
  valor NUMERIC(10, 2) NOT NULL,
  banco TEXT,
  categoria_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  hora TIME DEFAULT '12:00:00',
  parcela_atual INTEGER,
  parcela_total INTEGER,
  pendente BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ativar RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Políticas para Transactions
CREATE POLICY "Usuários podem ver suas próprias transações" 
ON transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir suas próprias transações" 
ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias transações" 
ON transactions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias transações" 
ON transactions FOR DELETE USING (auth.uid() = user_id);

-- Criação da tabela de memória (bloco de notas do Dashboard)
CREATE TABLE memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ativar RLS
ALTER TABLE memory ENABLE ROW LEVEL SECURITY;

-- Políticas para Memory
CREATE POLICY "Usuários podem ver sua própria memória" 
ON memory FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir sua própria memória" 
ON memory FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar sua própria memória" 
ON memory FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar sua própria memória" 
ON memory FOR DELETE USING (auth.uid() = user_id);
