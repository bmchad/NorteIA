---
status: vigente
atualizado_em: 2026-09-03
---

# As páginas do Balanço Geral

> **O que este arquivo é:** o que cada tela faz, o que ela lê e escreve, e a regra não óbvia de
> cada uma.
> **O que este arquivo NÃO é:** o pipeline de IA em detalhe (é `03-agentes-de-ia.md`) nem a lista
> de defeitos de cada tela (é `20-pendencias-e-dividas.md`).

Rotas e proteção vivem em `src/App.tsx`; o menu lateral, em `src/components/Layout.tsx`.
**Toda rota exceto `/` e `/login` exige sessão** e redireciona para `/login` sem ela.

⭐ **A entrada é `/compromissos`**, e a ordem do menu é a da pergunta que o produto responde
(D-038): `Compromissos · Mercado de Datas · Dashboard Anual · Balanços Mensais · Novos Registros · Histórico`. A
constante `ENTRADA` vive em `src/lib/rotas.ts` — ⚠️ **dois** lugares dependem dela, o redirect
pós-login e o `redirectTo` do SSO.

---

## `/` · Home — landing pública

`src/pages/Home.tsx` · escreve em `leads`

Página institucional aberta ao público: hero, FAQ em acordeão e um formulário de contato (nome,
e-mail, telefone) que insere em `leads`. Um webhook do Supabase dispara a Edge Function `send-email`
a cada novo lead.

⭐ É a única tela do sistema que grava sem usuário autenticado.

⭐ **A vitrine se chama "Assistente Itaú"** e usa a paleta do banco — é protótipo do InovaCamp WI.
⛔ O rodapé **precisa** continuar dizendo que não é produto oficial: a página usa o nome e a cor do
Itaú, e sem isso ela se passa por oficial. → D-039

⚠️ **A seção "Onde Estamos" não existe mais** — endereço, mapa e item de menu saíram em 30/08.
Protótipo de hackathon não tem sede.

O gráfico animado de fundo é `src/components/GraficoDecorativo.tsx`, com `currentColor`: a cor vem
do token, não de literais no SVG. → D-037

---

## `/login` · Auth

`src/pages/Auth.tsx` · Supabase Auth com **Google**

⭐ **Não há e-mail e senha.** A tela tem um botão só, `signInWithOAuth` com o provedor Google. Quem
não tem conta Google não entra. → `30-decisoes-e-licoes.md` D-023

Não existe cadastro separado: o primeiro login cria a conta, e o trigger `handle_new_user` insere a
linha em `profiles`, que dispara o e-mail de boas-vindas. Havendo sessão, a tela redireciona para
**`ENTRADA`** (`/compromissos`); a sessão é observada em `App.tsx` por `onAuthStateChange`.

⚠️ **Tem um "Voltar" para a landing.** Sem ele o login é um beco: quem chega por engano só sai pelo
botão do navegador, e num app instalado como PWA nem isso existe.

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

`src/pages/Pendentes.tsx` · escreve `transactions`, lê `categories` e `compromissos`

⭐ **Duas portas: Arquivo e Registro manual.** A extensão do arquivo escolhe o modo — print, PDF e
planilha entram pelo mesmo lugar. ⚠️ **Um tipo por vez**: um envio carrega um `modo`, e o `modo`
escolhe um prompt (D-046). Depois vem a revisão dos rascunhos. ⚠️ **Correção de 30/08: esta tela
não semeia mais as categorias.** Elas nascem com a conta, no banco. → D-053

⭐⭐ **Antes de escolher o arquivo, o envio diz de onde o dinheiro sai:** um toggle *Débito em conta*
(padrão) / *Cartão de crédito*, que grava `transactions.tipo` em **todas** as linhas do lote. É por
envio porque um extrato *é* a conta corrente e uma fatura *é* o cartão — o documento tem um
instrumento só, e quem enviou sabe qual. ⛔ **O agente 1 não devolve este campo**, e não pode passar a
devolver: seriam dois escritores para a mesma coluna. → D-061

⭐ **Na revisão, o rascunho tem cinco campos**, e o quinto é **Compromisso**, ao lado de Categoria.
Escolher ali grava `compromisso_manual` junto: é declaração, não palpite, e nada automático a
sobrescreve. → D-049

