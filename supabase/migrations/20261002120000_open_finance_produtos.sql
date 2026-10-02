-- Open Finance: backfill do item, identidade (CPF), investimentos e emprestimos.
--
-- ⭐⭐ **O que motivou: 100 de 302 transacoes do item de teste, e a causa nao era o sinal.** O item
-- nasceu sem `clientUserId`, o `transactions/created` chegou quando ele ainda nao tinha dono
-- (`item_orfao`, tudo descartado) e o registro pelo `pluggy-register-item` so veio no dia seguinte.
-- Nada refazia a carga quando um item ganhava dono. As 100 que chegaram foram as que a Pluggy
-- reenviou por `transactions/updated`. A correcao e de fluxo, no codigo: todo `item/*` e todo
-- registro autenticado passa a rodar uma sincronizacao completa e idempotente do item. Esta
-- migration da a ela onde gravar.
--
-- ⭐ **O principio dos produtos novos e o mesmo do commit 720ece4:** a fonte entra em COLUNAS
-- EXPLICITAS, com `jsonb` so para estrutura aninhada que tem valor analitico. **Nao ha objeto cru**
-- em nenhuma tabela desta migration, e identificador de pessoa sai NA GRAVACAO
-- (`supabase/functions/pluggy-webhook/produtos.ts`).
--
-- ⛔ **`valor` nao aparece em tabela nova nenhuma, e a ausencia e deliberada.** Em `open_finance` e
-- `transactions`, `valor` e fluxo assinado (invariante 4 do CLAUDE.md). Saldo de investimento,
-- montante contratado e saldo devedor nao sao fluxo -- dar o mesmo nome a eles convidaria a soma-los.

-- ---------------------------------------------------------------------------------------
-- open_finance: corrente x poupanca, e a versao da Pluggy
-- ---------------------------------------------------------------------------------------

-- ⚠️ `tipo` e o `account.type` ('BANK' | 'CREDIT') e nao separa conta corrente de poupanca. O item
-- de teste tem as duas, com 100 transacoes cada, e a poupanca passou despercebida justamente por
-- isso: sob `tipo = 'BANK'` as duas sao a mesma coisa.
ALTER TABLE public.open_finance ADD COLUMN IF NOT EXISTS subtipo text;
ALTER TABLE public.open_finance ADD COLUMN IF NOT EXISTS pluggy_atualizado_em timestamptz;

COMMENT ON COLUMN public.open_finance.subtipo IS
  'account.subtype da Pluggy, cru: CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD. Sem CHECK: '
  'a Pluggy acrescenta subtipo sem avisar.';
COMMENT ON COLUMN public.open_finance.pluggy_atualizado_em IS
  'transaction.updatedAt da Pluggy. E o que o trigger open_finance_nao_regride compara.';

-- ⛔ Correcao do texto que a 20260924120000 deixou no banco. Ele afirmava que a Pluggy manda o
-- valor assinado numa convencao conhecida, e isso ainda nao foi medido num cartao real.
COMMENT ON TABLE public.open_finance IS
  'Espelho das transacoes do Open Finance (Pluggy), antes de qualquer traducao. Nomes de coluna '
  'alinhados a public.transactions; valores CRUS. Nada entra em transactions automaticamente.';
COMMENT ON COLUMN public.open_finance.valor IS
  'transaction.amount da Pluggy, copiado sem conversao. A convencao de sinal no cartao de credito '
  'NAO esta medida: a documentacao da Pluggy e o sandbox discordam, e so um cartao real decide. '
  'Nao tratar como saida-negativa antes disso.';

-- ---------------------------------------------------------------------------------------
-- open_finance_itens: quando a ultima sincronizacao completa terminou
-- ---------------------------------------------------------------------------------------

ALTER TABLE public.open_finance_itens ADD COLUMN IF NOT EXISTS sincronizado_em timestamptz;

