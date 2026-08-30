---
status: vigente
atualizado_em: 2026-08-30
---

# O que é o Balanço Geral

> **O que este arquivo é:** o produto em uma leitura — para que serve, como funciona ponta a ponta,
> e o que ele deliberadamente não faz.
> **O que este arquivo NÃO é:** o roadmap (é `10-proximos-passos.md`), nem o que ele quer ser
> (é `11-ambicao-de-produto.md`), nem o manual de operação (é o `CLAUDE.md` da raiz).

---

## ⭐⭐ Para que serve

> **O Balanço Geral identifica quanto você está comprometido a pagar, mostra o que sobra, e só então
> vira consulta de como você gasta.**

A ordem importa e é o que organiza o produto inteiro:

```
comprometido  →  o que sobra  →  como você gasta o que sobra
```

⚠️ **Dois nomes, um produto.** Desde 30/08 a **vitrine** — landing, login e cabeçalho — se chama
**Assistente Itaú**, protótipo do InovaCamp WI, com a paleta do banco e um aviso de que não é
produto oficial. Repositório, banco de dados e domínio continuam `balanco-geral`, e é assim que este
`context/` se refere ao produto. → D-039

⚠️ **Isto mudou em 2026-08-29** (D-027). Por muito tempo o objetivo parecia ser *extrair PDF,
categorizar por IA e consultar gasto por categoria*. Isso é **meio, não fim** — e enquanto era
tratado como fim, o produto entregava um relatório do passado em vez de uma decisão sobre o presente.

⭐ **O que muda na prática:** a pergunta que o produto responde deixa de ser *"quanto gastei com
comida?"* e passa a ser *"quanto do meu dinheiro já tem dono antes de eu decidir qualquer coisa?"*.
A primeira é curiosidade; a segunda muda o que a pessoa faz hoje.

---

## Em um parágrafo

Sistema de controle financeiro pessoal cujo diferencial é **não exigir digitação**. Você manda um
print do extrato, uma planilha do banco ou o PDF da fatura, e a IA extrai as transações — data,
estabelecimento, valor, parcela, banco e uma sugestão de categoria. Nada vira registro
automaticamente: entra como **rascunho**, você revisa, e só então conta nos balanços. A unidade de
tempo é o **ciclo**, não o mês do calendário.

---

## As cinco ideias que estruturam o produto

**⭐ O comprometido vem antes do gasto.** Parcelas em andamento e despesas recorrentes são dinheiro
que já tem dono. Saber quanto é isso, e quando alivia, é a informação que permite decidir — e é o
que a tela `/compromissos` existe para reunir. → `10-proximos-passos.md`

**⭐ Certeza tem camadas, e misturá-las é mentir.** Um mesmo total esconde coisas muito diferentes:

| Camada | O que é | Dá para cancelar? |
|---|---|---|
| **Contratado** | Parcela. Você deve, e tem data de fim | Não |
| **Recorrente** | Assinatura, mensalidade. Contrato provável | Sim, amanhã |
| **Previsível** | Mercado, combustível. Você **vai** gastar | Sim, mas não vai deixar de comer |

**A unidade de tempo é o ciclo.** O mês de uma pessoa começa quando o dinheiro entra, não no dia 1º.
Um número só, o `ciclo_dia`, define isso — e serve tanto para quem tem salário em data fixa quanto
para quem não tem, bastando pô-lo em 1. → D-002

**A IA sugere, você decide.** Tudo que a extração produz entra como rascunho, porque um erro que
entra em silêncio contamina o total do ciclo, a categoria e o resultado do ano de uma vez. → D-001

**O sistema aprende com a sua correção.** Confirmada a mesma categoria três vezes para o mesmo
estabelecimento, ele passa a acertar sozinho — sem IA, sem custo, e ficando mais certo com o tempo.
→ D-013

---

## Como funciona ponta a ponta

1. **Entrada.** Em `/novos-registros`, um ou mais prints, uma planilha `.xlsx` ou um PDF. Cabe uma
   instrução em texto livre junto.
2. **Extração.** A Edge Function `ai-agents` chama o modelo, que devolve as transações estruturadas
   com categoria sugerida. Detalhe em `03-agentes-de-ia.md`.
3. **Memória e limpeza.** O que você já ensinou vence o palpite do modelo (D-013), e pares de compra
   e estorno que se anulam são descartados com aviso (D-026).
4. **Rascunho.** Tudo entra em `transactions` com `pendente: true`. ⭐ **Nenhuma tela de balanço lê
   rascunho.**
5. **Revisão.** Você confirma, corrige ou descarta.
6. **Leitura.** Balanço por ciclo (`/meses`), por ano (`/dashboard`), por compra parcelada
   (`/parcelas`) e a tabela crua (`/historico`).

---

## O que ele deliberadamente NÃO faz

- **Não se conecta ao banco.** Sem Open Finance, sem scraping, sem credencial guardada. A entrada é
  sempre um arquivo que você exportou.
- **Não calcula com IA.** O modelo extrai e classifica; toda soma, agrupamento e projeção é código.
- **Não lança nada sozinho.** Nem a IA, nem gasto fixo aceito: um lançamento automático duplica em
  silêncio quando o real chega pelo extrato.
- **Não é multiusuário no sentido de time.** Sem conta compartilhada, sem papel de administrador,
  sem visão de família. → D-021
- **Não tem app nativo.** É um site; no celular funciona pelo navegador.

---

## ⭐ É um produto horizontal

Feito para muitas pessoas, não para um perfil de gasto. Consequência prática para quem for desenhar
algo aqui: **decisão de produto se justifica por argumento estrutural** — o que é previsível para
pessoas em geral, o que a arquitetura garante — e não pela frequência de algo no histórico de um
usuário. Medir sobre uma base real serve para **verificar implementação**, nunca para definir escopo.

---

## Stack, em uma linha

React 19 + TypeScript + Vite + Tailwind no front · Supabase (Auth + Postgres) · Gemini via Edge
Function `ai-agents` · Vercel. Operação e armadilhas no `CLAUDE.md` da raiz.
