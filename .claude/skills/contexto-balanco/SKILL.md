---
name: contexto-balanco
description: Mantém o context/ e o CLAUDE.md do Balanço Geral atualizados e sem duplicação. Use ao terminar qualquer alteração que mude um FATO sobre o projeto — uma decisão tomada, uma pendência criada ou resolvida, um comportamento novo, uma armadilha descoberta, uma dívida assumida. Use também quando alguém pedir "atualize o contexto", "documente essa decisão" ou "registre isso". NÃO use para mudança que só toca código sem mudar nenhum fato documentado.
---

# Manter o contexto do Balanço Geral

Você vai rotear uma mudança para **um** arquivo, sem criar um segundo dono para o mesmo fato.

⭐ **Princípio que manda em tudo:** *um fato, um dono.* Se dois arquivos respondem a mesma pergunta,
um deles vai ficar velho e alguém vai acreditar no errado. Prefira **linkar** a repetir.

⛔ **Antes de tudo, saiba disto:** `/context` está no `.gitignore`. Não há histórico, não há
`git log`, não há backup. **O que não for escrito aqui não existe em lugar nenhum.** Isso torna a
regra "extraia o porquê antes de apagar" mais séria aqui do que em qualquer repositório normal.

## Passo 1 — Classifique

Responda as três antes de escrever qualquer coisa:

1. **Presente ou futuro?** Se é sobre o que **está no ar** (comando, schema, armadilha de código,
   invariante), o dono é o **`CLAUDE.md` da raiz** — não o `context/`. Se é sobre para onde vamos ou
   por quê, é `context/`.
2. **Natureza:** é um **fato** (o produto passou a ser assim), uma **decisão** (escolhemos X e
   rejeitamos Y), uma **pendência** (falta fazer ou está errado), uma **lição** (deu errado e virou
   regra) ou uma **crença errada** que você acabou de desfazer?
3. **Já tem dono?** Procure antes de criar — `Grep` pelo termo em `context/` e no `CLAUDE.md`.

## Passo 2 — Roteie

| Natureza | Arquivo |
|---|---|
| Decisão tomada (com o rejeitado) | `context/30-decisoes-e-licoes.md` — nova entrada `D-nnn`, **nunca renumere as antigas** |
| Algo deu errado e virou regra | `context/30-decisoes-e-licoes.md` — nova entrada `L-nnn`, formato **incidente → causa → regra** |
| Crença errada desfeita | ⭐ `context/05-erros-comuns.md` — uma linha na tabela, com link para a explicação |
| Falta fazer, está quebrado, está frágil | `context/20-pendencias-e-dividas.md`, no nível 🟢/🔵/🟠/🔴 certo |
| Pendência resolvida | `context/20-pendencias-e-dividas.md`, seção **"Já resolvido — não reabrir"** — mova, não delete |
| Termo novo ou ambíguo | `context/04-glossario.md` |
| Mudou o que o produto faz **hoje** | `context/01-o-que-e-o-balanco-geral.md` |
| Mudou o que uma tela faz | `context/02-paginas-do-balanco-geral.md` |
| Mudou o prompt, o contrato de saída ou o pós-processamento da IA | ⭐ `context/03-agentes-de-ia.md` |
| Ideia nova de evolução | `context/10-proximos-passos.md` (`status: proposta`) |
| Mudou a ambição comercial / o que precisa ser verdade antes de vender | `context/11-ambicao-de-produto.md` |
| Comando, env var, schema, invariante, armadilha do que **está no ar** | `CLAUDE.md` da raiz — **não** `context/` |

## Passo 3 — Escreva

- **Atualize `atualizado_em`** no frontmatter do arquivo tocado.
- **Foi decisão?** A entrada `D-nnn` precisa dos cinco campos: data, decisão, **por quê**, **o que
  foi rejeitado**, status. ⭐ Sem o rejeitado, alguém vai propor de novo o que já foi descartado.
- **Foi lição?** A entrada `L-nnn` precisa de **incidente → causa → regra**. A regra é o que fica.
- **Contradisse algo?** Marque o antigo como superado **e datado** — o padrão é
  `⚠️ Correção de <data>:` — em vez de apagar. Se um documento inteiro perdeu validade, **extraia o
  porquê para `30-decisoes-e-licoes.md` antes** de mexer nele.
- **Resolveu pendência?** Mova para "Já resolvido — não reabrir", com o que ficou. Não delete a
  linha.
- **É dedução sua, não confirmada pelo Bernardo?** Marque com **🔶**. Confirmou depois? Apague o
  símbolo. ⭐ Ele prefere que você preveja e ele corrija — mas só se der para ver o que é chute.

## Passo 4 — Verifique

- ⚠️ Algum arquivo passou de **400 linhas**? Avise e proponha a divisão. Exceção declarada:
  `30-decisoes-e-licoes.md`, que é *append-only*.
- ⚠️ Você criou um segundo dono para um fato? Se sim, desfaça e linke.
- ⚠️ O `00-LEIA-PRIMEIRO.md` continua roteando certo? Arquivo novo tem de aparecer nas tabelas dele.
- Rode o teste de aceite abaixo contra o que escreveu.

## Proibições

- ⛔ **Não recrie pasta de arquivo morto** ("por via das dúvidas", "histórico", "antigo"). Guardar
  documento superado é exatamente o que produz o problema que o `context/` veio resolver.
- ⛔ Não crie arquivo novo sem tirar conteúdo de outro. Arquivo novo é redistribuição, não adição.
- ⛔ Não repita fato que já tem dono.
- ⛔ Não misture "o que é" com "o que queremos" no mesmo arquivo.
- ⛔ Não escreva no `context/` nada que pertença ao `CLAUDE.md` da raiz — comando, env var,
  armadilha de código. É a duplicação mais provável deste projeto.
- ⛔ **Não coloque valor real, nome de estabelecimento, e-mail de lead nem chave de API** em nenhum
  arquivo. Estes são dados financeiros pessoais; documento de contexto descreve estrutura, nunca
  conteúdo.
- ⛔ Não tire `/context` nem `/supabase` do `.gitignore` sem decisão explícita — é a D-006.

## Teste de aceite

Um agente sem contexto, lendo apenas `CLAUDE.md` e `context/`, deve acertar 9 das 10:

1. O que a IA faz com uma transação que extraiu? → **grava como rascunho** (`pendente: true`);
   só a revisão manual a torna real
2. O balanço de Janeiro cobre que dias? → **do dia 6/01 ao dia 5/02**, com `ciclo_dia = 5`
3. Qual a diferença entre `data` e `mes_fatura`? → quando a compra ocorreu × em que balanço ela cai
4. Onde está o schema do banco? → **só no painel do Supabase**; apenas `leads` tem SQL versionado
5. A chave do Gemini está segura? → **não**, `VITE_*` vai inteiro para o bundle do browser
6. Uma compra em 10x gera quantos registros na importação? → **um por parcela cobrada**, com a data
   deslocada — nunca 10 de uma vez
7. Gastos fixos aparecem nos balanços? → **não**, `fixos` é uma lista paralela hoje
8. Quantos agentes de IA existem? → **um**, com três portas de entrada (imagem, planilha, PDF)
9. `npm run dev` passou; posso dar push? → **não**: rode `npm run build`, é `tsc -b` em `strict` que
   a Vercel executa
10. O que é a tabela `memory`? → **configuração do usuário** (`ciclo_dia`) e as Notas do Dashboard —
    não é memória de IA
