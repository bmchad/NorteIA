---
status: vigente
atualizado_em: 2026-08-30
---

# Erros comuns — o que se acredita e é falso

> **O que este arquivo é:** a lista das crenças erradas que este repositório produz em quem chega.
> Cada linha aponta para onde está a explicação — **este arquivo não explica nada em profundidade,
> de propósito**.
>
> ⭐ **Leia antes de qualquer outra coisa técnica.** São 40 linhas.

---

## Sobre o produto

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| ⭐⭐ O produto serve para consultar quanto se gasta por categoria | É a **terceira** etapa. A ordem é `comprometido → o que sobra → como você gasta`. Consulta sozinha é relatório do passado | `30-decisoes-e-licoes.md` D-027 |
| O comprometido é um número só | ⭐ São **três camadas de certeza** — contratado, recorrente, previsível — e somá-las esconde o que dá para cancelar | `04-glossario.md` |
| Toda transação positiva é renda | ⚠️ Não. Estorno, reembolso e venda entram positivos e não são renda. `categories.e_renda` separa | `30-decisoes-e-licoes.md` D-025 |
| O histórico do Bernardo mede o produto | ⛔ É **horizontal**: uma amostra de um usuário mede o usuário. Decisão se justifica por argumento estrutural | `01-o-que-e-o-balanco-geral.md` |
| A IA grava a transação direto no histórico | Grava como **rascunho** (`pendente: true`); só a sua revisão a torna real | `03-agentes-de-ia.md` |
| ⭐ O balanço de Janeiro tem as transações de Janeiro | Tem as do **ciclo** de Janeiro — do dia 6/01 ao dia 5/02, com ciclo 5 | `04-glossario.md` |
| `data` é o mês em que a transação entra no balanço | Isso é `mes_fatura`. `data` é quando a compra aconteceu | `04-glossario.md` |
| "Pendente" é conta a pagar | É rascunho de IA não revisado | `04-glossario.md` |
| Uma compra em 10x cria 10 registros | Cria um registro por parcela **conforme ela aparece na fatura**, com a data deslocada | `30-decisoes-e-licoes.md` D-003 |
| ⭐ A categoria automática vem sempre da IA | Se você já confirmou a mesma categoria 3 vezes para aquele nome, **a sua memória sobrescreve a IA** — em silêncio, sem tela | `03-agentes-de-ia.md` |
| ⭐ O ciclo existe para bater com a fatura do banco | A âncora é o **salário** — o mês de uma pessoa começa quando o dinheiro entra. A fatura só costuma cair perto | `30-decisoes-e-licoes.md` D-002 |
| `/parcelas` deveria agrupar pelo nome do estabelecimento | Agrupar por nome foi a primeira versão e **falhava** — o nome muda entre faturas da mesma compra | `30-decisoes-e-licoes.md` D-008 |
| Gastos fixos entram nos balanços | ⚠️ **Não entram.** `fixos` é uma lista paralela, sem ligação com `transactions` | `02-paginas-do-balanco-geral.md` |
| Existem três agentes de IA | São **dois** — extrair e classificar compromisso —, e o de extração tem três portas de entrada (imagem, planilha, PDF). ⚠️ Era um só até 30/08 | `03-agentes-de-ia.md` |
| ⭐ A IA escolhe o `compromisso` no mesmo prompt em que extrai | Não. É o **agente 2**, numa segunda chamada, e o campo foi retirado do prompt de extração de propósito | `30-decisoes-e-licoes.md` D-034 |
| ⭐⭐ Se cada regra reivindica sua transação, o total está certo | ⛔ A cascata precisa atravessar as **três camadas**. Ela parava dentro da detecção de fixos, e uma academia rotulada + aceita como fixo virava o dobro | `30-decisoes-e-licoes.md` D-033 |
| Gasto fixo se cadastra à mão em `/compromissos` | ⚠️ **Não mais.** É detectado depois de 3 cobranças iguais. Fixos manuais antigos continuam funcionando | `30-decisoes-e-licoes.md` D-036 |
| A evidência de um gasto fixo vem da coluna `fixos.evidencia` | Vem **derivada na hora**, de `lancamentosDoFixo`. A coluna é registro do que justificou o aceite, e envelhece | `30-decisoes-e-licoes.md` D-033 |
| Para trocar a cor do produto, edite o `tailwind.config.js` | ⭐ Edite **`src/index.css`** — é o único lugar onde uma cor de tema é escrita. O config só aponta para as variáveis | `30-decisoes-e-licoes.md` D-037 |
| Entrar leva ao `/dashboard` | Leva a `/compromissos` desde 30/08. ⚠️ São **dois** caminhos até lá: o redirect pós-login e o `redirectTo` do SSO | `30-decisoes-e-licoes.md` D-038 |
| O produto se chama Balanço Geral | Na **vitrine** é "Assistente Itaú", protótipo do InovaCamp WI. Repositório, banco e domínio continuam `balanco-geral` | `30-decisoes-e-licoes.md` D-039 |
| O "ano" do Dashboard é de 1º de janeiro a 31 de dezembro | É um **ano de ciclos**: com ciclo 5, vai de 06/01 a 05/01 do ano seguinte. O total bate com a soma dos 12 ciclos do `/meses` | `02-paginas-do-balanco-geral.md` |
| Cada tela calcula o ciclo do seu jeito | Há **uma função só**, `src/lib/ciclo.ts`. Duplicar a regra foi o que causou a divergência corrigida em 2026-08-27 | `30-decisoes-e-licoes.md` D-007 |

