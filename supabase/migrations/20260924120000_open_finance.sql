-- O espelho do Open Finance (Pluggy): o que a API devolveu, antes de qualquer traducao.
--
-- ⭐⭐ **Espelho, nao destino.** Nada aqui entra em `transactions` automaticamente. A separacao
-- existe por um motivo concreto: `transactions` **nao tem chave de deduplicacao nenhuma** hoje --
-- nem indice unico -- e o unico freio contra lancamento duplicado e humano (tudo nasce
-- `pendente = true` e passa por revisao). Um webhook escrevendo la direto nao teria esse freio.
--
-- ⭐ **As colunas em comum usam os MESMOS nomes de `public.transactions`** -- `data`, `hora`,
-- `nome`, `apelido`, `valor`, `banco`, `parcela_atual`, `parcela_total`, `mes_fatura`,
-- `created_at`. Estar em tabelas diferentes ja as distingue, e isso faz a travessia futura ser
-- quase um `INSERT ... SELECT`.
--
-- ⛔ **Os VALORES nao sao padronizados, so os nomes.** Categoria, banco e tipo entram como a
-- Pluggy escreveu. Casar categoria com `public.categories`, normalizar banco e traduzir tipo sao
-- decisoes de produto que ainda nao foram tomadas -- e tomadas aqui ficariam escondidas dentro de
-- uma migration.
--
-- ⛔⛔ **CORRECAO de 2026-09-28: estas linhas diziam que `amount` e SEMPRE POSITIVO e que a direcao
-- vive em `type`. As duas afirmacoes sao FALSAS**, e a segunda estava implementada como uma
-- conversao que invertia o sinal de toda linha de cartao de credito. Medido no sandbox:
--
--   cartao de credito   `type=CREDIT`   amount NEGATIVO   12/12 (compras)
--   conta corrente      `type=CREDIT`   amount POSITIVO    4/21 (salario)
--   conta corrente      `type=DEBIT`    amount negativo   17/21
--
-- ⭐ `amount` **ja vem assinado**, na mesma convencao de `transactions` (negativo = saida), e
-- `type` significa coisas opostas em conta corrente e em cartao. Entao `valor` e copia direta, e
-- **nao ha excecao de valor nenhuma** nesta tabela. Ver o comentario de `valor` em
-- `supabase/functions/pluggy-webhook/gravar.ts`.
--
-- ⚠️ Esta migration ja estava aplicada quando a correcao foi feita; so o texto mudou, nunca o
-- schema. **O `COMMENT ON TABLE` abaixo ja esta no banco com a frase antiga** -- corrigi-lo exige
-- rodar o `COMMENT ON` de novo no SQL Editor.

-- ---------------------------------------------------------------------------------------
-- Os itens (conexoes com instituicoes), e por que eles vem primeiro
-- ---------------------------------------------------------------------------------------
--
-- ⭐⭐ **Esta tabela existe porque os eventos `transactions/*` da Pluggy NAO dizem de quem sao.**
-- So os eventos `item/*` carregam `clientUserId`; os de transacao trazem apenas `itemId`,
-- `accountId` e `transactionIds`. Sem o mapa `pluggy_item_id -> user_id` construido no
-- `item/created`, nao ha como preencher `open_finance.user_id`, e a linha e inutil.
--
-- ⛔ **Consequencia operacional, e ela e irreversivel:** o `clientUserId` precisa ser preenchido
-- no Connect Token, na hora de conectar. Item conectado sem ele fica orfao PARA SEMPRE -- nao ha
-- de onde descobrir depois a quem pertencia.
--
-- ⚠️ Tabela separada de `open_finance`, e nao a primeira linha dela, porque item e transacao tem
-- ciclos de vida diferentes: o item existe antes da primeira transacao e sobrevive a todas elas.

CREATE TABLE IF NOT EXISTS public.open_finance_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ⚠️ ON DELETE CASCADE desde o nascimento, pelo motivo da migration 20260828100000: a FK de
  -- `memory` nasceu sem ele e virou divida.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- O `itemId` da Pluggy. E a chave pela qual todo evento de transacao encontra o dono.
  pluggy_item_id text NOT NULL,
  -- `connector.name`, CRU. Mesmo nome de `transactions.banco`, mesmo valor sem traducao.
  banco text,
  -- Ultimo status conhecido do item (UPDATED, LOGIN_ERROR, OUTDATED...). Texto livre de
  -- proposito: a Pluggy acrescenta estado sem avisar, e um CHECK aqui viraria erro de escrita
  -- num webhook que nao pode falhar.
  status text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  atualizado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.open_finance_itens IS
  'Mapa pluggy_item_id -> user_id. Existe porque os eventos transactions/* da Pluggy nao carregam '
  'clientUserId -- so os eventos item/* carregam. Sem este mapa a transacao nao tem dono.';

-- Um item da Pluggy e um item aqui. E tambem o que torna o `item/created` idempotente: a Pluggy
-- repete o mesmo evento nos retries.
CREATE UNIQUE INDEX IF NOT EXISTS open_finance_itens_pluggy_id
  ON public.open_finance_itens (pluggy_item_id);

