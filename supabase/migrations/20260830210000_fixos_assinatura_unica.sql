-- Uma assinatura tem um destino: ou ativa, ou recusada, ou encerrada. Nunca duas linhas.
--
-- ⛔ `fixos` nao tinha nenhuma restricao de unicidade alem da chave primaria, e foi por essa
-- porta que entraram gastos fixos duplicados: o aceite automatico gravava dentro do
-- `carregar()`, o `useEffect` de montagem roda DUAS vezes sob StrictMode, as duas chamadas
-- leram o mesmo estado e as duas inseriram.
--
-- ⭐ A gravidade nao e visual: duas linhas ativas com a mesma assinatura entram as duas em
-- `comprometidoRecorrente` e no "deixe reservado". O total infla, e o total e a tese.
--
-- ⭐⭐ O conserto no front (uma guarda de montagem) impede a proxima corrida; este indice
-- impede QUALQUER corrida futura, venha de onde vier. E por isso que ele existe aqui e nao
-- so la.

-- ---------------------------------------------------------------------------------------
-- 1. Deduplicar o que ja esta gravado
-- ---------------------------------------------------------------------------------------
--
-- ⭐ A regra de desempate quando os `status` divergem e `recusado > encerrado > ativo`: a
-- decisao negativa vence porque e a unica que NAO da para reconstruir. Re-propor um gasto
-- fixo e barato -- a deteccao faz sozinha na proxima carga. Apagar uma recusa por engano faz
-- voltar algo que o usuario mandou embora, e ele nao tem como saber que sumiu.
--
-- ⚠️ Entre linhas de mesmo status (o caso do StrictMode, em que sao identicas) fica a mais
-- antiga: a evidencia e a mesma, e `created_at` menor e o registro original.

WITH ordenadas AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, assinatura
      ORDER BY
        CASE status
          WHEN 'recusado'  THEN 0
          WHEN 'encerrado' THEN 1
          ELSE 2
        END,
        created_at
    ) AS posicao
  FROM public.fixos
  WHERE assinatura IS NOT NULL
)
DELETE FROM public.fixos f
USING ordenadas o
WHERE f.id = o.id
  AND o.posicao > 1;

-- ---------------------------------------------------------------------------------------
-- 2. Impedir que aconteca de novo
-- ---------------------------------------------------------------------------------------
--
-- ⚠️ O `WHERE` nao e detalhe: fixo criado a mao nao tem assinatura, e sem o filtro parcial
-- dois fixos manuais quaisquer colidiriam no `NULL`.

CREATE UNIQUE INDEX IF NOT EXISTS fixos_assinatura_unica
  ON public.fixos (user_id, assinatura)
  WHERE assinatura IS NOT NULL;

COMMENT ON COLUMN public.fixos.assinatura IS
  'Identifica a proposta para nao repropor o que foi recusado. NAO inclui valor: valor muda '
  'e a recusa deixaria de casar. ⭐ UNICA por usuario (indice fixos_assinatura_unica): uma '
  'assinatura tem um destino so -- ativa, recusada ou encerrada.';
