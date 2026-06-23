-- Adiciona a coluna mes_fatura
ALTER TABLE transactions 
ADD COLUMN mes_fatura TEXT;

-- Adiciona a constraint para restringir os valores da coluna banco
ALTER TABLE transactions 
ADD CONSTRAINT chk_banco CHECK (banco IN ('Inter', 'XP', 'Outros')) NOT VALID;
