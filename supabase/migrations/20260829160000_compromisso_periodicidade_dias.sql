-- A periodicidade de um compromisso se mede em DIAS, não em meses.
--
-- Mês é grosso demais para o que esta tabela descreve: supermercado a cada 7 dias,
-- abastecimento a cada 15, estacionamento a cada 2. Arredondar isso para "mensal" perde
-- justamente a informação que ajuda a IA a encontrar os lançamentos certos.
--
-- ⚠️ `fixos.periodicidade_meses` continua em MESES e não muda: lá o que se descreve é
-- assinatura e cobrança contratada -- mensal, trimestral, anual -- e o painel amortiza por
-- mês. São duas grandezas diferentes em duas tabelas diferentes, de propósito.

ALTER TABLE public.compromissos
  RENAME COLUMN periodicidade_meses TO periodicidade_dias;

COMMENT ON COLUMN public.compromissos.periodicidade_dias IS
  'De quantos em quantos dias o compromisso costuma acontecer. Opcional: e uma pista para a '
  'IA, nao uma regra. Nao confundir com fixos.periodicidade_meses, que e outra grandeza.';
