---
status: vigente
atualizado_em: 2026-08-27
---

# Glossário

> **O que este arquivo é:** o significado de cada termo interno, em uma ou duas frases.
> ⭐ **Por que existe:** três pares de termos deste projeto são ativamente confundíveis e estão
> marcados com ⚠️. Errar um deles produz número errado, não bug visível.

---

## Tempo

**Ciclo (`ciclo_dia`)** · o dia do mês em que a sua fatura fecha. Padrão **5**, e o Postgres exige
`0 < ciclo_dia < 28` — acima de 27 o ciclo não existiria em fevereiro. Fica em `memory.ciclo_dia`,
um por usuário, editável em `/perfil`. É o número de maior alcance do sistema:
mudá-lo reagrupa todo o `/meses` retroativamente.

**Ciclo de fatura** · o intervalo que o `ciclo_dia` define. Com ciclo 5, a fatura de Janeiro vai do
dia **6 de Janeiro** ao dia **5 de Fevereiro**, inclusive.

⭐ O nome diz "fatura", mas a âncora é o **salário**: o mês de uma pessoa começa quando o dinheiro
entra, e o fechamento da fatura costuma cair perto disso. Um número único (`ciclo_dia`) cobre os
dois eventos. Ver `30-decisoes-e-licoes.md` D-002.

⚠️ **`data` × `mes_fatura`** · `data` é *quando a compra aconteceu*; `mes_fatura` é *em qual balanço
ela cai*. São diferentes na virada do ciclo: uma compra em `2026-02-03` tem `mes_fatura = "Janeiro"`.
Quando `mes_fatura` está preenchido, ele **manda** sobre o cálculo por `ciclo_dia` em `/meses`.

**Meses ativos** · no Dashboard, a contagem de meses distintos (`YYYY-MM` de `data`) com pelo menos
uma transação no ano. Usado como denominador de média.

---

## Transações

⚠️ **Pendente (rascunho)** · `transactions.pendente = true`. É o que a IA acabou de extrair e você
ainda não revisou. **Nenhuma tela de balanço lê rascunho** — Dashboard, Meses, Parcelas e Histórico
filtram `pendente = false`. "Pendente" **não** significa "conta a pagar".

⚠️ **`nome` × `apelido`** · `nome` é o texto bruto do extrato (`PGTO MERCADOLIVRE *OSASCO`);
`apelido` é a versão limpa gerada pela IA (`Mercado Livre`). A interface mostra o apelido e guarda o
nome como legenda — é o nome bruto que serve de matéria-prima para a classificação automática
planejada em `10-proximos-passos.md`.

**Valor** · um único campo assinado: **positivo é entrada, negativo é saída**. Não há coluna de
tipo nem de débito/crédito.

**Banco** · enum fechado no prompt, alimentado por `BANCOS` em `src/lib/ia.ts`: os vinte bancos mais
usados no Brasil (incluindo os digitais), mais `Outros` e `null` para quando o print não permite
deduzir. A interface do extrato quase sempre identifica a instituição — uma lista curta demais
empurraria tudo para `Outros`.

⚠️ **Fixo × Parcela** · **fixo** é uma despesa recorrente sem fim previsto (aluguel, assinatura),
cadastrada à mão na tabela `fixos` e **hoje desconectada dos balanços**. **Parcela** é uma compra
única dividida no tempo, que vive em `transactions` com `parcela_atual`/`parcela_total`.

**Grupo de parcelas** · em `/parcelas`, o conjunto de transações reconhecidas como a mesma compra:
mesmo valor absoluto, mesmo `parcela_total` e dia de cobrança dentro de ±2 dias.

**Em andamento × Concluída** · um grupo está concluído quando o número de parcelas já registradas
alcança o `parcela_total`. Antes disso, está em andamento.

---

## Banco de dados

**`transactions`** · a tabela central. Uma linha por lançamento, sempre com `user_id`.

**`categories`** · categorias **do usuário** (nome + cor). 27 são semeadas no primeiro acesso.

**`cores`** · ⭐ paleta **global**, sem `user_id`. É a lista de cores oferecida no seletor do
`/perfil`; não pertence a ninguém.

**`fixos`** · despesas recorrentes: nome, valor e dia opcional.

⚠️ **`memory`** · **não é memória da IA.** É a linha de configuração e anotações do usuário: guarda
`ciclo_dia` (o ciclo) e `content` (o campo de Notas do Dashboard). Um registro por usuário — daí o
`.single()` e o tratamento do erro `PGRST116` (zero linhas) espalhado por cinco páginas.

**`profiles`** · uma linha por conta (`id`, `email`), criada automaticamente pelo trigger
`handle_new_user` a cada cadastro no `auth.users`. Serve de gatilho para o e-mail de boas-vindas da
Edge Function `send-email`. Nenhuma tela lê esta tabela.

**`leads`** · contatos capturados pelo formulário da landing page. Única tabela escrita sem
autenticação.

**`PGRST116`** · código do PostgREST para "`.single()` não achou linha". No código deste projeto é
tratado como caso normal (usuário novo ainda sem `memory`), não como erro.
