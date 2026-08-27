---
status: vigente
atualizado_em: 2026-08-27
---

# O que é o Balanço Geral

> **O que este arquivo é:** o produto em uma leitura — o que faz, para quem, como funciona ponta a
> ponta, e o que ele deliberadamente não faz.
> **O que este arquivo NÃO é:** o roadmap (é `10-proximos-passos.md`), nem o que ele quer ser
> (é `11-ambicao-de-produto.md`), nem o manual de operação (é o `CLAUDE.md` da raiz).

---

## Em um parágrafo

O Balanço Geral é um sistema de controle financeiro pessoal cujo diferencial é **não exigir
digitação**. Você tira um print do extrato, exporta a planilha do banco ou baixa o PDF da fatura, e
a IA extrai as transações — data, estabelecimento, valor, parcela, banco e uma **sugestão de
categoria**. Nada disso vira registro automaticamente: entra como **rascunho**, você revisa, e só
então passa a contar nos balanços. A unidade de tempo do sistema é o **ciclo de fatura**, não o mês
do calendário.

---

## O problema que ele resolve

Controle financeiro manual em planilha morre por atrito: dezenas de linhas por mês, cada uma
exigindo copiar data, nome e valor de um app de banco. O Balanço Geral corta o atrito da **entrada
de dados**, que é onde o hábito quebra — e não o da análise, onde as ferramentas de mercado
concentram esforço.

---

## Como funciona ponta a ponta

1. **Entrada.** Em `/novos-registros` você envia um ou mais prints, uma planilha (`.xlsx`) ou um
   PDF. Pode acrescentar uma instrução em texto livre que é anexada ao prompt.
2. **Extração.** O Gemini devolve um array JSON de transações, escolhendo a categoria dentro da
   **sua** lista de categorias (que vai injetada no prompt). Detalhe em `03-agentes-de-ia.md`.
3. **Rascunho.** Tudo entra em `transactions` com `pendente: true`. ⭐ **Nenhuma tela de balanço lê
   rascunho** — todas filtram `pendente = false`.
4. **Revisão.** Você confirma, corrige ou descarta cada linha. Ao confirmar, ela vira registro.
5. **Leitura.** Os balanços agrupam por ciclo de fatura (`/meses`), por ano (`/dashboard`), por
   compra parcelada (`/parcelas`) ou em tabela crua (`/historico`).

---

## As quatro ideias que estruturam o produto

**O ciclo de fatura é a unidade de tempo.** Uma compra do dia 2 de Fevereiro pertence ao balanço de
*Janeiro* se o seu ciclo fecha no dia 5. É isso que faz o número bater com a fatura que o banco
cobra. → `04-glossario.md`

**A IA sugere, você decide.** O rascunho existe porque extração de imagem erra — e um erro que
entra silenciosamente no histórico contamina todos os balanços seguintes. → `30-decisoes-e-licoes.md`
D-001.

**Categorias são suas, não do sistema.** Na primeira vez que você abre o app, 27 categorias são
criadas na sua conta com cor. A partir daí você renomeia, recolore e apaga à vontade — e o prompt
da IA passa a usar a sua lista.

**Parcelamento é projeção, não histórico.** Uma compra em 10x não gera 10 registros; cada parcela é
registrada quando aparece na fatura, com a data deslocada para o mês em que ela cai.
→ `30-decisoes-e-licoes.md` D-003.

---

## O que ele deliberadamente NÃO faz

- **Não se conecta ao banco.** Não há Open Finance, não há scraping, não há credencial de banco
  guardada. A entrada é sempre um arquivo que você exportou. (Open Finance está em
  `10-proximos-passos.md` como ideia, não como plano.)
- **Não calcula nada dentro da IA.** A IA extrai e classifica; toda soma, agrupamento e projeção é
  JavaScript. 🔶
- **Não é multiusuário no sentido de time.** Não há conta compartilhada, papel de administrador nem
  visão de família.
- **Não tem app nativo.** É um site React; no celular funciona pelo navegador.

---

## Stack, em uma linha

React 19 + TypeScript + Vite + Tailwind no front · Supabase (Auth + Postgres) como banco · Gemini
para extração · Vercel para deploy. Os detalhes operacionais estão no `CLAUDE.md` da raiz.