-- ---------------------------------------------------------------------------------------
-- As transacoes espelhadas
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.open_finance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ─── mesmos nomes e mesmos tipos de public.transactions ──────────────────────────────
  -- ⚠️ O `date` da Pluggy e date-time. Ele e partido em dois para casar com `transactions`,
  -- que tem `data date` e `hora time` separados. O instante original fica no `payload`.
  data date NOT NULL,
  hora time without time zone,
  -- ⭐ A Pluggy tem o MESMO par de dois niveis que o NorteIA, e o encaixe nao e coincidencia:
  -- `descriptionRaw` e o texto cru do banco (= `nome`) e `description` e a versao limpa
  -- (= `apelido`). E como `Historico.tsx` ja os trata: mostra o apelido, guarda o original.
  nome text NOT NULL,
  apelido text,
  -- ⛔ ASSINADO PELA PLUGGY -- negativo e saida, igual a `transactions`. Copia direta, sem
  -- conversao. Ver a correcao no cabecalho: derivar este sinal de `type` era um bug.
  valor numeric(10,2) NOT NULL,
  banco text,
  parcela_atual integer,
  parcela_total integer,
  -- `creditCardMetadata.billForecastDate`, no formato YYYY-MM. Mesmo formato de texto que
  -- `transactions.mes_fatura`.
  mes_fatura text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),

  -- ─── so existem do lado da Pluggy, e entram CRUS ─────────────────────────────────────
  -- A identidade da transacao na Pluggy, e a chave de deduplicacao desta tabela.
  pluggy_transaction_id text NOT NULL,
  pluggy_account_id text NOT NULL,
  pluggy_item_id text NOT NULL,
  -- A taxonomia da PLUGGY, nao a do usuario. ⚠️ Nao confundir com `transactions.categoria_id`,
  -- que e FK para `public.categories` -- casar as duas e trabalho da travessia.
  categoria text,
  -- ⚠️⚠️ MESMO NOME de `transactions.tipo`, DOMINIO DE VALORES DIFERENTE.
  --   aqui: 'BANK' | 'CREDIT'        (o `account.type` da Pluggy, cru)
  --   la:   'credito' | 'debito'     (declaracao do usuario sobre o lote importado)
  -- E decisao consciente: nome padronizado, valor cru. Um `INSERT ... SELECT tipo` sem traducao
  -- e recusado por `transactions_tipo_check` -- falha alta, nao corrupcao silenciosa. Mas contar
  -- com o CHECK e contar com um erro em producao.
  -- ⛔ Sem CHECK aqui, de proposito: e espelho, e a Pluggy pode acrescentar tipo de conta sem
  -- avisar. Um CHECK transformaria isso em falha de escrita num webhook que nao pode falhar.
  tipo text,
  conta_nome text,
  -- POSTED | PENDING. ⚠️ Nao e `transactions.pendente`: la significa "falta revisao humana",
  -- aqui significa "ainda nao liquidou". Sao conceitos diferentes com nomes parecidos.
  status text,
  saldo_apos numeric(14,2),
  moeda text NOT NULL DEFAULT 'BRL',
  -- `providerCode`: NSU, numero do extrato -- o identificador que o proprio banco deu.
  codigo_provedor text,
  parcela_valor_total numeric(10,2),
  cartao_numero text,
  fatura_id text,
  -- ⭐⭐ O objeto cru, inteiro. E o que garante que NADA se perde -- inclusive campo que a Pluggy
  -- acrescentar depois, sem migration. E a rede que sustenta a decisao de nao padronizar agora:
  -- se a traducao futura precisar de algo que nao virou coluna, esta aqui.
  payload jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.open_finance IS
  'Espelho das transacoes do Open Finance (Pluggy), antes de qualquer traducao. Nomes de coluna '
  'alinhados a public.transactions; valores CRUS, inclusive o sinal de valor, que a Pluggy ja '
  'manda assinado. Nada entra em transactions automaticamente.';

-- ⚠️ NAO PARCIAL, de proposito. A migration 20260830213000 registra a licao: o Postgres **nao
-- infere indice parcial em `ON CONFLICT`**, e o upsert falha com "no unique or exclusion
-- constraint matching the ON CONFLICT specification". A gravacao usa
-- `ON CONFLICT (pluggy_transaction_id) DO UPDATE`, que e o que atende `transactions/updated`.
CREATE UNIQUE INDEX IF NOT EXISTS open_finance_transacao_unica
  ON public.open_finance (pluggy_transaction_id);

-- Para achar as transacoes de um item quando ele for removido ou reconciliado.
CREATE INDEX IF NOT EXISTS open_finance_item_idx
  ON public.open_finance (user_id, pluggy_item_id);

-- ---------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------
--
-- ⛔ Na mesma migration, sempre. Tabela nova nasce com GRANT ALL para `anon`: sem politica, ela
-- esta aberta para a internet no instante em que e criada. E a licao da Etapa 0 (L-003), e foi
-- assim que `cores` ficou gravavel por qualquer anonimo por meses.
--
-- ⭐⭐ **So SELECT, e isso e diferente de todas as outras tabelas do projeto.** Quem escreve aqui
-- e a Edge Function `pluggy-webhook`, com `service_role` -- que passa por cima da RLS. O usuario
-- le o proprio espelho e **nao pode alterar nada**: editar a mao uma linha que representa o que o
-- banco informou destruiria a unica coisa que esta tabela serve para ser, que e o registro fiel
-- da origem. Correcao acontece em `transactions`, depois da travessia.

ALTER TABLE public.open_finance_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem os próprios itens do Open Finance" ON public.open_finance_itens;
CREATE POLICY "Usuários veem os próprios itens do Open Finance" ON public.open_finance_itens
  FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE public.open_finance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem o próprio espelho do Open Finance" ON public.open_finance;
CREATE POLICY "Usuários veem o próprio espelho do Open Finance" ON public.open_finance
  FOR SELECT USING (auth.uid() = user_id);
