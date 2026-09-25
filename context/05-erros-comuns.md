---
status: vigente
atualizado_em: 2026-09-24
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
| ⭐ A "Taxa de poupança" do Dashboard divide pela renda | ⚠️ Divide por **todas as entradas** — reembolso e devolução entram no divisor e a taxa aparece melhor do que é. Decidido assim; a tooltip diz "de tudo que entrou" | `src/pages/Dashboard.tsx` |
| Uma taxa de poupança negativa é um erro para travar em zero | ⛔ É o fato mais importante que o card tem a dar: você gastou mais do que entrou. "0%" diria outra coisa, e mais branda | `30-decisoes-e-licoes.md` D-027 |
| ⭐⭐ `transactions.tipo = 'credito'` quer dizer que entrou dinheiro | ⛔ Quer dizer **cartão de crédito** — o instrumento, não a direção. Direção é o sinal de `valor`; renda é `categories.e_renda`. A coluna responde a *quando o dinheiro sai da conta* | `30-decisoes-e-licoes.md` D-061 |
| ⭐ Uma cobrança recorrente de dia 20 pesa na conta no dia 20 | Só se for **débito em conta**. No cartão ela espera a fatura — e é por isso que `tipo` existe. Dia 21 é multa num caso e nada no outro | `30-decisoes-e-licoes.md` D-061 |
| `memory.ciclo_dia` é o dia em que a fatura vence | ⚠️ É o **fechamento**, onde o ciclo corta. O vencimento vive em `vencimentos.dia`, por banco — mexer num muda o produto inteiro, no outro só a posição de um débito | `30-decisoes-e-licoes.md` D-063 |
| Toda transação positiva é renda | ⚠️ Não. Estorno, reembolso e venda entram positivos e não são renda. `categories.e_renda` separa | `30-decisoes-e-licoes.md` D-025 |
| ⭐ A IA não categoriza entrada | ⚠️ **Categoriza desde 30/08.** Antes o prompt mandava devolver `null` em todo positivo — e com isso o card Renda, que depende da categoria, ficava zerado | `30-decisoes-e-licoes.md` D-054 |
| O histórico do Bernardo mede o produto | ⛔ É **horizontal**: uma amostra de um usuário mede o usuário. Decisão se justifica por argumento estrutural | `01-o-que-e-o-balanco-geral.md` |
| A IA grava a transação direto no histórico | Grava como **rascunho** (`pendente: true`); só a sua revisão a torna real | `03-agentes-de-ia.md` |
| ⭐ Com `ciclo_dia = 1` o ciclo é o mês do calendário | ⚠️ É o mês **deslocado em um dia**: janeiro vai de 02/01 a 01/02, porque o dia 1º cai sempre no ciclo anterior. O mês exato exigiria ciclo 0, que o `CHECK` proíbe | `30-decisoes-e-licoes.md` D-052 |
| ⭐ O balanço de Janeiro tem as transações de Janeiro | Tem as do **ciclo** de Janeiro — do dia 6/01 ao dia 5/02, com ciclo 5 | `04-glossario.md` |
| `data` é o mês em que a transação entra no balanço | Isso é `mes_fatura`. `data` é quando a compra aconteceu | `04-glossario.md` |
| "Pendente" é conta a pagar | É rascunho de IA não revisado | `04-glossario.md` |
| Uma compra em 10x cria 10 registros | Cria um registro por parcela **conforme ela aparece na fatura**, com a data deslocada | `30-decisoes-e-licoes.md` D-003 |
| ⭐ A categoria automática vem sempre da IA | Se você já confirmou a mesma categoria 3 vezes para aquele nome, **a sua memória sobrescreve a IA** — em silêncio, sem tela | `03-agentes-de-ia.md` |
| ⭐ O padrão de `ciclo_dia` é 5 | ⚠️ **É 1 desde 30/08**, e o dono do número é o `DEFAULT` da coluna — não os `??` do TypeScript. A linha de `memory` nasce com a conta | `30-decisoes-e-licoes.md` D-052 |
| Um `406` do PostgREST é falta de permissão | ⭐ É **cardinalidade**: `.single()` exige exatamente uma linha e recebeu zero (ou duas). RLS que esconde tudo dá o mesmo 406 | `30-decisoes-e-licoes.md` D-052 |
| Todo `406` se resolve garantindo que a linha exista | ⛔ **Não.** Depende de zero linhas ser ausência ou estado legítimo. Em `memory` é ausência, e um trigger resolve; em `transactions` é conta vazia, e aí o certo é `maybeSingle` | `30-decisoes-e-licoes.md` D-052 |
| ⭐ `.limit(1).single()` pede uma linha | São intenções contrárias: `limit(1)` diz *no máximo uma*, `single()` diz *exatamente uma*. Onde os dois aparecem juntos, o errado é o `single()` | `30-decisoes-e-licoes.md` D-052 |
| ⭐ O ciclo existe para bater com a fatura do banco | A âncora é o **salário** — o mês de uma pessoa começa quando o dinheiro entra. A fatura só costuma cair perto | `30-decisoes-e-licoes.md` D-002 |
| ⭐ Tolerar “até um centavo” é escrever `Math.abs(a - b) < 0.01` | ⛔ **Não é.** 129,90 vs 129,91 dá 0.00999… e agrupa; 389,90 vs 389,91 dá 0.01000… e não agrupa. Dinheiro se compara em **centavos inteiros** (`src/lib/dinheiro.ts`) | `30-decisoes-e-licoes.md` D-056 |
| `/parcelas` deveria agrupar pelo nome do estabelecimento | Agrupar por nome foi a primeira versão e **falhava** — o nome muda entre faturas da mesma compra | `30-decisoes-e-licoes.md` D-008 |
| Gastos fixos entram nos balanços | ⚠️ **Não entram.** `fixos` é uma lista paralela, sem ligação com `transactions` | `02-paginas-do-balanco-geral.md` |
| Existem três agentes de IA | São **dois** — extrair e classificar compromisso —, e o de extração tem três portas de entrada (imagem, planilha, PDF). ⚠️ Era um só até 30/08 | `03-agentes-de-ia.md` |
| ⭐ A IA escolhe o `compromisso` no mesmo prompt em que extrai | Não. É o **agente 2**, numa segunda chamada, e o campo foi retirado do prompt de extração de propósito | `30-decisoes-e-licoes.md` D-034 |
| ⭐ A média por ciclo de um compromisso é comparável com o ciclo corrente | ⛔ **Não é.** `amortizadoObservado` inclui o ciclo corrente parcial no divisor, então ele contém o próprio termo da comparação. O ritmo usa uma referência que **exclui** o ciclo corrente | `30-decisoes-e-licoes.md` D-057 |
| O ciclo corrente pode ser comparado com os anteriores direto | Só **no mesmo ponto**: um ciclo pela metade contra ciclos inteiros diz sempre que você gastou menos | `30-decisoes-e-licoes.md` D-057 |
| ⭐⭐ Se cada regra reivindica sua transação, o total está certo | ⛔ A cascata precisa atravessar as **três camadas**. Ela parava dentro da detecção de fixos, e uma academia rotulada + aceita como fixo virava o dobro | `30-decisoes-e-licoes.md` D-033 |
| Gasto fixo se cadastra à mão em `/compromissos` | ⚠️ **Cadastra sim** — mas o campo pede o **nome exato do extrato**, porque é por ele que o fixo acha as próprias cobranças | `30-decisoes-e-licoes.md` D-045 |
| ⭐ A recorrência é detectada pelo nome que se repete | São **duas** regras: `nome + valor` primeiro e, sobre o que sobrou, `valor + dia` — que é a única capaz de pegar a cobrança cujo nome muda a cada mês | `30-decisoes-e-licoes.md` D-060 |
| A tolerância de ±2 dias compara cada cobrança com a anterior | ⛔ Compara todas com a **primeira do array**. Sem `order` na consulta, a âncora é a que o Postgres devolver primeiro | `30-decisoes-e-licoes.md` D-060 |
| Uma descrição de extrato é texto inofensivo | ⚠️ Um `ref 08/2026` vira **parcela 8 de 202**: o prompt extrai parcela do padrão `N/M` escrito na linha | `30-decisoes-e-licoes.md` D-060 |
| ⭐ O gasto fixo é identificado pelo `nome` | ⛔ Pela **assinatura**. `fixos.nome` guarda o apelido e é só rótulo — usá-lo como chave fez um fixo com 4 cobranças mostrar 1 | `30-decisoes-e-licoes.md` D-043 |
| ⭐ Um limiar só, 3, para tudo | São **dois critérios**: detectar exige 2, sobrescrever o usuário exige 3. Demorar a detectar subestima o comprometido | `30-decisoes-e-licoes.md` D-040 |
| Toda proposta de gasto fixo espera sua aprovação | Com 3+ ocorrências ela **entra sozinha**, com aviso. E excluir um fixo detectado registra recusa — senão ele voltaria | `30-decisoes-e-licoes.md` D-041 |
| Apontar uma transação como exemplo não muda nada nela | ⭐ **Rotula.** Exemplo implica rótulo, por trigger no banco. O contrário não vale | `30-decisoes-e-licoes.md` D-042 |
| Encerrar um gasto fixo é só arquivar | Ele **suprime a redetecção**, como a recusa. Aparece em "dispensados", com desfazer | `30-decisoes-e-licoes.md` D-044 |
| `/novos-registros` pede que você escolha o tipo de importação | ⚠️ **Duas portas**: Arquivo e Registro manual. A extensão escolhe o modo | `30-decisoes-e-licoes.md` D-046 |
| Planilha nunca traz parcela | ⚠️ **Traz**, desde 30/08 — mas só quando o padrão `N/M` está escrito na descrição da linha. Inferir de repetição continua proibido | `30-decisoes-e-licoes.md` D-048 |
| ⭐ Numa planilha, a data da linha parcelada é a data da cobrança | É lida como a data da **compra**: o servidor desloca cada parcela `atual − 1` meses para a frente | `20-pendencias-e-dividas.md` P36 |
| Escolher o compromisso na revisão só preenche um campo | Grava `compromisso_manual` junto — sem isso a escolha é sobrescrita na importação seguinte. E "Nenhum" também é declaração | `30-decisoes-e-licoes.md` D-049 |
| A planilha de exemplo é um arquivo do repositório | ⭐ É **gerada no clique**, com datas relativas a hoje. Arquivo fixo envelheceria e mostraria histórico morto | `30-decisoes-e-licoes.md` D-050 |
| ⭐ As categorias e os tipos de compromisso são semeados pela tela que os usa | ⛔ **Nascem com a conta**, no banco. Semear numa tela deixava o dado faltando para quem não a abrisse — e a entrada do app não é nenhuma das duas | `30-decisoes-e-licoes.md` D-053 |
| A lista das categorias padrão está no `Pendentes.tsx` | ⚠️ Está na migration `20260830240000`, dentro de `semear_conta`. O TypeScript não tem mais cópia | `30-decisoes-e-licoes.md` D-053 |
| São 27 categorias padrão, e nenhuma nasce como renda | ⚠️ São **28** desde 30/08, e `Salário` e `Outras Receitas` nascem marcadas. A nova é `Reembolsos`, que não é renda | `30-decisoes-e-licoes.md` D-051 |
| Um gasto fixo sem cobrança há ciclos ainda pede reserva | ⛔ **Não mais.** Ele saía em "deixe reservado" como "cai dia N" no mesmo card em que o app dizia que sumiu — e o valor entrava no total a guardar | `30-decisoes-e-licoes.md` D-058 |
| A demonstração termina no mês anterior | ⚠️ Desde 31/08 ela vai **até o dia 16 do mês corrente**, para o ritmo ter o que comparar e o card mostrar "já caiu" ao lado de "cai dia N" | `30-decisoes-e-licoes.md` D-058 |
| A evidência de um gasto fixo vem da coluna `fixos.evidencia` | Vem **derivada na hora**, de `lancamentosDoFixo`. A coluna é registro do que justificou o aceite, e envelhece | `30-decisoes-e-licoes.md` D-033 |
| Para trocar a cor do produto, edite o `tailwind.config.js` | ⭐ Edite **`src/index.css`** — é o único lugar onde uma cor de tema é escrita. O config só aponta para as variáveis | `30-decisoes-e-licoes.md` D-037, D-066 |
| `text-azul` é a cor do texto dentro da plataforma | ⚠️ É o **valor positivo**, em par com `text-danger`. O nome descrevia a tinta antiga; 16 dos 21 usos sempre foram número | `30-decisoes-e-licoes.md` D-066 |
| Verde é a cor de "positivo" no produto | ⛔ Era, no `#10b981`. Desde a paleta sálvia o fundo **e** o texto são verdes, então verde não sinaliza mais nada — positivo é **azul** | `30-decisoes-e-licoes.md` D-066 |
| O fundo do produto é branco e os cartões também | ⭐ A tela é **sálvia `#9BB08D`** e o cartão é **papel `#FBF8F2`** | `30-decisoes-e-licoes.md` D-066 |
| ⭐ `border-border` é a moldura do cartão | ⛔ É o **divisor** (`#C9D5C2`, 1,44:1) — linha de tabela, pastilha. A moldura é **`border-moldura`** (floresta, 10,62:1). Separar e desenhar são trabalhos diferentes | `30-decisoes-e-licoes.md` D-067 |
| ⭐ O prompt pede "use a data de hoje", então a IA usa hoje | ⛔ Um LLM **não tem relógio**. Sem a data interpolada ele completa o ano pelo treino — o sintoma era transação em **2020**. Prompt declara o presente, não o referencia | `30-decisoes-e-licoes.md` L-014 |
| As regras de data do prompt de extração valem nos três modos | ⚠️ Valiam **só em `planilha`** até 10/09. `imagem` e `pdf` são extrato impresso, que mostra "15/03" sem ano — o caso que mais precisava da regra era o que não a tinha | `30-decisoes-e-licoes.md` L-014 |
| `open_finance.tipo` e `transactions.tipo` guardam a mesma coisa | ⛔ **Mesmo nome, domínios diferentes**: `'BANK'`/`'CREDIT'` (conta, cru da Pluggy) × `'credito'`/`'debito'` (declaração do usuário). Copiar direto leva violação de CHECK | `30-decisoes-e-licoes.md` D-076 |
| Transação do Open Finance entra em `transactions` | ⚠️ Entra em **`public.open_finance`**, tabela-espelho. `transactions` não tem dedup nenhuma, e a travessia ainda não existe | `30-decisoes-e-licoes.md` D-076, P50 |
| ⭐ Os três eventos `transactions/*` da Pluggy têm o mesmo formato | ⛔ **Não têm.** Só `updated` e `deleted` mandam `transactionIds`; `created` manda contagem e instante, e exige paginar a API | `30-decisoes-e-licoes.md` L-015 |
| `valor` em `open_finance` é o `amount` da Pluggy | ⚠️ É o `amount` **com sinal aplicado** (saída negativa). Na Pluggy `amount` é sempre positivo e a direção vive em `type` | `30-decisoes-e-licoes.md` D-076 |
| O cartão é branco/papel | ⚠️ É **sálvia 500 `#849A76`** desde 10/09. O papel sobreviveu só no **campo** de formulário (`--papel-campo`) | `30-decisoes-e-licoes.md` D-069 |
| ⛔ Para destacar texto, use `text-primary` | ⛔ Laranja sobre o cartão é **1,02:1** e nenhum tom resolve. Ele só existe **preenchido** — `bg-primary` com branco, anel, trilho — e em **ícone** ao lado de rótulo | `30-decisoes-e-licoes.md` D-069 |
| Texto secundário se distingue do principal pelo tom | ⚠️ Não mais: 4,72:1 contra 4,92:1 é imperceptível. A hierarquia vem de **peso e tamanho** | `30-decisoes-e-licoes.md` D-069 |
| ⭐ Classe de componente pode ficar em `@layer utilities` | ⛔ Ali ela **vence** os utilitários do Tailwind por ordem e apaga em silêncio o `border-*` do `className`. Vai em `@layer components` | `30-decisoes-e-licoes.md` L-013 |
| A logo do produto é o ícone `LayoutDashboard` do lucide | ⚠️ É a **rosa dos ventos**, em `public/norteia-*.png`, desde 10/09. O lucide continua só como ícone de navegação | `30-decisoes-e-licoes.md` D-068 |
| Para escrever "NorteIA" numa tela, basta o texto | ⭐ Use **`<Marca />`** (`src/components/Marca.tsx`): o N e o IA são laranja, e o tom do laranja **muda com a superfície** | `30-decisoes-e-licoes.md` D-068 |
| A barra lateral é um painel branco à esquerda | ⚠️ É a **própria tela** desde 10/09: mesmo `bg-background` sálvia, sem sombra e sem fio. Não há fronteira barra↔conteúdo, e isso é a decisão, não um bug | `30-decisoes-e-licoes.md` D-067 |
| Para destacar algo na barra lateral, use laranja | ⛔ Laranja sobre sálvia é **1,28:1** como texto e 1,77:1 como bloco. Na barra o destaque é **bloco floresta com texto de papel**, e o laranja entra como fio de 3px | `30-decisoes-e-licoes.md` D-067 |
| Entrar leva ao `/dashboard` | Leva a `/compromissos` desde 30/08. ⚠️ São **dois** caminhos até lá: o redirect pós-login e o `redirectTo` do SSO | `30-decisoes-e-licoes.md` D-038 |
| O produto se chama Balanço Geral | Na **vitrine** é **"NorteIA"** desde 10/09. Repositório, banco e domínio continuam `balanco-geral` | `30-decisoes-e-licoes.md` D-065 |
| A vitrine se chama "Assistente Itaú" | ⚠️ Chamou-se, de 30/08 a 10/09. O nome saiu; a **paleta laranja do Itaú ficou**, agora sem nenhum aviso ao lado | `30-decisoes-e-licoes.md` D-065, P43 |
| O "ano" do Dashboard é de 1º de janeiro a 31 de dezembro | É um **ano de ciclos**: com ciclo 5, vai de 06/01 a 05/01 do ano seguinte. O total bate com a soma dos 12 ciclos do `/meses` | `02-paginas-do-balanco-geral.md` |
| ⭐ Duplicar uma regra é arriscado no dia em que se escreve | ⛔ É no dia em que **uma das cópias é corrigida**. As duas convivem idênticas por meses; quem conserta uma raramente sabe da outra | `30-decisoes-e-licoes.md` L-010 |
| O número de parcelas do Dashboard vem de `agruparParcelas` | ⚠️ **Vinha de uma cópia** que comparava valor como texto exato, e por isso partia cada compra em duas — R$ 11.065,97 onde eram R$ 3.238,82 | `30-decisoes-e-licoes.md` L-010 |
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
| ⭐⭐ Migrar o repositório no GitHub preserva a integração com o Supabase | ⛔ **Não preserva, e falha em SILÊNCIO.** Instalação de GitHub App se prende ao *id* do repositório, não ao nome — renomear o antigo e criar um novo com o mesmo nome deixa a integração apontando para o antigo. Em 2026-09-25 foi o que houve: o push funcionava, a Vercel publicava o front, e a Edge Function ficava na versão anterior sem aviso em lugar nenhum. Sintoma mediúvel: `0` em `/check-runs`, `/status` **e** `/deployments` do commit. Reconectada no mesmo dia | este arquivo |
| ⭐ A integração Supabase↔GitHub cobre só migrations | **Cobre Edge Function também.** Medido em 2026-09-25: o push de `7ce38e8` deixou o check `Supabase Preview`, e o carimbo `VERSAO` da `pluggy-webhook` virou ~**180 s** depois. `functions deploy` à mão deixou de ser necessário — mas o carimbo continua sendo o único jeito de **confirmar** que pegou | este arquivo |
| ⚠️ Se o push subiu, front e Edge Function estão na mesma versão | São **dois sistemas independentes** — Vercel de um lado, integração Supabase do outro — e cada um falha sozinho. Por isso mudança de contrato entre os dois é par indivisível: **ponte de compatibilidade, nunca janela** | este arquivo |
| O `version` que o painel mostra prova que o código novo subiu | ⚠️ Não prova: ele sobe também quando só um **secret** muda. E mudança interna (uma guarda, um escopo de `delete`) não altera nada visível de fora. Por isso `pluggy-webhook` carimba `VERSAO` na resposta 200 — conferir é um `curl` | `supabase/functions/pluggy-webhook/index.ts` |
