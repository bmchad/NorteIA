---
status: vigente
atualizado_em: 2026-08-27
---

# Os agentes de IA — a Edge Function `ai-agents`

> **O que este arquivo é:** como um arquivo enviado por você vira uma linha em `transactions`.
> **O que este arquivo NÃO é:** a lista de defeitos do pipeline (é `20-pendencias-e-dividas.md`)
> nem o porquê das escolhas (é `30-decisoes-e-licoes.md`).

⭐ **Nenhuma tela fala com o Gemini.** Desde 2026-08-27 toda chamada de agente passa pela Edge
Function `ai-agents`, onde a chave vive como secret do servidor. O browser só sabe pedir um agente
pelo nome. → `30-decisoes-e-licoes.md` D-005 e D-012.

---

## O caminho, ponta a ponta

```
/novos-registros  →  ai-agents (Deno, no Supabase)  →  Gemini
       ↑                        ↓
       └──── transações normalizadas, prontas para insert
```

O browser lê o arquivo, manda para a função e recebe as linhas prontas. **Quem insere em
`transactions` é o browser**, com a própria sessão, para que a escrita continue passando pela RLS do
usuário — a função nunca precisa da service role.

---

## A forma geral

> ⭐ **Não existem três agentes. Existe um agente com três portas de entrada.**

| Porta | Como o conteúdo chega ao modelo |
|---|---|
| **Imagem / print** | base64 → `inlineData` (multimodal, aceita N imagens de uma vez) |
| **Planilha `.xlsx`** | ⚠️ lida **no browser** com `xlsx` → `sheet_to_csv` → o CSV viaja como texto |
| **PDF** | base64 → `inlineData` com `mimeType: application/pdf` |

A planilha continua sendo parseada no cliente porque converter `xlsx` em CSV não é chamada de
agente — e o CSV viaja muito menor que o binário.

O modelo é `MODELO.RAPIDO` (`gemini-3.5-flash`), definido em
`supabase/functions/ai-agents/lib/modelos.ts`.

---

## O contrato HTTP

`POST /functions/v1/ai-agents`, com `Authorization: Bearer <access_token do usuário>`:

```jsonc
{ "agente": "extrair-transacoes",
  "modo": "imagem" | "planilha" | "pdf",
  "arquivos": [{ "mimeType": "image/png", "base64": "..." }],  // imagem e pdf
  "csv": "...",                                                 // planilha
  "instrucao": "texto livre do usuário" }
```

Resposta: `{ "transacoes": [...] }` ou `{ "erro": { "codigo": "...", "mensagem": "..." } }`.

**Códigos de erro**, que o frontend traduz: `NAO_AUTENTICADO`, `REQUISICAO_INVALIDA`,
`AGENTE_DESCONHECIDO`, `IA_INDISPONIVEL` (503 do Gemini), `COTA_EXCEDIDA` (429),
`RESPOSTA_INVALIDA` (JSON malformado), `ERRO_INTERNO`.

⭐ **O frontend decide a mensagem pelo código, nunca pelo texto.** O texto existe como fallback.

---

## O que a função faz sozinha

⭐ **Ela busca `memory.ciclo_dia` e `categories` por conta própria**, com o token de quem chamou,
sob a RLS dele. O browser não manda lista de categoria nem ciclo — some a classe inteira de
divergência entre o que a tela tem em memória e o que o prompt recebe.

---

## O contrato de saída do modelo

O prompt pede **apenas** um array JSON, um objeto por transação:

| Campo | Regra |
|---|---|
| `data` | `YYYY-MM-DD` |
| `nome` | o texto **na íntegra** do extrato (`PGTO MERCADOLIVRE *OSASCO`) |
| `apelido` | versão limpa e curta, deduzida do nome (`Mercado Livre`) |
| `valor` | número; **positivo = entrada, negativo = saída** |
| `banco` | enum de `BANCOS` — os 20 bancos, `Outros` ou `null`. Planilha sempre `null` |
| `mes_fatura` | nome do mês em português, capitalizado, ou `null` |
| `hora` | `HH:MM:SS`; padrão `12:00:00` |
| `parcela_atual` / `parcela_total` | de `"3 de 10"` → `3` e `10`. Planilha sempre `null` |
| `categoria_sugerida` | ⭐ **obrigatoriamente** um nome da lista do usuário, injetada no prompt |

**Duas regras críticas que o prompt impõe:**
1. Transação sem data **ou** sem nome **ou** sem valor claro é **ignorada por inteiro** — nunca
   registrada pela metade. A normalização repete a checagem: o prompt pede, mas nada garante que o
   modelo obedeça.
2. JSON puro, sem markdown, e `categoria_sugerida` idêntica a uma opção.

A porta da planilha carrega regras a mais, porque é a única origem que vem incompleta: nome vazio
vira o nome da categoria; data sem dia usa o `ciclo_dia`; data só com ano usa Janeiro.

---

## A regra do ciclo, interpolada no prompt

O prompt não recebe "o ciclo é 5". Recebe a regra já escrita com o número:

> A fatura de um mês M engloba as transações do dia `ciclo_dia + 1` de M até o dia `ciclo_dia` do
> mês seguinte, inclusive.

Mudar o ciclo no `/perfil` muda o que a IA extrai a partir dali — e **não** muda o que já foi
extraído.

---

## O que acontece depois da resposta (`lib/normalizar.ts`, no servidor)

1. **Recorte do JSON** — entre o primeiro `[` e o último `]`. Falhou, vira `RESPOSTA_INVALIDA`.
2. **Descarte** — linha sem data, nome ou valor cai fora.
3. **Deslocamento de parcela** — a data vai para `mês da compra + (parcela_atual − 1)`. Uma compra
   de Janeiro na parcela 3 é registrada em Março. → D-003
4. **Casamento de categoria** — `categoria_sugerida` comparada por nome, *case-insensitive*.
5. A função devolve as linhas com `pendente: true`; **o browser acrescenta `user_id` e insere.**

> ⭐ **A IA nunca escreve um registro definitivo.** → D-001

---

## Estrutura dos arquivos

```
supabase/functions/
  _shared/
    cors.ts          preflight e headers — erro sem CORS chega como falha de CORS
    resposta.ts      ok() / erro(codigo) / ErroDeAgente
    supabase.ts      cliente com o Authorization de quem chamou
  ai-agents/
    index.ts         roteador: valida sessão → despacha por `agente`
    agentes/
      extrair-transacoes.ts
    lib/
      gemini.ts      chamada ao modelo + classificação de erro + recorte do JSON
      modelos.ts     MODELO.RAPIDO
      bancos.ts      BANCOS — dono único da lista
      normalizar.ts  deslocamento de parcela e casamento de categoria
    prompts/
      extrair-transacoes.ts   ⭐ um prompt montado de partes, os três modos
```

⭐ **Agente novo é um arquivo em `agentes/` e uma linha no roteador** — não uma Edge Function nova,
com deploy, CORS e auth próprios. → D-012

**Deploy:** `npx supabase functions deploy ai-agents --project-ref vkrreygxqlfhtodrogyq`.

---

## As 27 categorias padrão

Na primeira vez que o usuário abre `/novos-registros`, se `categories` estiver vazia, o sistema
semeia 27 categorias com cor. A lista literal está em `seedDefaultCategories`, em `Pendentes.tsx`.

⚠️ **Essa lista é o vocabulário da IA.** Apagar uma categoria remove a opção do prompt.

---

## Limite de tamanho

O cliente barra envios acima de **8 MB** somados, antes de subir. 🔶 O limite real de payload da
Edge Function precisa ser confirmado; 8 MB é folga conservadora.
