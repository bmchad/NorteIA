---
status: vigente
atualizado_em: 2026-09-03
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
/novos-registros  →  ai-agents (Deno, no Supabase)
       ↑                   │
       │                   ├─ 1. extrair-transacoes ──→ Gemini  (imagem/PDF/CSV)
       │                   ├─ 2. memória + estorno      (sem token)
       │                   └─ 3. classificar-compromisso → Gemini  (só texto)
       │                   ↓
       └──── transações normalizadas, prontas para insert
```

O browser lê o arquivo, manda para a função e recebe as linhas prontas. **Quem insere em
`transactions` é o browser**, com a própria sessão, para que a escrita continue passando pela RLS do
usuário — a função nunca precisa da service role.

⭐ **Uma chamada do browser, duas ao Gemini.** O encadeamento acontece dentro da função: mandar as
linhas extraídas de volta ao browser só para ele reenviá-las ao agente 2 seria a mesma informação
atravessando a rede duas vezes. → D-034.

---

## Os dois agentes

⚠️ **Correção de 2026-08-30:** até aqui existia **um** agente com três portas de entrada. Agora são
**dois**, e a divisão é por tarefa, não por formato de arquivo. → D-034.

| | 1 · `extrair-transacoes` | 2 · `classificar-compromisso` |
|---|---|---|
| Entra | imagem / PDF / CSV | as linhas já extraídas, em texto |
| Sai | todas as chaves **menos** `compromisso` | só `compromisso`, por transação |
| Contexto no prompt | categorias, notas do vocabulário | tipos ativos + até 10 exemplos de cada |
| Custo | caro: anexo multimodal | barato: texto puro, sem anexo |

⭐ **Por que separar melhora o resultado:** extrair é ler o que está escrito; classificar compromisso
é comparar contra um vocabulário que o usuário configurou. Num prompt só, o vocabulário disputava
espaço com as regras de data, banco e parcela — e exemplo nenhum cabia.

⛔ **`compromisso` saiu do prompt do agente 1 e não pode voltar.** Se o campo existir nos dois, os
dois respondem, o último a escrever vence, e o sintoma é uma classificação que muda sozinha entre
importações. Há um comentário no `Contexto` de `prompts/extrair-transacoes.ts` dizendo isso.

### As três portas do agente 1

| Porta | Como o conteúdo chega ao modelo |
|---|---|
| **Imagem / print** | base64 → `inlineData` (multimodal, aceita N imagens de uma vez) |
| **Planilha `.xlsx`** | ⚠️ lida **no browser** com `xlsx` → `sheet_to_csv` → o CSV viaja como texto |
| **PDF** | base64 → `inlineData` com `mimeType: application/pdf` |

A planilha continua sendo parseada no cliente porque converter `xlsx` em CSV não é chamada de
agente — e o CSV viaja muito menor que o binário.

### O agente 2, em detalhe

Recebe **só o que sobrou**: transações de saída ainda sem `compromisso`, depois de a memória ter
resolvido os nomes já conhecidos (D-028) e de os estornos terem sido descartados (D-026). Num
extrato mensal isso costuma ser um punhado de nomes novos, não a fatura inteira.

Devolve `[{"i": <índice>, "compromisso": "<slug>"}]`, **omitindo** o que não se encaixa.

⚠️ **Slug inventado é barrado** contra a lista de tipos ativos. Rótulo órfão não some só da tela —
ele **tira a transação da camada Previsível**, porque a cascata da D-033 confia nesse campo.

⚠️ **Falha aqui não derruba a importação.** Sem rótulo, a transação entra e o usuário atribui à mão.

### Os modelos

`supabase/functions/ai-agents/lib/modelos.ts` — nomeados pelo papel, nunca pela versão:

| Constante | Valor | Usado por |
|---|---|---|
| `MODELO.EXTRACAO` | `gemini-3.7-flash` | agente 1 |
| `MODELO.CLASSIFICACAO` | `gemini-3.7-flash` | agente 2 |
| ⭐ `MODELO.FALLBACK` | `claude-sonnet-5` | **os dois**, só quando o Gemini responde 503 |

⭐ **Mesmo id, constantes separadas de propósito:** trocar o modelo de um agente deixa de tocar no
outro, que é o motivo de eles serem separados. `MODELO.RAPIDO` não existe mais.

⚠️ **Id de modelo inválido falha em runtime, com 404 da API** — não em build, não em `tsc`, não em
`deno check`. → `20-pendencias-e-dividas.md`.

### ⭐ O provedor reserva

Quando o Gemini responde **503**, `gerar()` repete a chamada no Claude (`lib/claude.ts`, `fetch`
direto na Messages API, sem SDK) e devolve o texto dele. Vale para os **dois** agentes, porque o
fallback mora na porta única de geração.

⭐ **Só o 503.** `classificar()` continua sendo o dono do critério: 429 é limite da conta e resposta
malformada é problema de prompt — nenhum dos dois melhora trocando de provedor.

⛔ **`tentarClaude` nunca lança.** Chave ausente, HTTP de erro, resposta vazia: tudo vira `null` mais
uma linha no log, e o erro **original** do Gemini é que sobe. Um plano B que introduz um modo de
falha novo não é plano B.

⚠️ No log, `fallback.usado` é a linha que diz que a importação saiu pelo Claude — e `claude.sem.chave`
diz que o `CLAUDE_API_KEY` não está configurado. → D-055

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
| `banco` | enum de `BANCOS` — os 20 bancos, `Outros` ou `null`. ⭐ **Conferido na volta** desde 03/09: `casarBanco` (`lib/normalizar.ts`) casa sem caixa nem acento e grava o valor canônico da lista; fora dela vira `null`. Antes era repasse puro → L-012. ⚠️ Na **planilha** é `null`, **exceto** se as instruções do usuário nomearem um banco da lista — a planilha em si nunca diz o banco |
| `mes_fatura` | nome do mês em português, capitalizado, ou `null` |
| `hora` | `HH:MM:SS`; padrão `12:00:00` |
| `parcela_atual` / `parcela_total` | de `"3 de 10"` → `3` e `10`. ⚠️ Na planilha, **só** quando o padrão `N/M` está escrito na descrição (D-048) |
| `categoria_sugerida` | ⭐ **obrigatoriamente** um nome da lista do usuário, injetada no prompt. ⚠️ **Vale para entrada também** desde 30/08: até aí o prompt mandava devolver `null` em todo valor positivo, e o salário entrava sem categoria para sempre → D-054 |

**Duas regras críticas que o prompt impõe:**
1. Transação sem data **ou** sem nome **ou** sem valor claro é **ignorada por inteiro** — nunca
   registrada pela metade. A normalização repete a checagem: o prompt pede, mas nada garante que o
   modelo obedeça.
2. JSON puro, sem markdown, e `categoria_sugerida` idêntica a uma opção.

A porta da planilha carrega regras a mais, porque é a única origem que vem incompleta: nome vazio
vira o nome da categoria; data sem dia usa o `ciclo_dia`; data só com ano usa Janeiro.

⭐ **Duas dessas regras são sobre parcela, e são novas.** A planilha pode trazer parcela quando o
padrão `N/M` está **escrito** na linha — ⛔ inferir de valor, estabelecimento ou da repetição da
mesma linha em meses diferentes continua proibido, e é a parte da regra antiga que importava. E na
linha parcelada `mes_fatura` vem `null`, porque a data ali é a da **compra**: o ciclo tem de sair da
data já deslocada. → D-048, P36

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
5. ⭐ **A memória do usuário sobrescreve a IA** — ver a seção abaixo.
6. A função devolve as linhas com `pendente: true`; **o browser acrescenta `user_id` e insere.**

---

## ⭐ A memória de categoria — o que o usuário ensinou vale mais

`lib/memoria-categoria.ts`. Depois da extração, a função conta como aquele mesmo `nome` já foi
categorizado no histórico **confirmado** (`pendente = false`). Se a categoria mais frequente tiver
**3 ocorrências ou mais**, ela sobrescreve o palpite do modelo.

⭐ **É invisível.** Não há tela, aviso nem configuração — o usuário nunca sabe que existe, só percebe
que o app acerta.

**Duas regras que decidem o comportamento:**

- **Desempate:** vale *a mais frequente*, não *qualquer uma acima de 3*. Empate exato mantém o
  palpite da IA, porque a memória não tem opinião formada.
- ⭐ **A memória se conserta sozinha.** Como a contagem lê o confirmado, cada correção do usuário
  entra no placar na hora — memória errada por 3 confirmações vira depois de 3 correções.

**Não há tabela nem trigger:** a contagem é derivada de `transactions` na hora, e só sobre os nomes
do lote. O porquê e a medição que fechou o desenho estão em `30-decisoes-e-licoes.md` D-013.

⚠️ Falha na consulta não derruba a extração: sem memória, a sugestão da IA prevalece — o
comportamento anterior a esta feature.

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
      memoria-categoria.ts  ⭐ o que o usuário já confirmou 3 vezes vence a IA
    prompts/
      extrair-transacoes.ts   ⭐ um prompt montado de partes, os três modos
```

