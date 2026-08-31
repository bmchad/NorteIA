-- ---------------------------------------------------------------------------
-- As categorias e os tipos de compromisso passam a nascer com a conta.
--
-- O sintoma: um usuario novo so tinha tipos de compromisso depois de abrir o
-- /perfil, e so tinha categorias depois de abrir o /novos-registros. ⛔ Mas a
-- entrada do app e `/compromissos` (D-038) -- uma tela que LE `compromissos` e
-- encontrava vazio, sem dar ao usuario motivo nenhum para adivinhar que a cura
-- era passar noutra pagina.
--
-- A causa: nunca houve trigger. Os dois eram seed no cliente, dentro de uma
-- funcao de carga -- `seedDefaultCategories` em Pendentes.tsx e o bloco de
-- semente de `carregarTipos` em Perfil.tsx. ⛔ Isso e a L-008 e a invariante 14:
-- escrita dentro de leitura vira corrida sob StrictMode, que roda o efeito duas
-- vezes. `compromissos` tinha UNIQUE (user_id, slug) e a segunda insercao
-- falhava; `categories` nao tinha nada, e as duas passavam.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Categorias duplicadas: REAPONTAR antes de apagar.
--
-- ⛔⛔ Apagar direto seria perda de dado silenciosa. Tres tabelas apontam para
-- `categories(id)`, e as regras de exclusao delas nao perdoam:
--   transactions.categoria_id  ON DELETE SET NULL  -> a transacao perde a categoria
--   fixos.categoria_id         ON DELETE SET NULL  -> idem para o gasto fixo
--   vocabulario.categoria_id   ON DELETE CASCADE   -> a REGRA some junto
--
-- Fica a copia mais antiga, que e aquela para a qual o historico ja aponta.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE categorias_duplicadas AS
SELECT id AS duplicada, mantem
FROM (
  SELECT id,
         first_value(id) OVER (PARTITION BY user_id, nome ORDER BY created_at, id) AS mantem
  FROM public.categories
) t
WHERE id <> mantem;

UPDATE public.transactions t SET categoria_id = d.mantem
  FROM categorias_duplicadas d WHERE t.categoria_id = d.duplicada;
UPDATE public.fixos f SET categoria_id = d.mantem
  FROM categorias_duplicadas d WHERE f.categoria_id = d.duplicada;
UPDATE public.vocabulario v SET categoria_id = d.mantem
  FROM categorias_duplicadas d WHERE v.categoria_id = d.duplicada;

DELETE FROM public.categories c USING categorias_duplicadas d WHERE c.id = d.duplicada;
DROP TABLE categorias_duplicadas;

-- ⚠️ Indice NAO parcial: e o que `ON CONFLICT (user_id, nome)` precisa inferir.
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_nome_unico
  ON public.categories (user_id, nome);

-- ---------------------------------------------------------------------------
-- 2. A semente, com um dono so.
--
-- ⭐ As duas listas vivem AQUI, e nao mais no TypeScript. Elas so tem sentido no
-- instante em que a conta nasce, e esse instante agora acontece no banco --
-- manter uma copia no front seria um segundo dono do mesmo fato, e um dos dois
-- envelheceria calado.
--
-- ⭐ "Se estiver vazio", e nao `ON CONFLICT` sobre tudo: e a semantica que o seed
-- do cliente tinha, e ela importa. Quem apagou "Apostas/Loteria" de proposito
-- nao pode ve-la voltar so porque esta funcao rodou de novo.
--
-- ⚠️ **E semente, nao fonte da verdade.** Acrescentar um item aqui NAO alcanca
-- quem ja usa o app -- depois do primeiro acesso a lista e do usuario, editavel
-- no /perfil.
--
-- ⭐ O que entra na lista de COMPROMISSOS passa por tres testes, todos
-- estruturais, porque o produto e horizontal e a lista se justifica pelo que vale
-- para pessoas em geral, nunca pelo extrato de alguem:
--   1. E obrigacao ou necessidade recorrente para a maioria?
--   2. O nome do estabelecimento varia enquanto a natureza nao? (Se o nome fosse
--      estavel, a deteccao por nome e valor ja resolveria.)
--   3. Um punhado de marcas domina, ou o nome e reconhecivel? E o teste que
--      decide -- categoria que o modelo nao infere pelo nome e inutil aqui.
-- ⛔ Fora, e o motivo vale a regra: restaurante, entretenimento, viagem,
--    vestuario. Neles o nome varia E a natureza varia junto -- e gasto disperso,
--    nao compromisso. `delivery` entra e `restaurante` nao porque no delivery
--    duas ou tres marcas cobrem quase tudo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.semear_conta(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
      ('delivery',                 'Delivery'),
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
$$;

COMMENT ON FUNCTION public.semear_conta(uuid) IS
  'O que uma conta nova recebe: 28 categorias e 18 tipos de compromisso. Idempotente e '
  'condicionada a lista estar vazia, para nao ressuscitar o que o usuario apagou.';

-- ---------------------------------------------------------------------------
-- 3. Quem ja existe e esta sem.
--
-- ⭐ Seguro de rodar sobre todo mundo: a funcao so semeia lista vazia.
-- ---------------------------------------------------------------------------
SELECT public.semear_conta(id) FROM auth.users;

-- ---------------------------------------------------------------------------
-- 4. A conta nova.
--
-- ⭐ Terceira coisa que entra na `handle_new_user`, e pelo mesmo motivo das duas
-- primeiras: "o que se cria quando uma conta nasce" tem um dono so, e ele nao e
-- uma tela que a pessoa talvez nunca abra.
--
-- ⚠️ `SET search_path = ''` continua, e por isso todo nome e qualificado.
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

    -- Sem `ciclo_dia` na lista: o valor e o DEFAULT da coluna, dono unico do numero.
    INSERT INTO public.memory (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

    PERFORM public.semear_conta(new.id);

    RETURN new;
END;
$$;
