---
status: vigente
atualizado_em: 2026-08-27
---

# LEIA PRIMEIRO

> **Você é um agente ou uma pessoa nova neste repositório.** Este arquivo é o roteador: ele diz o
> que ler, em que ordem, e onde mora a verdade de cada coisa. São ~90 linhas. Leia inteiro.
>
> 🔶 **Este símbolo marca o que foi escrito por dedução e ainda não foi confirmado pelo Bernardo.**
> Se você encontrar um 🔶, trate como hipótese, não como fato. Confirmou? Apague o símbolo.

---

## As 7 frases que definem o Balanço Geral

1. É um controle financeiro pessoal em que **a IA lê a fatura por você**: print, planilha ou PDF
   entram, transações estruturadas saem.
2. ⭐ **A IA nunca grava um registro final.** Tudo que ela extrai entra como **rascunho**
   (`pendente: true`) e só vira registro depois de você revisar em `/novos-registros`.
3. ⭐ **O mês do Balanço Geral não é o mês do calendário — é o ciclo da fatura.** A fatura de
   Janeiro vai do dia 6 de Janeiro ao dia 5 de Fevereiro (com `ciclo_dia = 5`).
4. Todo dado é **por usuário**, isolado por `user_id` no Supabase. Não há administrador nem visão
   agregada entre usuários.
5. O produto é **pessoal, com ambição de virar produto** — a landing page, o FAQ e a tabela `leads`
   já existem, mas não há cliente. Ver `11-ambicao-de-produto.md`.
6. ⭐ **Nenhuma tela fala com o Gemini.** Toda chamada de agente passa pela Edge Function
   `ai-agents`, onde a chave vive como secret do servidor. Ver `03-agentes-de-ia.md`.
7. O repositório é **público**, e só metade desta pasta está nele. Ver `30-decisoes-e-licoes.md`
   D-006 — e o aviso logo abaixo.

---

## ⛔ Quatro arquivos citados aqui podem não existir para você

`10-proximos-passos.md`, `11-ambicao-de-produto.md`, `20-pendencias-e-dividas.md` e
`30-decisoes-e-licoes.md` **ficam fora do git**. Se você chegou por um clone do repositório público,
eles não vieram — as referências continuam no texto de propósito, para que se saiba que existem e
onde o assunto mora.

⚠️ Consequência prática: **`30-decisoes-e-licoes.md`, o registro do porquê, é o arquivo mais citado
e o que menos gente tem.** Antes de "consertar" algo que parece errado, considere que pode haver uma
decisão registrada ali. → D-006

---

## Quero fazer X → leia Y

| Preciso… | Leia |
|---|---|
| entender o produto em uma leitura | `01-o-que-e-o-balanco-geral.md` |
| saber o que cada tela faz | `02-paginas-do-balanco-geral.md` |
| mexer na extração por IA | ⭐ `03-agentes-de-ia.md` |
| entender um termo (`mes_fatura`, `ciclo`, `pendente`…) | `04-glossario.md` |
| **não acreditar em coisa errada** | ⭐ `05-erros-comuns.md` — 40 linhas, leia sempre |
| **mexer no código** | `CLAUDE.md` na raiz |
| escolher no que trabalhar | `20-pendencias-e-dividas.md` (ordenado por dificuldade) |
| saber o que vem depois | `10-proximos-passos.md` |
| saber o que o produto quer ser | `11-ambicao-de-produto.md` (`status: proposta`) |
| ⭐ **saber por que algo é assim** | `30-decisoes-e-licoes.md` |

---

## Onde está a verdade de cada coisa

Regra desta pasta: **um fato tem um único dono.** Se dois arquivos responderem a mesma pergunta, um
deles está velho.

| Pergunta | Dono da verdade |
|---|---|
| Como rodo, faço build, faço deploy? | `CLAUDE.md` (raiz) |
| Qual é o schema real do banco? | `supabase-backup/supabase/schema.sql` (fora do git). Mudanças novas vão como migration em `supabase/migrations/` |
| Como a IA extrai as transações? | `supabase/functions/ai-agents/` e `03-agentes-de-ia.md` |
| Quais são as armadilhas do código? | `CLAUDE.md` (raiz) |
| O que a IA extrai e com que regras? | `context/03-agentes-de-ia.md` |
| Por que decidimos assim? | `context/30-decisoes-e-licoes.md` |
| O que está pendente? | `context/20-pendencias-e-dividas.md` |
| Qual é a paleta / o design? | `tailwind.config.js` |

⚠️ **`CLAUDE.md` é dono do presente; `context/` é dono do futuro e do porquê.** Se os dois
discordarem sobre como o sistema funciona hoje, **o `CLAUDE.md` está certo**.

---

## Ordem de leitura recomendada

**Agente que vai mexer em código (5 min):**
`00` (este) → `05-erros-comuns` → `CLAUDE.md` da raiz.

**Agente que vai mexer na IA (10 min):**
`00` → `05-erros-comuns` → `03-agentes-de-ia` → `04-glossario`.

**Agente que vai propor produto (20 min):**
`00` → `01` → `11-ambicao-de-produto` → `10-proximos-passos` → `30-decisoes-e-licoes`.

---

## Se você está escrevendo alguma coisa aqui

Seis regras. São elas que impedem esta pasta de virar um depósito.

1. **Um fato, um dono.** Não repita — **linke**.
2. **Nunca misture "o que é" com "o que queremos".** Arquivo de realidade não contém roadmap;
   arquivo de proposta abre declarando `status: proposta`.
3. **Frontmatter obrigatório:** `status` (`vigente`/`proposta`/`superado`) e `atualizado_em`.
4. **Teto de ~400 linhas.** Acima disso ninguém lê inteiro e passa a citar pedaço fora de contexto.
   Estourou, divide. ⚠️ **Exceção declarada: `30-decisoes-e-licoes.md`**, que é *append-only* e
   lido por busca (`D-004`, `L-001`), não de cabo a rabo.
5. **Superado vira decisão, não arquivo apagado.** Quando um fato deixa de valer, o porquê (com o
   que foi rejeitado) vai para `30-decisoes-e-licoes.md` **antes**, e a afirmação antiga é corrigida
   e datada com `⚠️ Correção de <data>:`. ⛔ **Não crie pasta de arquivo morto.**
6. **Não invente sem marcar.** O que for dedução sua leva 🔶 até alguém confirmar.

⛔ **`git log` não te salva aqui.** `/context` está no `.gitignore`: se um porquê não estiver
escrito em `30-decisoes-e-licoes.md`, ele não existe em lugar nenhum.

**Ao terminar qualquer alteração que mude um fato, use a skill `contexto-balanco`.**
