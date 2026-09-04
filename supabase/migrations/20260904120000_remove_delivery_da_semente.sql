-- `delivery` sai da lista semente de tipos de compromisso.
--
-- A semente nasceu com 18 tipos; passa a ter 17. A regra que decidia quem entrava está no
-- cabeçalho de 20260830240000_semente_no_cadastro.sql, e `delivery` era justificado assim:
-- "entra e `restaurante` não porque no delivery duas ou três marcas cobrem quase tudo".
-- ⚠️ Essa justificativa deixa de valer -- a decisão de produto é que delivery é gasto disperso,
-- como restaurante, e não compromisso.
--
-- ---------------------------------------------------------------------------------------
-- O que esta migration NÃO faz, e é deliberado
-- ---------------------------------------------------------------------------------------
--
-- ⛔ **Não mexe em `transactions.compromisso`.** Havia 26 linhas rotuladas `delivery` quando isto
-- foi escrito, e elas ficam como estão. `agruparPorCompromisso` (src/lib/compromissos.ts) agrupa
-- pelo slug da transação e só usa a linha de `compromissos` para o título e o `valor_mensal`
-- (`tipo?.titulo ?? slug`) -- então apagar o tipo NÃO tira aquelas transações da camada Previsível,
-- e o comprometido do usuário não muda de valor.
--
-- ⚠️ O efeito visível é cosmético: no /compromissos o card passa a se chamar `delivery`, em
-- minúsculas, porque o título vem do slug quando o tipo não existe mais.
--
-- ⛔ Limpar o rótulo daquelas 26 seria outra coisa, e mudaria o número: sem `compromisso` elas
-- saem do agrupamento, e o total de Previsível CAI. Isso é decisão de produto separada, não
-- consequência de tirar o tipo da semente.

-- ---------------------------------------------------------------------------------------
-- 1. Some da semente, para contas novas
-- ---------------------------------------------------------------------------------------
--
-- ⚠️ O corpo abaixo é `pg_get_functiondef` da função em produção, com UMA linha removida -- a do
-- `delivery`. Foi gerado a partir do que estava vivo, e não redigitado: a função também semeia
-- as 28 categorias, e reescrevê-la à mão arriscaria perder algo no caminho.
--
-- ⚠️ `pg_get_functiondef` NÃO devolve o `;` final. Sem acrescentá-lo, o `DELETE` seguinte vira
-- continuação do mesmo comando e o Postgres reclama de sintaxe "at or near DELETE".

CREATE OR REPLACE FUNCTION public.semear_conta(uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE user_id = uid) THEN
    INSERT INTO public.categories (user_id, nome, cor, e_renda)
    SELECT uid, s.nome, s.cor, s.e_renda
    FROM (VALUES
      ('Aluguel'::text,            '#4B0082'::text, false),
      ('Farmácia',                 '#D9FF00', false),
      ('Educação',                 '#FF007F', false),
      -- ⭐ Renda por definicao. Sem nenhuma marcada, o card Renda e o "o que
      -- sobra" do Dashboard nascem vazios. → D-051
      ('Outras Receitas',          '#00FF00', true),
      ('Comércio',                 '#FF00F4', false),
      ('Lavanderia',               '#A020F0', false),
      ('Supermercado',             '#00FFFF', false),
      ('Bancos',                   '#FF8C00', false),
      ('Viagem',                   '#8F00FF', false),
      ('Uber/99',                  '#FFE900', false),
      ('Carro',                    '#FF00F4', false),
      ('Táxi',                     '#FFE900', false),
      ('Vestuário/Beleza',         '#FF007F', false),
      ('Entreterimento',           '#CF00FF', false),
      ('Academia',                 '#00BFFF', false),
      ('Outros',                   '#FF0000', false),
      ('Ônibus/Metrô',             '#FF8C00', false),
      ('Casa',                     '#00FFF9', false),
      ('Eletrônicos',              '#00BFFF', false),
      ('Lingua estrangeira',       '#ef4444', false),
      ('Assinaturas',              '#D9FF00', false),
      ('Streaming',                '#D9FF00', false),
      ('Governo',                  '#BFFF00', false),
      ('Comida',                   '#001AFF', false),
      ('Salário',                  '#00FF00', true),
      ('Médicos/Saúde',            '#FF00FF', false),
      ('Apostas/Loteria',          '#8F00FF', false),
      -- ⭐⭐ O destino do positivo que NAO e renda. E ela que torna "Outras
      -- Receitas" segura como renda: sem um lugar para devolucao e rateio, o
      -- divisor de "% da renda" infla com dinheiro que so voltou. → D-025, D-051
      ('Reembolsos',               '#22c55e', false)
    ) AS s(nome, cor, e_renda)
    ON CONFLICT (user_id, nome) DO NOTHING;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.compromissos WHERE user_id = uid) THEN
    INSERT INTO public.compromissos (user_id, slug, titulo)
    SELECT uid, s.slug, s.titulo
    FROM (VALUES
      ('aluguel'::text,            'Aluguel'::text),
      ('condominio',               'Condomínio'),
      ('utilidades',               'Água, luz e gás'),
      ('internet_telefone',        'Internet e telefone'),
      ('supermercado',             'Supermercado'),
      ('combustivel',              'Combustível'),
      ('transporte_app',           'Transporte por aplicativo'),
      ('transporte_publico',       'Transporte público'),
      ('estacionamento',           'Estacionamento'),
      ('farmacia',                 'Farmácia'),
      ('saude',                    'Saúde'),
      ('academia',                 'Academia'),
      ('educacao',                 'Educação'),
      ('seguro',                   'Seguro'),
      ('imposto',                  'Imposto'),
      ('investimento',             'Investimento'),
      ('pet',                      'Pet')
    ) AS s(slug, titulo)
    ON CONFLICT (user_id, slug) DO NOTHING;
  END IF;
END;
$function$;


-- ---------------------------------------------------------------------------------------
-- 2. Some das contas que já existem
-- ---------------------------------------------------------------------------------------
--
-- Idempotente por natureza: rodar de novo não encontra nada. Nenhuma das 11 linhas tinha
-- `valor_mensal` ou `periodicidade` configurados, então não se perde configuração de ninguém.
--
-- ⚠️ `compromisso_exemplos` tem `on delete cascade` na TRANSAÇÃO, não no tipo -- exemplos de
-- `delivery` ficariam órfãos. Não havia nenhum quando isto rodou, mas o DELETE explícito abaixo
-- torna a migration correta mesmo se houver.

DELETE FROM public.compromisso_exemplos WHERE slug = 'delivery';
DELETE FROM public.compromissos WHERE slug = 'delivery';