⭐ **A tela de escolha oferece uma planilha de exemplo**, montada no clique com datas relativas a
hoje — seis meses roteirizados para que cada camada do `/compromissos` tenha o que mostrar. → D-050

⭐ **O convite tem dois pesos, e a conta decide qual:** faixa laranja em destaque enquanto não há
transação nenhuma — sem arquivo, as duas portas não levam a lugar nenhum — e link discreto depois
da primeira importação.

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

⭐⭐ **A cascata atravessa as três camadas, não só as regras de detecção** (D-033):

```
0. compromisso_manual  →  você declarou
1. parcela             →  Contratado
2. fixo ativo          →  Recorrente
3. rótulo de tipo      →  Previsível fica com o resto
```

**Três abas, com o nome das três camadas** — e ⭐ **o card do topo É o botão da aba**: três cards e,
logo abaixo, três abas repetindo os mesmos nomes seria o mesmo controle duas vezes. O total do ciclo
tem caixa própria, acima delas.

| Aba | O que tem |
|---|---|
| **Contratado** | comprometido restante, projeção de 6 ciclos, cards de compra com progresso e histórico, e a seção *Quitadas* — ⚠️ que não entra em total nenhum |
| **Recorrente** | ⭐ o card **"deixe reservado"** (o que ainda cai neste ciclo, com data e nome), ativos, propostas, dispensados, e o cadastro manual — que pede o **nome exato do extrato** (D-045, D-047). ⭐ A lista de ativos vem ordenada: **o que ainda vai cair primeiro**, do mais próximo ao mais distante |
| **Previsível** | tipos detectados, com acrescentar/remover transação e o botão que leva ao `/perfil`. ⭐ Cada card diz **onde você está neste ciclo** — o gasto até hoje contra o normal para o mesmo dia do ciclo (D-057) |

**Propostas** têm três naturezas: *criar*, *corrigir* (casa com um fixo mas o valor ou o dia
divergem) e *encerrar* (sem lançamento há dois ciclos além da periodicidade). Cada uma mostra os
lançamentos que a geraram — proposta que não se explica não é aceita nem revista.

⭐ **O aviso de encerramento mora no card do fixo que parou**, não numa lista à parte, e diz o fato
(`sem cobrança há 2 ciclos`) em vez do veredito. Quem conclui é o usuário, no botão ao lado.

⭐ **Os lançamentos de um fixo ativo são derivados na hora** (`lancamentosDoFixo`), não lidos da
coluna `fixos.evidencia`: uma cobrança nova aparece sozinha, sem escrita no banco. A mesma função
diz quais transações a camada Previsível **não** pode contar.

**Recusar é para sempre**, com assinaturas separadas para criação e correção — e há uma seção
recolhida no fim da aba Recorrente para desfazer. → L-006

⚠️ **`fixos` é consultativa.** Aceitar não lança transação: um fixo que se auto-lança duplica em
silêncio quando o lançamento real chega pelo extrato.

## ⭐ `/mercado-de-datas` · Mercado de Datas

`src/pages/MercadoDeDatas.tsx` · lê `transactions`, `fixos`, `categories`, `vencimentos` e `memory`
· cálculo em `src/lib/folga.ts`

⭐⭐ **A pergunta desta tela não é "você gasta demais?".** É a outra: *dado que sobra dinheiro no mês,
por que falta no dia 3?* A resposta quase sempre é a mesma — o salário cai no dia 8 e os débitos
automáticos caem no dia 3. Ninguém precisa ganhar mais nem gastar menos: basta **uma data mudar**.
→ D-062

**O gráfico** é uma curva de folga por dia do ciclo, com o **zero** como fronteira. Sobre ela, um
marcador por cobrança, no dia exato em que ela cai:

⭐ **Um marcador por DIA, não por cobrança.** Duas linhas de referência no mesmo `x` seriam duas
linhas idênticas sobrepostas; dia com mais de uma cobrança mostra a contagem (`3 cobranças`), e os
nomes completos ficam na lista abaixo do gráfico. O gráfico diz **quando** e **quanto**; a lista diz
**o quê**.

| marcador | o quê |
|---|---|
| vermelho | débito em conta — o único que entra no mercado |
| laranja | a fatura de um banco: compras no cartão **e parcelas**, somadas num débito só, no vencimento → D-062, D-063 |
| verde | a renda, como **degrau** no dia do salário |
| faixa sombreada | a janela de déficit, do primeiro dia negativo até a folga voltar |

