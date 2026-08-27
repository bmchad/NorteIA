# Balanço Geral — manual de operação

> **Este arquivo é o dono do PRESENTE:** o que está no ar, como rodar, o schema, as armadilhas.
> **`context/` é o dono do FUTURO e do PORQUÊ.** Se os dois discordarem sobre como o sistema
> funciona hoje, **este arquivo está certo**.
>
> Antes de mexer em qualquer coisa, leia `context/05-erros-comuns.md` — são 40 linhas e evitam os
> erros caros. O roteador da pasta é `context/00-LEIA-PRIMEIRO.md`.
>
> 🔶 marca o que foi deduzido do código e ainda não confirmado pelo Bernardo.

---

## O que é

Controle financeiro pessoal em que a IA lê a fatura: print, planilha ou PDF entram, transações
estruturadas saem — sempre como **rascunho**, nunca como registro final.
→ `context/01-o-que-e-o-balanco-geral.md`

---

## Comandos

```bash
npm run dev       # Vite, desenvolvimento
npm run build     # tsc -b && vite build  ← é ISTO que a Vercel roda
npm run lint      # eslint
npm run preview   # serve o dist/
```

⚠️ **`npm run build` antes de todo push.** O `dev` transpila sem checar tipos; o `build` roda
`tsc -b` em `strict` com `noUnusedLocals`. Um ícone importado e não usado passa no `dev` e **quebra
o deploy**. → `context/30-decisoes-e-licoes.md` L-001

---

## Stack

| Camada | O quê |
|---|---|
| Front | React 19 · TypeScript 6 · Vite 8 · Tailwind 3 (fonte Outfit) |
| Rotas | `react-router-dom` 7, tudo em `src/App.tsx` |
| Dados | Supabase (Auth + Postgres), cliente único em `src/lib/supabase.ts` |
| IA | ⭐ Edge Function `ai-agents` (Deno), que chama `MODELO.RAPIDO` (`gemini-3.5-flash`). **O front não fala com o Gemini** |
| Gráficos | `recharts` 3 |
| Planilhas | `xlsx` (SheetJS), lê `.xlsx` e converte para CSV |
| Deploy | Vercel — `balanco-geral-beta.vercel.app` |

---

## Variáveis de ambiente

Ficam no `.env` (gitignorado) e **também precisam estar configuradas na Vercel**.

| Variável | Observação |
|---|---|
| `VITE_SUPABASE_URL` | pública |
| `VITE_SUPABASE_ANON_KEY` | pública **por design** — quem protege os dados é RLS |

`src/lib/supabase.ts` lança erro na inicialização se ambas faltarem.

⚠️ **`VITE_GEMINI_API_KEY` não é mais lida pelo código.** A chave vive como secret
`GEMINI_API_KEY` da Edge Function `ai-agents`. Se ainda estiver no `.env` ou na Vercel, pode sair.

**Secrets do servidor** (painel do Supabase, nunca no repositório): `GEMINI_API_KEY` em `ai-agents`;
`RESEND_API_KEY` e `SELLER_EMAIL` em `send-email`.

---

## Estrutura

```
vercel.json            ⭐ reescrita de SPA — sem ela, toda rota dá 404 em acesso direto
src/
  App.tsx              rotas + guarda de sessão
  lib/supabase.ts      cliente único
  lib/ciclo.ts         ⭐ a regra de ciclo de fatura — dono único, usada por /meses e /dashboard
  components/
    Layout.tsx         sidebar + navegação das telas autenticadas
    ConfirmModal.tsx   confirmação de ações destrutivas
  pages/               uma por rota — ver context/02-paginas-do-balanco-geral.md
supabase/              versionado
  config.toml          verify_jwt por função
  migrations/          ⭐ toda mudança de schema passa por aqui
  functions/
    _shared/           cors, respostas com código de erro, cliente com a RLS do chamador
    ai-agents/         ⭐ porta única dos agentes de IA — index, agentes/, lib/, prompts/
    send-email/        webhook de INSERT em `leads` e `profiles`
supabase-backup/       ⚠️ gitignorado. Dump de schema, roles e dados reais
context/               ⚠️ 00–05 versionados; 10, 11, 20 e 30 ficam fora
```

**Comandos do Supabase** (o CLI está em `devDependencies`):

```bash
npx supabase functions deploy ai-agents --project-ref vkrreygxqlfhtodrogyq
npx supabase db push --linked          # aplica migrations pendentes
npx supabase db dump --linked -f supabase-backup/supabase/schema.sql
```

**Rotas:** `/` (landing pública) · `/login` · `/dashboard` · `/meses` · `/novos-registros` ·
`/fixos` · `/parcelas` · `/historico` · `/perfil`. Tudo exceto `/` e `/login` exige sessão e
redireciona sem ela.

---

## Banco de dados

O dump completo está em `supabase-backup/supabase/schema.sql` (fora do git). ⭐ **Mudança nova de
schema entra como migration** em `supabase/migrations/`, aplicada por `npx supabase db push`. RLS
está ligada em todas as tabelas de usuário; `cores` é a exceção deliberada. → D-009, D-011, P20

