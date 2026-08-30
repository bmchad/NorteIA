-- Apontar uma transacao como exemplo passa a rotula-la.
--
-- ⭐⭐ "Ser exemplo" e "ter o rotulo" eram duas coisas independentes: `compromisso_exemplos`
-- ensinava o agente, e `transactions.compromisso` era o que punha a transacao na camada
-- Previsivel. Dava para apontar uma transacao como exemplo de `supermercado` sem que ela
-- CONTASSE como supermercado -- o usuario declarava e o numero fingia nao saber.
--
-- A regra que isto cria: **exemplo implica rotulo.** O contrario nao vale -- a maior parte das
-- transacoes rotuladas nunca vira exemplo.
--
-- ⭐ Mora no banco, e nao no front, porque hoje ha TRES lugares que inserem exemplo (em
-- /perfil, ao acrescentar e ao criar um tipo; em /compromissos, ao aceitar um previsivel) e um
-- quarto no futuro esqueceria a regra. Invariante nao se repete em tres arquivos.
--
-- Ver zz_implementation e context/30-decisoes-e-licoes.md.

-- ---------------------------------------------------------------------------------------
-- Ao virar exemplo: rotula
-- ---------------------------------------------------------------------------------------
--
-- ⚠️ `compromisso_manual = true` e essencial, nao decorativo: e o passo 0 da cascata, que
-- impede a declaracao do usuario de ser sobrescrita por um gasto fixo ou pela IA na proxima
-- importacao.

CREATE OR REPLACE FUNCTION public.rotular_ao_virar_exemplo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ⛔ O filtro por `user_id` e o que torna SECURITY DEFINER seguro aqui: sem ele, esta
  -- funcao escreveria em transacao de qualquer usuario. `NEW.user_id` ja e limitado pela
  -- policy de INSERT de `compromisso_exemplos`, que exige `auth.uid() = user_id`.
  UPDATE public.transactions
     SET compromisso = NEW.slug,
         compromisso_manual = true
   WHERE id = NEW.transaction_id
     AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exemplo_rotula ON public.compromisso_exemplos;
CREATE TRIGGER exemplo_rotula
  AFTER INSERT ON public.compromisso_exemplos
  FOR EACH ROW EXECUTE FUNCTION public.rotular_ao_virar_exemplo();

-- ---------------------------------------------------------------------------------------
-- Ao sair dos exemplos: desrotula
-- ---------------------------------------------------------------------------------------
--
-- ⭐ Sai junto porque a razao mais comum de tirar um exemplo e ter clicado errado, e um
-- desfazer que deixa metade do efeito no lugar nao e desfazer.
--
-- ⚠️ Mas SO se o rotulo ainda for aquele slug. Se a transacao foi reclassificada depois para
-- outro compromisso, tirar este exemplo nao pode apagar a classificacao nova.
--
-- ⚠️ `compromisso_manual` volta a false: a declaracao foi retirada, entao a IA pode voltar a
-- opinar sobre essa transacao na proxima importacao.

CREATE OR REPLACE FUNCTION public.desrotular_ao_sair_dos_exemplos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.transactions
     SET compromisso = NULL,
         compromisso_manual = false
   WHERE id = OLD.transaction_id
     AND user_id = OLD.user_id
     AND compromisso = OLD.slug;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS exemplo_desrotula ON public.compromisso_exemplos;
CREATE TRIGGER exemplo_desrotula
  AFTER DELETE ON public.compromisso_exemplos
  FOR EACH ROW EXECUTE FUNCTION public.desrotular_ao_sair_dos_exemplos();

-- ---------------------------------------------------------------------------------------
-- Alinhar o que ja existe
-- ---------------------------------------------------------------------------------------
--
-- ⚠️ Exemplos criados antes desta migration podem estar sem rotulo. Sem este passo, a regra
-- valeria so para o que vier depois, e o total continuaria errado para quem ja configurou.

UPDATE public.transactions t
   SET compromisso = e.slug,
       compromisso_manual = true
  FROM public.compromisso_exemplos e
 WHERE t.id = e.transaction_id
   AND t.user_id = e.user_id
   AND t.compromisso IS DISTINCT FROM e.slug;

COMMENT ON TABLE public.compromisso_exemplos IS
  'Ate 10 transacoes por tipo, apontadas pelo usuario ou herdadas de uma proposta aceita. '
  'Entram no prompt do agente que classifica compromisso. ⭐ Virar exemplo TAMBEM rotula a '
  'transacao (trigger exemplo_rotula): declarar que ela e daquele tipo e faze-la contar sao a '
  'mesma coisa.';
