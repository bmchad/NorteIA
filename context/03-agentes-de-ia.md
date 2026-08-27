---
status: vigente
atualizado_em: 2026-08-27
---

# Os agentes de IA — o pipeline de extração

> **O que este arquivo é:** como um arquivo enviado por você vira uma linha em `transactions`.
> **O que este arquivo NÃO é:** a lista de defeitos do pipeline (é `20-pendencias-e-dividas.md`)
> nem o porquê das escolhas (é `30-decisoes-e-licoes.md`).

Tudo isto vive em `src/pages/Pendentes.tsx`.

---

## A forma geral

> ⭐ **Não existem três agentes. Existe um agente com três portas de entrada.**

| Porta | Como o conteúdo chega ao modelo | Função |
|---|---|---|
| **Imagem / print** | `FileReader` → base64 → `inlineData` (multimodal, aceita N imagens de uma vez) | `processImage` |
| **Planilha `.xlsx`** | `xlsx` lê o arquivo → **primeira aba** → `sheet_to_csv` → CSV como texto | `processSpreadsheet` |
| **PDF** | base64 → `inlineData` com `mimeType: application/pdf` | `processDocument` |

As três chamam **`MODELO.RAPIDO`** (`gemini-3.5-flash`) pelo SDK `@google/generative-ai`. O id do
modelo vive em `src/lib/ia.ts`, nunca escrito à mão dentro do prompt — ver `30-decisoes-e-licoes.md`
D-010.

⚠️ A chamada sai **direto do browser**, com a chave `VITE_GEMINI_API_KEY`, o que a expõe. Isso está
decidido como errado e será migrado para uma Edge Function — ver `20-pendencias-e-dividas.md` P1 e
`30-decisoes-e-licoes.md` D-005.

---

## O contrato de saída

O prompt pede **apenas** um array JSON, um objeto por transação:

| Campo | Regra |
|---|---|
| `data` | `YYYY-MM-DD` |
| `nome` | o texto **na íntegra** do extrato (`PGTO MERCADOLIVRE *OSASCO`) |
| `apelido` | versão limpa e curta, deduzida do nome (`Mercado Livre`) |
| `valor` | número; **positivo = entrada, negativo = saída** |
| `banco` | enum fechado com os 20 bancos de `BANCOS` (`src/lib/ia.ts`), `"Outros"` ou `null`. Planilha sempre `null` |
| `mes_fatura` | nome do mês em português, capitalizado, ou `null` |
| `hora` | `HH:MM:SS`; padrão `12:00:00` quando não visível |
| `parcela_atual` / `parcela_total` | de `"3 de 10"` → `3` e `10`; `null` fora de parcelamento. Planilha sempre `null` |
| `categoria_sugerida` | ⭐ **obrigatoriamente** um nome da lista do usuário, injetada no prompt. `null` para entradas |

**Duas regras críticas que o prompt impõe:**
1. Transação sem data **ou** sem nome **ou** sem valor claro é **ignorada por inteiro** — nunca
   registrada pela metade.
2. Resposta sem markdown, JSON puro, e `categoria_sugerida` textualmente idêntica a uma opção.

Na porta da planilha há uma regra a mais: se o nome vier vazio, o modelo usa o **nome da categoria**
como `nome` e `apelido` (ou `"Outros"`).

---

## A regra do ciclo, interpolada no prompt

O prompt não recebe "o ciclo é 5". Ele recebe a regra já escrita com o número:

> A fatura de um mês M engloba as transações do dia `ciclo_dia + 1` de M até o dia `ciclo_dia` do
> mês seguinte, inclusive.

`ciclo_dia` vem de `memory.ciclo_dia` (padrão **5**). É por isso que mudar o ciclo no `/perfil`
muda o que a IA extrai a partir dali — e **não** muda o que já foi extraído.

---

## O que acontece depois da resposta (tudo em JavaScript)

1. **Recorte do JSON** — a resposta é cortada entre o primeiro `[` e o último `]`. Se não achar os
   dois, lança "A IA não retornou um formato JSON válido". ⚠️ Frágil, ver pendências.
2. **Deslocamento de parcela** — se há `parcela_atual` e `parcela_total`, a data é movida para
   `mês da compra + (parcela_atual − 1)`. Uma compra de Janeiro na parcela 3 é registrada em Março.
3. **Casamento de categoria** — `categoria_sugerida` é comparada com `categories` por nome,
   *case-insensitive*. Não casou → `categoria_id: null`.
4. **Insert** — tudo entra em `transactions` com **`pendente: true`**.

> ⭐ **A IA nunca escreve um registro definitivo.** O passo 4 é o limite dela. Ver
> `30-decisoes-e-licoes.md` D-001.

---

## Instrução extra do usuário

Cada porta tem um campo de texto livre. O que você escrever é **concatenado ao fim do prompt** sob
o cabeçalho `INSTRUÇÕES ADICIONAIS DO USUÁRIO`. Serve para casos pontuais ("esse extrato é de
2024", "ignore as linhas de estorno").

---

## As 27 categorias padrão

Na primeira vez que o usuário abre `/novos-registros`, se `categories` estiver vazia, o sistema
semeia 27 categorias com cor (Aluguel, Farmácia, Educação, Supermercado, Uber/99, Streaming,
Salário, Apostas/Loteria…). A lista literal está em `seedDefaultCategories`, em `Pendentes.tsx`.

⚠️ **Essa lista é o vocabulário da IA.** Apagar uma categoria remove a opção do prompt; criar uma
nova a disponibiliza na próxima extração.

---

## Tratamento de erro, hoje

Qualquer falha (rede, 503 do Gemini, JSON inválido, erro do Supabase) cai num `catch` que dá
`console.error` e um `alert()` com a mensagem crua. Não há retry, backoff nem estado de erro na
interface. → `20-pendencias-e-dividas.md`