### O log de estágio

⭐⭐ **Existe por um modo de falha específico:** o `546` do Supabase é o runtime **matando o
worker** por limite de memória ou CPU. Nenhum `catch` roda e a função devolve um status que ela
nunca escolheu — então um relatório de erro no fim não sobrevive.

`_shared/log.ts` imprime **ao entrar em cada etapa**, com id de chamada, tempo acumulado, delta e
memória do worker. ⭐ **A última linha impressa nomeia a etapa que não terminou.** As etapas vão de
`inicio` (com os bytes do corpo) a `extrair.fim`, passando por `gemini.envio` e `gemini.resposta`.

⛔ **O log mede, nunca transcreve.** Tamanho, contagem, tempo e código de erro — jamais nome de
estabelecimento, valor ou trecho de prompt. Os logs são legíveis no painel, e isto é dado
financeiro pessoal.

---

⭐ **Agente novo é um arquivo em `agentes/` e uma linha no roteador** — não uma Edge Function nova,
com deploy, CORS e auth próprios. → D-012

**Deploy:** `npx supabase functions deploy ai-agents --project-ref vkrreygxqlfhtodrogyq`.

---

## As 28 categorias padrão

⭐ **Nascem com a conta**, por `public.semear_conta`, chamada pela `handle_new_user`. A lista
literal vive na migration `20260830240000_semente_no_cadastro.sql` — ⚠️ **não no TypeScript**, e a
diferença importa: a semente só faz sentido no instante do cadastro, e esse instante acontece no
banco. → D-053

⚠️ **Correção de 2026-08-30:** até aqui elas eram semeadas pelo `Pendentes.tsx`, na primeira vez que
o usuário abrisse `/novos-registros` — quem nunca abrisse aquela tela não tinha categoria nenhuma.

⚠️ **Essa lista é o vocabulário da IA.** Apagar uma categoria remove a opção do prompt.

⭐ **Três delas carregam uma decisão, e não só um nome:** `Salário` e `Outras Receitas` nascem com
`e_renda = true`, e `Reembolsos` existe para o positivo que **não** é renda. ⚠️ Correção de
2026-08-30: eram 27 e nenhuma nascia marcada. → D-051

---

## Limite de tamanho

O cliente barra envios acima de **8 MB** somados, antes de subir. 🔶 O limite real de payload da
Edge Function precisa ser confirmado; 8 MB é folga conservadora.