| Tabela | Papel | Chave |
|---|---|---|
| `transactions` | a tabela central, uma linha por lançamento | `user_id` |
| `profiles` | ⭐ `id` + `email`, criada pelo trigger `handle_new_user` a cada cadastro. Dispara o e-mail de boas-vindas; nenhuma tela lê | `id` |
| `categories` | categorias do usuário (nome + cor); 27 semeadas no 1º acesso | `user_id` |
| `fixos` | despesas recorrentes (nome, valor, dia) — **hoje desligadas dos balanços** | `user_id` |
| `memory` | ⚠️ não é memória de IA: guarda `ciclo_dia` e as Notas do Dashboard, 1 linha por usuário | `user_id` |
| `cores` | ⭐ paleta **global**, sem dono e **sem RLS**, deliberadamente (D-009) | — |
| `leads` | contatos da landing; única escrita sem autenticação | — |

**Colunas de `transactions` usadas no código:** `user_id`, `data`, `nome`, `apelido`, `valor`,
`banco`, `mes_fatura`, `categoria_id`, `hora`, `parcela_atual`, `parcela_total`, `pendente`,
`created_at`.

---

## As invariantes que não se quebram

1. ⭐ **A IA nunca grava registro final.** Tudo entra com `pendente: true`. Toda tela de balanço
   filtra `pendente = false`. → `context/30-decisoes-e-licoes.md` D-001
2. ⭐ **A unidade de tempo é o ciclo de fatura**, definido por `memory.ciclo_dia` (padrão 5) — não o
   mês do calendário. Vale em **todas** as telas, inclusive o Dashboard Anual, cujo "ano" vai de
   06/01 a 05/01 do ano seguinte. → D-002
3. **Toda query filtra por `user_id`.** Sem exceção nas tabelas de usuário.
4. **`valor` é assinado:** positivo é entrada, negativo é saída. Não há coluna de tipo.
5. **A IA não calcula.** Ela extrai e classifica; toda soma e agrupamento é JavaScript. 🔶
6. ⭐ **A regra de ciclo mora só em `src/lib/ciclo.ts`.** Nunca reimplemente localmente — foi assim
   que o Dashboard e o `/meses` passaram a discordar por um ano inteiro. → D-007
7. ⭐ **Nenhuma tela chama um LLM.** Agente de IA se pede à `ai-agents` pelo nome. → D-012

---

## Armadilhas

**1. ⛔ Toda variável `VITE_*` é embutida no bundle** que vai ao browser — o `.gitignore` protege
o repositório, não o site. Foi assim que a chave do Gemini ficou pública até 2026-08-27. **Nunca
ponha segredo atrás de um prefixo `VITE_`**; segredo vai para secret de Edge Function.
→ `context/30-decisoes-e-licoes.md` D-005

**2. ⚠️ `cores` está sem RLS de propósito.** Todas as tabelas de usuário têm RLS ligada; `cores` é
paleta global, sem `user_id`. Ligar RLS ali quebra o seletor de cores e não protege nada. → D-009.
O schema, porém, só existe no painel do Supabase — nada versionado. → P20

**3. `tsc -b` roda em `strict`.** Import não usado (`TS6133`), campo opcional do Recharts
(`TS18048`) e assinatura de `formatter` de tooltip (`TS2322`) já quebraram o deploy. → L-001

**4. O prompt vive na função, não na tela.** `supabase/functions/ai-agents/prompts/` monta os três
modos de partes comuns. Mexeu no prompt? **Faça o deploy da função** — o `npm run build` não leva
nada disso.

**5. `Pendentes.tsx` tem 1.210 linhas** e concentra upload, três pipelines de IA, seed de
categorias, pós-processamento e revisão. É o arquivo mais arriscado do projeto.

**6. `Meses.tsx` carrega todas as transações do usuário** de uma vez, sem paginação.

**7. Erro vira `alert()`.** Não há tratamento estruturado em lugar nenhum. → P3

**8. ⚠️ Rota nova de SPA depende do `vercel.json`.** As rotas são do `BrowserRouter` e não existem
como arquivo: sem o `rewrites` para `/index.html`, recarregar qualquer tela com F5 dá 404 — e o
retorno do login, que vai direto para `/dashboard`, também. → `context/30-decisoes-e-licoes.md`
L-002

**9. Auth do Google depende de configuração que o git não guarda.** O *Site URL* e a lista de
*Redirect URLs* vivem no painel do Supabase. `redirectTo` no código não decide nada sozinho. → L-002

---

## O pipeline de IA em quatro linhas

O browser lê o arquivo → `supabase.functions.invoke('ai-agents', …)` → a função busca as categorias
e o ciclo do usuário sob a RLS dele, monta o prompt e chama o Gemini → recorta o JSON, desloca a
data das parcelas e casa a categoria → devolve as linhas, e **o browser insere** com `pendente: true`.
**Detalhe completo:** `context/03-agentes-de-ia.md`.

---

## Ao terminar uma mudança

Se ela mudou um **fato** sobre o produto — uma decisão, uma pendência criada ou resolvida, um
comportamento novo, uma armadilha descoberta — **use a skill `contexto-balanco`** para registrar no
lugar certo. Um fato tem um único dono; não repita, linke.
