---
status: vigente
atualizado_em: 2026-08-29
---

# As páginas do Balanço Geral

> **O que este arquivo é:** o que cada tela faz, o que ela lê e escreve, e a regra não óbvia de
> cada uma.
> **O que este arquivo NÃO é:** o pipeline de IA em detalhe (é `03-agentes-de-ia.md`) nem a lista
> de defeitos de cada tela (é `20-pendencias-e-dividas.md`).

Rotas e proteção vivem em `src/App.tsx`; o menu lateral, em `src/components/Layout.tsx`.
**Toda rota exceto `/` e `/login` exige sessão** e redireciona para `/login` sem ela.

---

## `/` · Home — landing pública

`src/pages/Home.tsx` · escreve em `leads`

Página institucional aberta ao público: hero, seção "Onde Estamos" com endereço real, FAQ em
acordeão e um formulário de contato (nome, e-mail, telefone) que insere em `leads`. Um webhook do
Supabase dispara a Edge Function `send-email` a cada novo lead.

⭐ É a única tela do sistema que grava sem usuário autenticado.

---

## `/login` · Auth

`src/pages/Auth.tsx` · Supabase Auth com **Google**

⭐ **Não há e-mail e senha.** A tela tem um botão só, `signInWithOAuth` com o provedor Google. Quem
não tem conta Google não entra. → `30-decisoes-e-licoes.md` D-023

Não existe cadastro separado: o primeiro login cria a conta, e o trigger `handle_new_user` insere a
linha em `profiles`, que dispara o e-mail de boas-vindas. Havendo sessão, a tela redireciona para
`/dashboard`; a sessão é observada em `App.tsx` por `onAuthStateChange`.

⚠️ **O `redirectTo` do código não decide sozinho para onde o login volta.** Se a URL não estiver na
lista de permitidos do painel, o Supabase cai silenciosamente no *Site URL*. → `L-002`

---

## `/dashboard` · Dashboard Anual

`src/pages/Dashboard.tsx` · lê `transactions`, lê e escreve `memory`

Quatro blocos:
- **Totais do ano** — entradas, saídas e resultado líquido, com contagem de meses ativos.
- **Proporção Anual** — pizza entradas × saídas.
- **Simulador parcela × investimento** — dado o valor da parcela, os meses restantes, a taxa anual e
  a alíquota de IR, compara pagar à vista contra investir e pagar parcelado.
- **Notas** — um campo de texto livre salvo em `memory.content`, um registro por usuário.
- **Última transação registrada.**
- **Comprometido em parcelas**, ao lado do resultado líquido — o mesmo número de `/parcelas`.

⭐ **O "ano" desta tela é um ano de ciclos, não de calendário** — com ciclo 5, vai de 06/01 a 05/01
do ano seguinte. O total tem de bater exatamente com a soma dos 12 ciclos do `/meses`, porque as
duas telas usam a mesma função (`src/lib/ciclo.ts`). Até 2026-08-27 não batia: ver
`30-decisoes-e-licoes.md` D-007. 

---

## `/meses` · Balanços Mensais

`src/pages/Meses.tsx` · lê e escreve `transactions`, lê `categories` e `memory.ciclo_dia`

O coração do produto. Agrupa as transações por **ciclo de fatura** e, para cada ciclo, mostra
entradas, saídas, resultado, a lista editável de transações e **duas pizzas por categoria** (uma de
despesas, uma de receitas), coloridas pela cor da categoria.

⭐ **A regra de agrupamento tem duas camadas:** se a transação tem `mes_fatura` preenchido (o mês
que a IA deduziu), ele manda; senão, cai no fallback por `ciclo_dia` — dia ≤ `ciclo_dia` pertence
ao mês anterior. A regra não mora nesta tela: ela vive em **`src/lib/ciclo.ts`**, compartilhada com
o Dashboard. Edição inline permite corrigir data, apelido, categoria, `mes_fatura`, valor e
parcelas.

---

## `/novos-registros` · Pendentes

`src/pages/Pendentes.tsx` · escreve `transactions`, lê e semeia `categories`

