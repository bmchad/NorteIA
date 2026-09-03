-- O instrumento de pagamento da transacao: cartao de credito ou debito em conta.
--
-- ⚠️⚠️ NAO e a direcao do dinheiro. Essa continua sendo o sinal de `valor` (invariante 4),
-- e "renda" continua sendo `categories.e_renda` (D-025). Nesta coluna "credito" quer dizer
-- CARTAO DE CREDITO, e nada mais.
--
-- O que ela carrega, e que nenhuma outra coluna carrega: QUANDO o dinheiro sai da conta.
--
--   debito automatico de R$ 300 no dia 20  -> sai da conta no dia 20, e dia 21 e multa
--   assinatura de R$ 300 no cartao, dia 20 -> so sai quando a fatura daquele banco vence
--
-- Ate hoje o sistema trata as duas como iguais: `elegivel` (src/lib/fixos-propostos.ts)
-- so olha `valor < 0`, entao as duas viram "recorrente" do mesmo jeito. Para o Mercado de
-- Datas isso e fatal -- a cobranca de cartao derrubaria o saldo num dia em que ela nao
-- derruba nada, e a tela alertaria sobre um buraco que nao existe.
--
-- Por que coluna e nao deducao -- os quatro candidatos, todos descartados:
--
--   `banco`       texto livre, `null` em toda planilha (regra 5 do prompt de extracao),
--                 e o mesmo banco tem conta E cartao
--   `origem`      'extrato' | 'planilha' | 'manual' -- o CANAL por onde o dado entrou,
--                 nao o instrumento
--   `mes_fatura`  pedido em todos os modos, com a mesma `regraDoCiclo`. E a chave de
--                 ciclo, nao uma marca de cartao
--   a propria IA  o prompt admite que nao sabe: ORIGEM diz "print de extrato bancario OU
--                 fatura de cartao"
--
-- ⭐ Quem escreve e o toggle do envio em /novos-registros, NUNCA o agente 1. Campo com dois
-- escritores e o defeito que a D-034 registra sobre `compromisso`: os dois respondem, o
-- ultimo a escrever vence, e a classificacao passa a mudar sozinha entre importacoes. Um
-- documento tem um instrumento so -- extrato E a conta, fatura E o cartao --, entao quem
-- enviou o arquivo sabe, e o modelo estaria adivinhando.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'debito';

-- ⭐ O DEFAULT nao e so conveniencia: ele ja deixa o historico inteiro correto. Praticamente
-- tudo que existe hoje veio de extrato ou de planilha de conta, e "registros manuais serao
-- default debito" sai de graca -- `criarManual` nem precisa citar o campo.

-- O CHECK aqui e seguro, ao contrario do `chk_banco` derrubado em 27/08 (D-011): aquele
-- restringia texto vindo de extracao por IA, que inventa valores novos. Este e um enum
-- fechado, escrito so pelo nosso proprio codigo, e o DEFAULT ja e um dos validos.
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_tipo_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_tipo_check
  CHECK (tipo IN ('credito', 'debito'));

COMMENT ON COLUMN public.transactions.tipo IS
  'Instrumento de pagamento, NAO a direcao do dinheiro (essa e o sinal de valor). '
  '"credito" = cartao de credito: a saida da conta acontece no vencimento da fatura, '
  'e o dia do vencimento por banco vive em public.vencimentos. '
  '"debito" = debito em conta: a saida acontece na propria data da transacao. '
  'Escrito pelo toggle do envio em /novos-registros; o agente de extracao nao o preenche.';