COMMENT ON COLUMN public.open_finance_itens.sincronizado_em IS
  'Fim da ultima sincronizacao completa em que nenhuma etapa falhou nem foi adiada. Serve para '
  'observabilidade e para o intervalo minimo do pluggy-register-item; NUNCA para decidir se um '
  'evento da Pluggy sincroniza.';

-- ---------------------------------------------------------------------------------------
-- O trigger que impede regressao
-- ---------------------------------------------------------------------------------------
--
-- ⭐⭐ **A corrida que ele fecha:** a sincronizacao completa lista a conta inteira e grava pagina a
-- pagina. No meio dela pode chegar um `transactions/updated` com a versao POSTED de uma linha que a
-- listagem leu ainda PENDING. Sem o trigger, a pagina atrasada grava PENDING por cima do POSTED, e
-- a linha regride ate a proxima sincronizacao.
--
-- ⚠️ **`<` estrito, de proposito.** Igual REESCREVE -- e e isso que preenche `subtipo` nas linhas
-- que ja existiam antes desta migration, com o mesmo `updatedAt` de sempre.
-- ⚠️ `OLD` nulo (toda linha anterior a esta migration) nao bloqueia: comparacao com NULL nao e
-- verdadeira, e a linha e reescrita.
--
-- ⭐ `RETURN NULL` num BEFORE UPDATE pula a linha **sem erro**, inclusive dentro de
-- `INSERT ... ON CONFLICT DO UPDATE` -- o upsert do lote segue, so aquela linha fica como estava.

CREATE OR REPLACE FUNCTION public.open_finance_nao_regride()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.pluggy_atualizado_em < OLD.pluggy_atualizado_em THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.open_finance_nao_regride() IS
  'BEFORE UPDATE: descarta a escrita quando NEW.pluggy_atualizado_em e mais VELHO que o gravado. '
  'Igual reescreve. Usado pelas tabelas do Open Finance que tem updatedAt da Pluggy.';

DROP TRIGGER IF EXISTS open_finance_nao_regride ON public.open_finance;
CREATE TRIGGER open_finance_nao_regride
  BEFORE UPDATE ON public.open_finance
  FOR EACH ROW EXECUTE FUNCTION public.open_finance_nao_regride();

-- ---------------------------------------------------------------------------------------
-- open_finance_identidades: o CPF, so como HMAC
-- ---------------------------------------------------------------------------------------
--
-- ⭐⭐ **Para que serve:** reconhecer que dois itens sao da mesma pessoa sem guardar quem ela e. O
-- vinculo CPF -> user_id so e GUARDADO. Nenhum codigo atribui item a usuario por ele, e conta
-- conjunta e ignorada (so grava quando o item tem exatamente um dono).
--
-- ⛔ **Da identidade da Pluggy, so isto.** Nome, nascimento, endereco, telefone, e-mail, relacoes e
-- emprego chegam no mesmo objeto e nao entram -- nenhum alimenta analise do NorteIA.
--
-- ⛔ **HMAC, nao hash.** CPF tem 11 digitos e 10^9 valores possiveis (os 2 ultimos sao verificador):
-- um SHA-256 puro se inverte varrendo o espaco todo em minutos. Com o segredo
-- `OPEN_FINANCE_CPF_SEGREDO` (secret da Edge Function, fora do banco), o dump sozinho nao inverte.
-- ⚠️ Trocar o segredo invalida TODOS os hashes. O procedimento e esvaziar esta tabela; a proxima
-- sincronizacao de cada item repoe.