Upload (imagem, planilha ou PDF) → extração por IA → revisão dos rascunhos. É também onde as **27
categorias padrão são semeadas** no primeiro acesso do usuário.

⭐ **Esta tela não fala com o Gemini.** Ela lê o arquivo, chama a Edge Function `ai-agents` e recebe
as transações prontas; só o insert é dela. O detalhe está em `03-agentes-de-ia.md`.

⚠️ Ainda é o maior arquivo do projeto (~1.000 linhas), agora concentrado em upload e revisão.

---

## ⭐ `/compromissos` · Compromissos

`src/pages/Compromissos.tsx` · lê `transactions`, `fixos` e `compromissos`

⭐⭐ **A tela central do produto.** Reúne tudo que já tem dono antes de você decidir qualquer coisa.
Substitui `/fixos` e `/parcelas`, que agora redirecionam para cá.

**O painel nunca mostra um total único** — três camadas de certeza, porque somá-las esconderia o que
dá para cancelar:

| Camada | De onde vem | Cancelável |
|---|---|---|
| **Contratado** | parcelas em andamento (`src/lib/parcelas.ts`) | não, tem data de fim |
| **Recorrente** | cascata 1.b/1.a (`src/lib/fixos-propostos.ts`) | sim |
| **Previsível** | rótulo de compromisso (`src/lib/compromissos.ts`) | sim, na teoria |

⛔ **As três somam conjuntos disjuntos**, e é a cascata que garante isso: uma transação reivindicada
por uma regra não fica disponível para a seguinte. Se houver dupla contagem, o número do painel é
errado — e o painel é a tese.

**Duas sub-abas:** *Gastos fixos* (propostas com evidência, ativos, e cadastro manual) e *Parcelas*.

**Propostas** têm três naturezas: *criar*, *corrigir* (casa com um fixo mas o valor ou o dia
divergem) e *encerrar* (sem lançamento há dois ciclos além da periodicidade). Cada uma mostra os
lançamentos que a geraram — proposta que não se explica não é aceita nem revista.

⚠️ **`fixos` é consultativa.** Aceitar não lança transação: um fixo que se auto-lança duplica em
silêncio quando o lançamento real chega pelo extrato.

## `/historico` · Histórico

`src/pages/Historico.tsx` · lê, edita e apaga `transactions`

Tabela crua de todos os registros, ordenada por data de criação. Filtro por apelido e por
categoria, ordenação por data/criação/valor, edição inline e exclusão. É a tela de conserto quando
algo entrou errado.

**Comentário livre** por transação, editável inline e mostrado como ícone discreto quando preenchido
— é onde mora "isso foi presente da minha mãe", que nenhuma categoria captura. O mesmo campo aparece
em `/meses`.

⭐ **Corrigir a categoria aqui alimenta a memória do agente.** A contagem que decide a categoria
automática lê o histórico confirmado, então cada correção entra no placar na hora. →
`03-agentes-de-ia.md`

---

## `/perfil` · Perfil

`src/pages/Perfil.tsx` · lê e escreve `categories`, `vocabulario`, `compromissos` e `memory`

⭐ **É o dono da configuração** (D-029): aqui se define **o que existe**; a tela de operação trabalha
com **o que foi encontrado**. Quatro seções:

**Categorias** · duas listas lado a lado, **Renda** e **Gasto**, e mover entre elas é arrastar (com
uma seta discreta como alternativa, porque arrastar não existe em tela de toque). O lado se escolhe
na criação. ⚠️ Só as de renda entram no divisor de "% da renda" do Dashboard → D-025

**Vocabulário** · o que só o usuário sabe. **Regras** (`nome contém X` → categoria) rodam no código,
sem token; **notas** vão ao prompt. → D-030

**Compromissos** · os tipos que a IA reconhece, semeados no primeiro acesso e editáveis. Cada um tem
uma periodicidade em **texto livre** — pista para a IA, nenhum código a interpreta — e um valor, que
⚠️ **entra na camada Previsível do painel**. Teto de 25.

**Ciclos** · o `ciclo_dia`, o campo de maior alcance do sistema.
