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
`RESEND_API_KEY`, `SELLER_EMAIL` e ⚠️ `WEBHOOK_SECRET` em `send-email`.

⛔ **`send-email` tem ordem de deploy.** Ela passou a exigir o header `x-webhook-secret`. Crie o
secret → configure o header no Database Webhook → **só então** publique. Ao contrário, o e-mail de
lead para em silêncio. → `context/30-decisoes-e-licoes.md` L-004

---

## Estrutura

```
vercel.json            ⭐ reescrita de SPA — sem ela, toda rota dá 404 em acesso direto
src/
  App.tsx              rotas + guarda de sessão
  lib/supabase.ts      cliente único
  lib/ciclo.ts         ⭐ a regra de ciclo de fatura — dono único, usada por /meses e /dashboard
  lib/parcelas.ts      a conta de uma compra parcelada e a projeção por ciclo
  lib/fixos-propostos.ts  ⭐ a cascata de detecção. A ordem importa e quebra em silêncio
  lib/compromissos.ts  a lista semente de tipos e a amortização por rótulo
  lib/parcelas.ts      comprometido restante e projeção por ciclo — usada por /parcelas e /dashboard
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
      lib/memoria-categoria.ts   o que o usuário confirmou 3× vence o palpite da IA
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
⭐ `/compromissos` (⚠️ `/fixos` e `/parcelas` redirecionam para cá) ·
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
| `categories` | categorias do usuário (nome + cor + `e_renda`); ⚠️ **28** semeadas no 1º acesso, duas já marcadas como renda (D-051) | `user_id` |
| `fixos` | despesas recorrentes (nome, valor, dia) — **hoje desligadas dos balanços**. ⚠️ Guarda três coisas: ativos, recusas e encerrados, com `DEFAULT 'ativo'` | `user_id` |
| `memory` | ⚠️ não é memória de IA: guarda `ciclo_dia` e as Notas do Dashboard, 1 linha por usuário | `user_id` |
| `compromissos` | ⭐ tipos que a IA reconhece **e** o compromisso detectado — 1:1, uma tabela só | `user_id` |
| `compromisso_exemplos` | ⭐ até 10 transações por tipo, apontadas pelo usuário; vão ao prompt do agente 2. Teto imposto por **trigger**, `on delete cascade` na transação (D-035) | `user_id` |
| `vocabulario` | regras (`nome contém X` → categoria) e notas para o prompt (D-030) | `user_id` |
| `cores` | ⭐ paleta **global**, sem dono. RLS ligada: legível por todos, **gravável por ninguém** | — |
| `leads` | contatos da landing; única escrita sem autenticação | — |

**Colunas de `transactions` usadas no código:** `user_id`, `data`, `nome`, `apelido`, `valor`,
`banco`, `mes_fatura`, `categoria_id`, `hora`, `parcela_atual`, `parcela_total`, `pendente`,
`comentario`, `compromisso`, `compromisso_manual`, `created_at`.

---

## As invariantes que não se quebram

1. ⭐ **A IA nunca grava registro final.** Tudo entra com `pendente: true`. Toda tela de balanço
   filtra `pendente = false`. → `context/30-decisoes-e-licoes.md` D-001
2. ⭐ **A unidade de tempo é o ciclo de fatura**, definido por `memory.ciclo_dia` — não o mês do
   calendário. Vale em **todas** as telas, inclusive o Dashboard Anual, cujo "ano" acompanha o
   ciclo. ⚠️ **O padrão é 1 desde 30/08** (era 5), e o dono do número é o `DEFAULT` da coluna: a
   linha de `memory` nasce junto com a conta. → D-002, D-052
3. **Toda query filtra por `user_id`.** Sem exceção nas tabelas de usuário.
4. **`valor` é assinado:** positivo é entrada, negativo é saída. Não há coluna de tipo.
5. **A IA não calcula.** Ela extrai e classifica; toda soma e agrupamento é JavaScript. 🔶
6. ⭐ **A regra de ciclo mora só em `src/lib/ciclo.ts`.** Nunca reimplemente localmente — foi assim
   que o Dashboard e o `/meses` passaram a discordar por um ano inteiro. → D-007
7. ⭐ **Nenhuma tela chama um LLM.** Agente de IA se pede à `ai-agents` pelo nome. → D-012
8. ⭐ **Determinístico primeiro.** Classificação tenta uma regra sobre o dado que já existe; a IA só
   entra no que a regra não alcança. O que a regra resolve não vai ao prompt. → D-028
9. ⭐ **Detectar exige 2; sobrescrever o usuário exige 3.** As duas camadas do comprometido
   detectam com **2** ocorrências — `PISO` (`fixos-propostos.ts`) e `PISO_COMPROMISSO`
   (`compromissos.ts`) —, porque demorar a detectar deixa o comprometido menor do que é. O **3**
   sobrevive só na memória de categoria, que sobrescreve a escolha da IA em silêncio. E um
   terceiro limiar, `PISO_AUTO = 3`, decide quando a proposta de gasto fixo é aceita sozinha —
   propor é barato, criar sem perguntar não.
10. ⭐ **`/perfil` é o dono da configuração.** Tela de operação que precisa configurar **navega** para
    lá, não abre editor próprio. → D-029
11. ⛔⛔ **Uma transação pertence a uma camada só.** A cascata é `manual → parcela → fixo → rótulo`,
    e cada degrau só enxerga o que sobrou. Dono do cálculo: `src/lib/comprometido.ts`. Dupla
    contagem infla o total, e o total é a tese do produto. → D-033
12. ⭐ **A cor de tema mora em `src/index.css`**, como variável CSS. O `tailwind.config.js` só aponta
    para ela. Nunca escreva um hex de marca num componente. → D-037
13. ⛔ **O gasto fixo é identificado pela `assinatura`, nunca pelo `nome`.** `fixos.nome` guarda o
    apelido e é só rótulo de exibição. Índice único em `(user_id, assinatura)`. → D-043
14. ⛔ **Função de carga só lê.** `insert`/`update`/`upsert` dentro de um `carregar()` vira corrida
    sob `StrictMode`, que roda o efeito duas vezes. → L-008

---

## Armadilhas

**1. ⛔ Toda variável `VITE_*` é embutida no bundle** que vai ao browser — o `.gitignore` protege
o repositório, não o site. Foi assim que a chave do Gemini ficou pública até 2026-08-27. **Nunca
ponha segredo atrás de um prefixo `VITE_`**; segredo vai para secret de Edge Function.
→ `context/30-decisoes-e-licoes.md` D-005

**2. ⛔ Tabela nova nasce ABERTA à internet.** `ALTER DEFAULT PRIVILEGES` concede tudo a `anon`, e
só a RLS fecha. **Toda tabela criada por migration precisa de `ENABLE ROW LEVEL SECURITY` e política
na mesma migration.** Não é zelo: `cores` ficou gravável por qualquer anônimo por meses exatamente
assim. → `context/30-decisoes-e-licoes.md` L-003

**3. ⚠️ Ao avaliar uma tabela, pergunte quem lê E quem escreve.** São dois portões — o `GRANT` do
Postgres e a RLS. Olhar só para a RLS vê metade do problema. → L-003

**4. `tsc -b` roda em `strict`.** Import não usado (`TS6133`), campo opcional do Recharts
(`TS18048`) e assinatura de `formatter` de tooltip (`TS2322`) já quebraram o deploy. → L-001

**5. O prompt vive na função, não na tela.** `supabase/functions/ai-agents/prompts/` monta os três
modos de partes comuns. Mexeu no prompt? **Faça o deploy da função** — o `npm run build` não leva
nada disso.

**5a. ⚠️ Parcela numa planilha só sai do padrão `N/M` escrito na linha** — e a data dessa linha é
lida como a data da **compra**, não da cobrança: `normalizar.ts` a desloca `atual − 1` meses para a
frente, nos três modos. → D-048, P36

**5b. ⛔ São dois agentes, e `compromisso` só pertence ao segundo.** Se o campo voltar ao prompt de
extração, os dois respondem, o último a escrever vence, e a classificação passa a mudar sozinha
entre importações. → D-034

**5c. ⚠️ Id de modelo errado só falha em runtime**, com 404 da API. `tsc`, `deno check` e o deploy
passam. As constantes são `MODELO.EXTRACAO` e `MODELO.CLASSIFICACAO`, em `lib/modelos.ts`.

**6. `Pendentes.tsx` tem ~1.000 linhas** e concentra upload, três pipelines de IA, seed de
categorias, pós-processamento e revisão. É o arquivo mais arriscado do projeto.

**7. `Meses.tsx` carrega todas as transações do usuário** de uma vez, sem paginação.

**8. Erro vira `alert()`.** Não há tratamento estruturado em lugar nenhum. → P3

**9. ⚠️ Rota nova de SPA depende do `vercel.json`.** As rotas são do `BrowserRouter` e não existem
como arquivo: sem o `rewrites` para `/index.html`, recarregar qualquer tela com F5 dá 404 — e o
retorno do login, que vai direto para `/dashboard`, também. → `context/30-decisoes-e-licoes.md`
L-002

**10. Auth do Google depende de configuração que o git não guarda.** O *Site URL* e a lista de
*Redirect URLs* vivem no painel do Supabase. `redirectTo` no código não decide nada sozinho. → L-002
⚠️ A entrada mudou para `/compromissos` em 30/08: se a lista tiver `.../dashboard` literal, o SSO
volta sem sessão. → P34

**11. ⚠️ A cor de marca só existe em `src/index.css`.** Os canais vão **separados por espaço, sem
`#`** — é o que o Tailwind precisa para aplicar opacidade. Trocar por hex quebra `bg-primary/10`
**em silêncio**, sem erro de build. E `text-primary` pinta ícone e texto: dentro da plataforma o
texto usa `text-azul`. → D-037

