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
| IA | `@google/generative-ai` → `MODELO.RAPIDO` (`gemini-3.5-flash`), chamado **do browser** ⛔ |
| Gráficos | `recharts` 3 |
| Planilhas | `xlsx` (SheetJS), lê `.xlsx` e converte para CSV |
| Deploy | Vercel 🔶 |

---

## Variáveis de ambiente

Ficam no `.env` (gitignorado) e **também precisam estar configuradas na Vercel**.

| Variável | Observação |
|---|---|
| `VITE_SUPABASE_URL` | pública |
| `VITE_SUPABASE_ANON_KEY` | pública **por design** — quem protege os dados é RLS |
| `VITE_GEMINI_API_KEY` | ⛔ **NÃO é secreta.** Ver a armadilha nº 1 abaixo |

`src/lib/supabase.ts` lança erro na inicialização se as duas primeiras faltarem.

---

## Estrutura

```
src/
  App.tsx              rotas + guarda de sessão
  lib/supabase.ts      cliente único
  lib/ciclo.ts         ⭐ a regra de ciclo de fatura — dono único, usada por /meses e /dashboard
  lib/ia.ts            o vocabulário do prompt: MODELO (id do Gemini) e BANCOS (os 20 aceitos)
  components/
    Layout.tsx         sidebar + navegação das telas autenticadas
    ConfirmModal.tsx   confirmação de ações destrutivas
  pages/               uma por rota — ver context/02-paginas-do-balanco-geral.md
supabase/
  supabase-additions/  o SQL de `leads` e a Edge Function de e-mail. Versionado
context/               ⚠️ gitignorado. Produto, roadmap, decisões
```

**Rotas:** `/` (landing pública) · `/login` · `/dashboard` · `/meses` · `/novos-registros` ·
`/fixos` · `/parcelas` · `/historico` · `/perfil`. Tudo exceto `/` e `/login` exige sessão e
redireciona sem ela.

---

## Banco de dados

⚠️ **O schema real vive apenas no painel do Supabase.** Só `leads` tem SQL no repositório, em
`supabase/supabase-additions/`. Não existe pasta de migrations. RLS está ligada em todas as tabelas
de usuário (conferido em 2026-08-27); `cores` é a exceção deliberada. → P20, D-009

| Tabela | Papel | Chave |
|---|---|---|
| `transactions` | a tabela central, uma linha por lançamento | `user_id` |
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

---

## Armadilhas

**1. ⛔ `VITE_GEMINI_API_KEY` está pública no bundle.** Toda variável `VITE_*` é embutida no
JavaScript que vai ao browser. A chave do Gemini é extraível por qualquer visitante do site. O
`.env` no `.gitignore` **não muda isso**. É a dívida nº 1 do projeto, já decidida: migra para Edge
Function → `context/20-pendencias-e-dividas.md` P1 e `30-decisoes-e-licoes.md` D-005.

**2. ⚠️ `cores` está sem RLS de propósito.** Todas as tabelas de usuário têm RLS ligada; `cores` é
paleta global, sem `user_id`. Ligar RLS ali quebra o seletor de cores e não protege nada. → D-009.
O schema, porém, só existe no painel do Supabase — nada versionado. → P20

**3. `tsc -b` roda em `strict`.** Import não usado (`TS6133`), campo opcional do Recharts
(`TS18048`) e assinatura de `formatter` de tooltip (`TS2322`) já quebraram o deploy. → L-001

**4. O prompt da IA está copiado em três lugares** em `Pendentes.tsx` e **já divergiu** entre eles.
Mudou o contrato? Mude nos três. → P7. ⭐ O id do modelo e a lista de bancos **não** entram aí:
vêm de `src/lib/ia.ts` (D-010).

**5. `Pendentes.tsx` tem 1.210 linhas** e concentra upload, três pipelines de IA, seed de
categorias, pós-processamento e revisão. É o arquivo mais arriscado do projeto.

**6. `Meses.tsx` carrega todas as transações do usuário** de uma vez, sem paginação.

**7. Erro vira `alert()`.** Não há tratamento estruturado em lugar nenhum. → P3

---

## O pipeline de IA em três linhas

Imagem, planilha ou PDF → Gemini com a lista de categorias do usuário e a regra do ciclo dentro do
prompt → array JSON recortado entre `[` e `]` → JavaScript desloca a data das parcelas, casa a
categoria por nome e insere com `pendente: true`.
**Detalhe completo:** `context/03-agentes-de-ia.md`.

---

## Ao terminar uma mudança

Se ela mudou um **fato** sobre o produto — uma decisão, uma pendência criada ou resolvida, um
comportamento novo, uma armadilha descoberta — **use a skill `contexto-balanco`** para registrar no
lugar certo. Um fato tem um único dono; não repita, linke.