---

## Sobre segurança e infraestrutura

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| ⭐ O frontend chama o Gemini | **Não chama.** Desde 2026-08-27 toda chamada de agente passa pela Edge Function `ai-agents`, e a chave é secret do servidor | `03-agentes-de-ia.md` |
| Uma variável `VITE_*` fica escondida por estar no `.env` | ⚠️ **Não fica.** Todo `VITE_*` é embutido no bundle que vai ao browser. O `.gitignore` protege o repositório, não o site | `30-decisoes-e-licoes.md` D-005 |
| A Edge Function escreve as transações no banco | Ela devolve as linhas prontas; **quem insere é o browser**, com a própria sessão, para a escrita passar por RLS de usuário | `30-decisoes-e-licoes.md` D-012 |
| Cada agente de IA novo vira uma Edge Function nova | É um arquivo em `agentes/` e uma linha no roteador de `ai-agents` | `30-decisoes-e-licoes.md` D-012 |
| O Postgres valida o campo `banco` | ⚠️ Não valida mais. A constraint `chk_banco` foi derrubada; o enum vive só no prompt | `30-decisoes-e-licoes.md` D-011 |
| A anon key do Supabase no código é um vazamento | Ela é **pública por design** — o que protege os dados é RLS, não o segredo da chave | `30-decisoes-e-licoes.md` D-009 |
| ⭐⭐ Tabela sem dado pessoal não precisa de RLS | **Falso, e caro.** `cores` não guardava dado de ninguém e mesmo assim qualquer anônimo a apagava, porque tinha `GRANT ALL` para `anon`. Destruir é tão grave quanto vazar | `30-decisoes-e-licoes.md` L-003 |
| RLS ligada significa tabela protegida | São **dois portões**: o `GRANT` do Postgres e a RLS. O Supabase abre o primeiro por padrão e fecha só com o segundo | `30-decisoes-e-licoes.md` L-003 |
| Tabela nova nasce fechada | ⛔ Nasce **aberta à internet**. `ALTER DEFAULT PRIVILEGES` concede tudo a `anon`; só a RLS fecha | `CLAUDE.md` |
| A policy de `leads` com `auth.role()` era controle de acesso por papel | `auth.role()` é o papel embutido do Supabase, não um papel de aplicação. Nunca distinguiu admin de usuário | `30-decisoes-e-licoes.md` D-021 |
| Só dá para importar extrato do Inter e do XP | A IA reconhece os **20 bancos** de `BANCOS` (`src/lib/ia.ts`), mais `Outros` | `30-decisoes-e-licoes.md` D-010 |
| O schema do banco está versionado no repositório | ⚠️ Só a tabela `leads` tem SQL, em `supabase/supabase-additions/`. O resto do schema existe **apenas** no painel do Supabase | `20-pendencias-e-dividas.md` P20 |
| `memory` é a memória de conversa da IA | É a configuração do usuário (`ciclo_dia`) + as Notas do Dashboard | `04-glossario.md` |
| A tabela `cores` é por usuário | É uma **paleta global**, sem `user_id` | `04-glossario.md` |
| ⚠️ O `context/` inteiro está no git | **Metade.** `00`–`05` são versionados; `10`, `11`, `20` e `30` ficam de fora e **não têm segunda cópia** — se você clonou o repositório, esses quatro não vieram | `30-decisoes-e-licoes.md` D-006 |
| Só existem as tabelas que as telas usam | Existe também `profiles`, preenchida pelo trigger `handle_new_user` a cada cadastro, e que dispara o e-mail de boas-vindas | `04-glossario.md` |
| Se `npm run dev` roda, o deploy passa | ⚠️ Não. O build roda `tsc -b` em `strict`: um import não usado quebra a Vercel e não quebra o dev | `30-decisoes-e-licoes.md` L-001 |