**12b. ⚠️ Fixture que iguala `nome` e `apelido` não consegue falhar.** Campo que existe para ser
diferente tem de ser diferente no teste, senão ele prova só o caso degenerado. → L-009

**12. ⚠️ Não existe runner de teste.** Os casos que cobrem ciclo, camadas e cascata foram escritos
como scripts avulsos e rodados fora do repositório. Mudou `comprometido.ts`, `fixos-propostos.ts` ou
`parcelas.ts`? Não há rede de segurança automática. → P32

---

## O pipeline de IA em cinco linhas

O browser lê o arquivo → `supabase.functions.invoke('ai-agents', …)` → **agente 1** monta o prompt
com as categorias e o ciclo do usuário, lidos sob a RLS dele, e chama o Gemini → recorta o JSON,
desloca a data das parcelas, casa a categoria pela memória e descarta estornos → **agente 2**
classifica o `compromisso` do que sobrou, numa segunda chamada só de texto → devolve as linhas, e
**o browser insere** com `pendente: true`.

⭐ Uma chamada do browser, duas ao Gemini: o encadeamento é interno à função.
**Detalhe completo:** `context/03-agentes-de-ia.md`.

---

## Ao terminar uma mudança

Se ela mudou um **fato** sobre o produto — uma decisão, uma pendência criada ou resolvida, um
comportamento novo, uma armadilha descoberta — **use a skill `contexto-balanco`** para registrar no
lugar certo. Um fato tem um único dono; não repita, linke.
