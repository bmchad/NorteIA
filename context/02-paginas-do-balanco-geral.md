---
status: vigente
atualizado_em: 2026-08-27
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

`src/pages/Auth.tsx` · Supabase Auth (e-mail + senha)

Login e cadastro na mesma tela. Se já há sessão, redireciona para `/dashboard`. A sessão é
observada em `App.tsx` por `onAuthStateChange`.

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

`src/pages/Pendentes.tsx` · escreve `transactions`, lê e semeia `categories`, lê `memory.ciclo_dia`

Upload (imagem, planilha ou PDF) → extração por IA → revisão dos rascunhos. É também onde as **27
categorias padrão são semeadas** no primeiro acesso do usuário. O detalhe do pipeline está em
`03-agentes-de-ia.md`.

⚠️ Maior arquivo do projeto (1.200+ linhas) e o que concentra mais responsabilidades.

---

## `/fixos` · Gastos Fixos

`src/pages/Fixos.tsx` · lê e escreve `fixos`

Cadastro manual de despesas recorrentes: nome, valor e (opcional) dia do mês. Filtra entre "com
dia" e "sem dia", ordena e soma o total mensal comprometido.

⭐ **Hoje é só um registro paralelo:** um gasto fixo **não** gera transação automaticamente nem
aparece nos balanços. Automatizar isso está em `10-proximos-passos.md`.

---

## `/parcelas` · Parcelas

`src/pages/Parcelas.tsx` · lê e apaga `transactions`

Lista só as transações com `parcela_total` preenchido e as **agrupa por compra**, usando uma
heurística: mesmo valor absoluto, mesmo `parcela_total` e data de cobrança próxima (tolerância de
±2 dias, com tratamento para virada de mês). Cada grupo é classificado em **Em andamento**
(parcelas registradas < total) ou **Concluídas**.

⭐ O agrupamento **ignora o nome do estabelecimento de propósito**. O nome vem sujo do extrato e
muda entre faturas da mesma compra; valor, total de parcelas e dia de cobrança não mudam. Ver
`30-decisoes-e-licoes.md` D-008.

---

## `/historico` · Histórico

`src/pages/Historico.tsx` · lê, edita e apaga `transactions`

Tabela crua de todos os registros, ordenada por data de criação. Filtro por apelido e por
categoria, ordenação por data/criação/valor, edição inline e exclusão. É a tela de conserto quando
algo entrou errado.

---

## `/perfil` · Perfil

`src/pages/Perfil.tsx` · lê e escreve `categories` e `memory.ciclo_dia`, lê `cores`

Duas coisas: gestão de **categorias** (criar, renomear, recolorir a partir da paleta global da
tabela `cores`, excluir, buscar) e o **dia do ciclo** — o número que define onde cada fatura começa
e termina em todo o resto do sistema.

⭐ Mudar `ciclo_dia` reagrupa retroativamente todo o `/meses`. É o campo de maior alcance do
sistema.