CREATE TABLE IF NOT EXISTS public.open_finance_identidades (
  -- ⭐ Um CPF por usuario: e a chave, e por isso nao ha indice (user_id, pluggy_item_id) aqui --
  -- a PK ja e o caminho de toda leitura.
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ⚠️ Nome de constraint explicito: a funcao distingue "CPF de outro usuario" (esta) de "corrida
  -- com a mesma pessoa" (a PK) pelo nome que vem na mensagem do 23505.
  cpf_hmac text NOT NULL
    CONSTRAINT open_finance_identidades_cpf_unico UNIQUE
    CONSTRAINT open_finance_identidades_cpf_formato CHECK (cpf_hmac ~ '^[0-9a-f]{64}$'),
  -- O item de onde o CPF veio. So procedencia: nao muda se outro item do mesmo usuario trouxer o mesmo.
  pluggy_item_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.open_finance_identidades IS
  'HMAC-SHA256 do CPF do titular (identity.document da Pluggy), um por usuario. So guardado: nada '
  'atribui item por ele. Nenhuma tela le; anon e authenticated nao tem acesso nenhum.';
COMMENT ON COLUMN public.open_finance_identidades.cpf_hmac IS
  'HMAC-SHA256 em hex dos 11 digitos de identity.document (documentType = CPF), com o secret '
  'OPEN_FINANCE_CPF_SEGREDO. Trocar o secret invalida todos.';
COMMENT ON COLUMN public.open_finance_identidades.pluggy_item_id IS
  'O item (identity.itemId) de onde o CPF foi lido pela primeira vez.';

-- ---------------------------------------------------------------------------------------
-- open_finance_investimentos: a posicao
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.open_finance_investimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id text NOT NULL,
  pluggy_investment_id text NOT NULL,
  nome text,
  codigo text,
  isin text,
  tipo text,
  subtipo text,
  status text,
  saldo numeric(14,2),
  montante numeric(14,2),
  montante_original numeric(14,2),
  montante_lucro numeric(14,2),
  montante_resgatado numeric(14,2),
  impostos numeric(14,2),
  impostos2 numeric(14,2),
  valor_cota numeric,
  quantidade numeric,
  taxa numeric,
  taxa_tipo text,
  taxa_periodicidade text,
  taxa_fixa_anual numeric,
  indexador text,
  rentab_mes numeric,
  rentab_12m numeric,
  rentab_anual numeric,
  isento_ir boolean,
  cupom jsonb,
  data date,
  data_compra date,
  data_emissao date,
  vencimento date,
  carencia date,
  emissor text,
  emissor_cnpj text,
  moeda text NOT NULL DEFAULT 'BRL',
  pluggy_atualizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  atualizado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.open_finance_investimentos IS
  'Posicao de investimentos do Open Finance (GET /investments da Pluggy), uma linha por '
  'investimento por dono. Colunas explicitas, sem objeto cru. Fora de proposito: owner, number e '
  'metadata. Posicao que some da listagem COMPLETA de um item UPDATED e apagada.';
COMMENT ON COLUMN public.open_finance_investimentos.pluggy_investment_id IS 'investment.id';
COMMENT ON COLUMN public.open_finance_investimentos.nome IS
  'investment.name, SEM sequencia com forma de CPF: no sandbox o nome do CRI repete o CPF do emissor.';
COMMENT ON COLUMN public.open_finance_investimentos.codigo IS 'investment.code';
COMMENT ON COLUMN public.open_finance_investimentos.isin IS 'investment.isin';
COMMENT ON COLUMN public.open_finance_investimentos.tipo IS 'investment.type, cru (FIXED_INCOME, EQUITY, MUTUAL_FUND...)';
COMMENT ON COLUMN public.open_finance_investimentos.subtipo IS 'investment.subtype, cru (CDB, CRI, STOCK, TREASURY...)';
COMMENT ON COLUMN public.open_finance_investimentos.status IS 'investment.status, cru (ACTIVE, TOTAL_WITHDRAWAL...)';
COMMENT ON COLUMN public.open_finance_investimentos.saldo IS 'investment.balance';
COMMENT ON COLUMN public.open_finance_investimentos.montante IS 'investment.amount';
COMMENT ON COLUMN public.open_finance_investimentos.montante_original IS 'investment.amountOriginal';
COMMENT ON COLUMN public.open_finance_investimentos.montante_lucro IS 'investment.amountProfit';
COMMENT ON COLUMN public.open_finance_investimentos.montante_resgatado IS 'investment.amountWithdrawal';
COMMENT ON COLUMN public.open_finance_investimentos.impostos IS 'investment.taxes';
COMMENT ON COLUMN public.open_finance_investimentos.impostos2 IS 'investment.taxes2';
COMMENT ON COLUMN public.open_finance_investimentos.valor_cota IS 'investment.value (preco unitario / cota)';
COMMENT ON COLUMN public.open_finance_investimentos.quantidade IS 'investment.quantity';
COMMENT ON COLUMN public.open_finance_investimentos.taxa IS 'investment.rate';
COMMENT ON COLUMN public.open_finance_investimentos.taxa_tipo IS 'investment.rateType, cru (CDI...)';
COMMENT ON COLUMN public.open_finance_investimentos.taxa_periodicidade IS 'investment.ratePeriodicity, cru (MONTHLY, DAILY...)';
COMMENT ON COLUMN public.open_finance_investimentos.taxa_fixa_anual IS 'investment.fixedAnnualRate';
COMMENT ON COLUMN public.open_finance_investimentos.indexador IS 'investment.indexerAdditionalInfo';
COMMENT ON COLUMN public.open_finance_investimentos.rentab_mes IS 'investment.lastMonthRate';
COMMENT ON COLUMN public.open_finance_investimentos.rentab_12m IS 'investment.lastTwelveMonthsRate';
COMMENT ON COLUMN public.open_finance_investimentos.rentab_anual IS 'investment.annualRate';
COMMENT ON COLUMN public.open_finance_investimentos.isento_ir IS 'investment.taxExempt';
COMMENT ON COLUMN public.open_finance_investimentos.cupom IS 'investment.couponPayment ({hasCoupon, periodicity, additionalInfo})';
COMMENT ON COLUMN public.open_finance_investimentos.data IS 'investment.date, como data de Sao Paulo';
COMMENT ON COLUMN public.open_finance_investimentos.data_compra IS 'investment.purchaseDate, como data';
COMMENT ON COLUMN public.open_finance_investimentos.data_emissao IS 'investment.issueDate, como data';
COMMENT ON COLUMN public.open_finance_investimentos.vencimento IS 'investment.dueDate, como data';
COMMENT ON COLUMN public.open_finance_investimentos.carencia IS 'investment.gracePeriodDate, como data';
COMMENT ON COLUMN public.open_finance_investimentos.emissor IS
  'investment.issuer, SEM sequencia com forma de CPF: no sandbox o emissor de CRI e pessoa fisica, '
  'com o CPF colado no nome.';
COMMENT ON COLUMN public.open_finance_investimentos.emissor_cnpj IS
  'investment.issuerCNPJ. Descartado quando tem 11 digitos (forma de CPF).';
COMMENT ON COLUMN public.open_finance_investimentos.moeda IS 'investment.currencyCode';
COMMENT ON COLUMN public.open_finance_investimentos.pluggy_atualizado_em IS 'investment.updatedAt. Ver open_finance_nao_regride.';

-- ⚠️ NAO PARCIAL: o Postgres nao infere indice parcial em ON CONFLICT (20260830213000).
CREATE UNIQUE INDEX IF NOT EXISTS open_finance_investimentos_do_dono
  ON public.open_finance_investimentos (user_id, pluggy_investment_id);
CREATE INDEX IF NOT EXISTS open_finance_investimentos_item_idx
  ON public.open_finance_investimentos (user_id, pluggy_item_id);

DROP TRIGGER IF EXISTS open_finance_nao_regride ON public.open_finance_investimentos;
CREATE TRIGGER open_finance_nao_regride
  BEFORE UPDATE ON public.open_finance_investimentos
  FOR EACH ROW EXECUTE FUNCTION public.open_finance_nao_regride();

-- ---------------------------------------------------------------------------------------
-- open_finance_investimento_movimentos: o historico de cada posicao
-- ---------------------------------------------------------------------------------------
--
-- ⚠️ Historico NUNCA e apagado pela sincronizacao, nem quando a posicao some: o resgate total e
-- justamente o movimento que explica por que ela sumiu.
-- ⚠️ Sem FK para open_finance_investimentos, pelo mesmo motivo -- a posicao pode ser apagada e o
-- movimento continua.

CREATE TABLE IF NOT EXISTS public.open_finance_investimento_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id text NOT NULL,
  pluggy_investment_id text NOT NULL,
  pluggy_investment_transaction_id text NOT NULL,
  tipo text,
  movimento text,
  descricao text,
  montante numeric(14,2),
  montante_liquido numeric(14,2),
  valor_cota numeric,
  quantidade numeric,
  data date,
  data_negociacao date,
  percentual_indexador numeric,
  taxa_acordada numeric,
  despesas jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  atualizado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.open_finance_investimento_movimentos IS
  'Movimentacoes de cada investimento (GET /investments/{id}/transactions da Pluggy). Historico: '
  'a sincronizacao acrescenta e atualiza, nunca apaga. Fora de proposito: brokerageNumber.';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.pluggy_investment_id IS 'investment.id do pai (o objeto da Pluggy nao o repete)';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.pluggy_investment_transaction_id IS 'investmentTransaction.id';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.tipo IS 'investmentTransaction.type, cru (BUY, SELL, TAX, INTEREST, AMORTIZATION...)';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.movimento IS 'investmentTransaction.movementType, cru (CREDIT | DEBIT)';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.descricao IS 'investmentTransaction.description, sem sequencia com forma de CPF';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.montante IS 'investmentTransaction.amount';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.montante_liquido IS 'investmentTransaction.netAmount';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.valor_cota IS 'investmentTransaction.value';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.quantidade IS 'investmentTransaction.quantity';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.data IS 'investmentTransaction.date, como data';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.data_negociacao IS 'investmentTransaction.tradeDate, como data';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.percentual_indexador IS 'investmentTransaction.indexerPercentage';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.taxa_acordada IS 'investmentTransaction.agreedRate';
COMMENT ON COLUMN public.open_finance_investimento_movimentos.despesas IS 'investmentTransaction.expenses (corretagem, custodia, IR...)';

CREATE UNIQUE INDEX IF NOT EXISTS open_finance_movimentos_do_dono
  ON public.open_finance_investimento_movimentos
  (user_id, pluggy_investment_id, pluggy_investment_transaction_id);
CREATE INDEX IF NOT EXISTS open_finance_movimentos_item_idx
  ON public.open_finance_investimento_movimentos (user_id, pluggy_item_id);

-- ---------------------------------------------------------------------------------------
-- open_finance_emprestimos
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.open_finance_emprestimos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id text NOT NULL,
  pluggy_loan_id text NOT NULL,
  produto text,
  tipo text,
  modalidade text,
  subtipo_categoria text,
  montante_contratado numeric(14,2),
  saldo_restante numeric(14,2),
  saldo_devedor numeric(14,2),
  saldo_devedor_em timestamptz,
  proxima_parcela numeric(14,2),
  cet numeric,
  amortizacao text,
  periodicidade text,
  tem_seguro boolean,
  data date,
  data_contrato date,
  data_liquidacao date,
  vencimento date,
  primeira_parcela date,
  parcelas_total integer,
  parcelas_total_unidade text,
  parcelas_pagas integer,
  parcelas_a_vencer integer,
  parcelas_vencidas integer,
  parcelas_restantes integer,
  parcelas_restantes_unidade text,
  datas_desembolso jsonb,
  juros jsonb,
  tarifas jsonb,
  encargos jsonb,
  garantias jsonb,
  pagamentos jsonb,
  baloes jsonb,
  moeda text NOT NULL DEFAULT 'BRL',
  pluggy_atualizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  atualizado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.open_finance_emprestimos IS
  'Emprestimos e financiamentos do Open Finance (GET /loans da Pluggy). Colunas explicitas, jsonb so '
  'nas listas aninhadas. Fora de proposito: contractNumber, ipocCode e cnpjConsignee (CNPJ do '
  'empregador no consignado). Contrato que some da listagem COMPLETA de um item UPDATED e apagado.';
COMMENT ON COLUMN public.open_finance_emprestimos.pluggy_loan_id IS 'loan.id';
COMMENT ON COLUMN public.open_finance_emprestimos.produto IS 'loan.productName';
COMMENT ON COLUMN public.open_finance_emprestimos.tipo IS 'loan.type, cru (CREDITO_PESSOAL_SEM_CONSIGNACAO...)';
COMMENT ON COLUMN public.open_finance_emprestimos.modalidade IS 'loan.kind, cru (LOAN, FINANCING, INVOICE_FINANCING...)';
COMMENT ON COLUMN public.open_finance_emprestimos.subtipo_categoria IS 'loan.productSubTypeCategory';
COMMENT ON COLUMN public.open_finance_emprestimos.montante_contratado IS 'loan.contractAmount';
COMMENT ON COLUMN public.open_finance_emprestimos.saldo_restante IS 'loan.totalRemainingAmount';
COMMENT ON COLUMN public.open_finance_emprestimos.saldo_devedor IS 'loan.payments.contractOutstandingBalance';
COMMENT ON COLUMN public.open_finance_emprestimos.saldo_devedor_em IS 'loan.payments.contractOutstandingBalanceUpdatedAt (instante)';
COMMENT ON COLUMN public.open_finance_emprestimos.proxima_parcela IS 'loan.nextInstallmentAmount';
COMMENT ON COLUMN public.open_finance_emprestimos.cet IS 'loan.CET (custo efetivo total)';
COMMENT ON COLUMN public.open_finance_emprestimos.amortizacao IS 'loan.amortizationScheduled, cru (PRICE, SAC...)';
COMMENT ON COLUMN public.open_finance_emprestimos.periodicidade IS 'loan.installmentPeriodicity, cru (MONTHLY, OTHERS...)';
COMMENT ON COLUMN public.open_finance_emprestimos.tem_seguro IS 'loan.hasInsuranceContracted';
COMMENT ON COLUMN public.open_finance_emprestimos.data IS 'loan.date (coleta), como data de Sao Paulo';
COMMENT ON COLUMN public.open_finance_emprestimos.data_contrato IS 'loan.contractDate, como data';
COMMENT ON COLUMN public.open_finance_emprestimos.data_liquidacao IS 'loan.settlementDate, como data';
COMMENT ON COLUMN public.open_finance_emprestimos.vencimento IS 'loan.dueDate, como data';
COMMENT ON COLUMN public.open_finance_emprestimos.primeira_parcela IS 'loan.firstInstallmentDueDate, como data';
COMMENT ON COLUMN public.open_finance_emprestimos.parcelas_total IS 'loan.installments.totalNumberOfInstallments. Unidade em parcelas_total_unidade';
COMMENT ON COLUMN public.open_finance_emprestimos.parcelas_total_unidade IS
  'loan.installments.typeNumberOfInstallments (MONTH, DAY...). Sem ela parcelas_total e ambiguo: no '
  'sandbox 4 de 5 contratos contam em DIAS.';
COMMENT ON COLUMN public.open_finance_emprestimos.parcelas_pagas IS 'loan.installments.paidInstallments';
COMMENT ON COLUMN public.open_finance_emprestimos.parcelas_a_vencer IS 'loan.installments.dueInstallments';
COMMENT ON COLUMN public.open_finance_emprestimos.parcelas_vencidas IS 'loan.installments.pastDueInstallments';
COMMENT ON COLUMN public.open_finance_emprestimos.parcelas_restantes IS 'loan.installments.contractRemainingNumber. Unidade em parcelas_restantes_unidade';
COMMENT ON COLUMN public.open_finance_emprestimos.parcelas_restantes_unidade IS 'loan.installments.typeContractRemaining (MONTH, DAY...)';
COMMENT ON COLUMN public.open_finance_emprestimos.datas_desembolso IS 'loan.disbursementDates (lista de instantes)';
COMMENT ON COLUMN public.open_finance_emprestimos.juros IS 'loan.interestRates';
COMMENT ON COLUMN public.open_finance_emprestimos.tarifas IS 'loan.contractedFees';
COMMENT ON COLUMN public.open_finance_emprestimos.encargos IS 'loan.contractedFinanceCharges';
COMMENT ON COLUMN public.open_finance_emprestimos.garantias IS 'loan.warranties';
COMMENT ON COLUMN public.open_finance_emprestimos.pagamentos IS 'loan.payments.releases';
COMMENT ON COLUMN public.open_finance_emprestimos.baloes IS 'loan.installments.balloonPayments';
COMMENT ON COLUMN public.open_finance_emprestimos.moeda IS 'loan.currencyCode';
COMMENT ON COLUMN public.open_finance_emprestimos.pluggy_atualizado_em IS 'loan.updatedAt. Ver open_finance_nao_regride.';

CREATE UNIQUE INDEX IF NOT EXISTS open_finance_emprestimos_do_dono
  ON public.open_finance_emprestimos (user_id, pluggy_loan_id);
CREATE INDEX IF NOT EXISTS open_finance_emprestimos_item_idx
  ON public.open_finance_emprestimos (user_id, pluggy_item_id);

DROP TRIGGER IF EXISTS open_finance_nao_regride ON public.open_finance_emprestimos;
CREATE TRIGGER open_finance_nao_regride
  BEFORE UPDATE ON public.open_finance_emprestimos
  FOR EACH ROW EXECUTE FUNCTION public.open_finance_nao_regride();

-- ---------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------
--
-- ⛔ Na mesma migration, sempre. Tabela nova nasce com GRANT ALL para `anon`: sem politica, ela
-- esta aberta para a internet no instante em que e criada (L-003).
--
-- ⭐ Investimentos, movimentos e emprestimos seguem o padrao de `open_finance`: o dono LE, e quem
-- escreve e a Edge Function com `service_role`, que passa por cima da RLS. Sem policy de escrita.

ALTER TABLE public.open_finance_investimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários veem os próprios investimentos do Open Finance" ON public.open_finance_investimentos;
CREATE POLICY "Usuários veem os próprios investimentos do Open Finance" ON public.open_finance_investimentos
  FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE public.open_finance_investimento_movimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários veem as próprias movimentações de investimento" ON public.open_finance_investimento_movimentos;
CREATE POLICY "Usuários veem as próprias movimentações de investimento" ON public.open_finance_investimento_movimentos
  FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE public.open_finance_emprestimos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários veem os próprios empréstimos do Open Finance" ON public.open_finance_emprestimos;
CREATE POLICY "Usuários veem os próprios empréstimos do Open Finance" ON public.open_finance_emprestimos
  FOR SELECT USING (auth.uid() = user_id);

-- ⛔⛔ **`open_finance_identidades` e a excecao, e nega TUDO.** RLS ligada SEM policy nenhuma (nem
-- de SELECT) e, alem disso, sem GRANT para `anon` e `authenticated`. Nenhuma tela le o hash, e o
-- dono nao ganha nada vendo o proprio: deixar o SELECT aberto so criaria um caminho a mais ate
-- ele. As duas portas fechadas (L-003): a RLS sozinha ja negaria, o REVOKE e para que um
-- `CREATE POLICY` futuro descuidado nao reabra.
ALTER TABLE public.open_finance_identidades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.open_finance_identidades FROM anon, authenticated;