⭐ **A curva e os marcadores dizem a mesma coisa duas vezes, de propósito:** o degrau *é* o débito, e
o marcador é quem diz de quem ele é. Sem ele a pessoa vê uma queda e não sabe a que atribuí-la.

⚠️ **O eixo mostra a DATA, não o índice do dia do ciclo.** Com `ciclo_dia = 10`, o dia 1 do ciclo é o
dia 11 do mês — quem configurou "a fatura vence dia 10" e visse o marcador em "9" leria um erro que
não existe. Calcula-se em dia de ciclo; exibe-se em data.

**A sugestão** move **uma** cobrança de cada vez, escolhendo a **menor** que resolve e o **dia mais
cedo** que funciona, e lista os outros dias que também serviriam — se o recebedor recusar o primeiro,
a alternativa já está pronta. Quando nenhuma mudança sozinha fecha o buraco, a tela diz isso em vez
de fingir que fecha, e oferece o maior alívio possível.

⛔ **Só `tipo = 'debito'` é negociável**, e a tela explica por quê: débito em conta vira multa no dia
seguinte, cobrança de cartão não vira nada — ela só espera a fatura. → D-061

**Três estados em que a tela não desenha curva**, e em todos ela diz o que falta em vez de mostrar
palpite: sem categoria marcada como renda, com menos de 3 ciclos fechados, e — parcialmente — cartão
de banco sem vencimento configurado, caso em que o valor que ficou de fora aparece com link para o
`/perfil`.

⭐ **A camada Contratado entra pela fatura**, não como evento próprio: parcelamento é coisa de
cartão, e é no vencimento que o dinheiro sai. ⚠️ Vale mesmo quando a linha está marcada como
`tipo = 'debito'` — o que é o caso de todo o histórico, anterior ao toggle. → D-062

🔶 **É demo até a metade.** A análise existe; o "mercado" — ofertar a data ao recebedor — não, e
exigiria uma API de alteração de vencimento que ninguém expõe. O front sugere, e para aí.

---

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

`src/pages/Perfil.tsx` · lê e escreve `categories`, `vocabulario`, `compromissos`, `memory` e `vencimentos`

⭐ **É o dono da configuração** (D-029): aqui se define **o que existe**; a tela de operação trabalha
com **o que foi encontrado**. Cinco seções:

**Categorias** · duas listas lado a lado, **Renda** e **Gasto**, e mover entre elas é arrastar (com
uma seta discreta como alternativa, porque arrastar não existe em tela de toque). O lado se escolhe
na criação. ⚠️ Só as de renda entram no divisor de "% da renda" do Dashboard → D-025

**Vocabulário** · o que só o usuário sabe. **Regras** (`nome contém X` → categoria) rodam no código,
sem token; **notas** vão ao prompt. → D-030

**Compromissos** · os tipos que a IA reconhece, ⭐ **semeados no cadastro** (no banco, não aqui —
D-053) e editáveis. Cada um tem
uma periodicidade em **texto livre** — pista para a IA, nenhum código a interpreta — e um valor, que
⚠️ **entra na camada Previsível do painel**. Teto de 25.

⭐ Ao editar um tipo, dá para apontar **até 10 transações de exemplo** (`compromisso_exemplos`), numa
lista rolável do histórico — as escolhidas ficam no topo e clicar de novo desmarca. Elas vão ao
prompt do agente que classifica compromisso. ⛔ O teto é imposto por **trigger no banco**, não só no
front. → D-035

**Ciclos** · o `ciclo_dia`, o campo de maior alcance do sistema.

**Vencimento das faturas** · o dia em que a fatura de cada banco vence, um por banco. ⚠️⚠️ **Não é
o `ciclo_dia`:** aquele é o FECHAMENTO, e mexer nele muda a unidade de tempo do produto inteiro;
este é o VENCIMENTO, e só muda a posição de um débito dentro do ciclo. ⭐ A lista de bancos sai das
próprias transações, não de uma cópia do enum de `bancos.ts`. Campo vazio **apaga** a linha, e o
cartão fica fora da curva do Mercado de Datas — chutar um dia seria um aviso falso. → D-063
