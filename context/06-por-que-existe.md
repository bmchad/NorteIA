---
status: vigente
atualizado_em: 2026-09-16
---

# Por que a NorteIA existe

> Este arquivo é o dono de **por que este produto existe** — a origem, o problema de mercado e a
> regra de decisão que sai dele. É anterior a qualquer decisão registrada em
> `30-decisoes-e-licoes.md`: é o critério com que aquelas decisões foram tomadas.
>
> **O que este arquivo NÃO é:** o produto como ele é (`01-o-que-e-o-balanco-geral.md`), o roadmap
> (`10-proximos-passos.md`) nem a ambição comercial (`11-ambicao-de-produto.md`).
>
> ⭐ É **versionado e público**, de propósito. Quem clona o repositório precisa entender a missão
> antes do código. ⚠️ O `.gitignore` ignora `10`, `11`, `20` e `30` **por nome, não por padrão** —
> arquivo novo nasce público independentemente do número. Este devia mesmo nascer; outro pode não
> dever.

---

## A origem

Desde os 14 anos o Bernardo recebia mesada com uma condição: registrar tudo numa planilha — quanto
entrava, quanto saía —, para enxergar se o gasto era consciente ou desregulado. Funcionou. Educou.

Mas tinha dois defeitos, e eles são o produto inteiro:

1. **Custava cerca de 2 horas por mês.** Por isso virava a cada dois ou três meses, e o número na
   mão nunca era o de agora — era sempre o de muito tempo atrás.
2. **Quase ninguém tem essa disciplina.** Os amigos que ouviam falar disso chamavam de loucura. No
   fundo queriam o mesmo resultado; o que faltava não era vontade, era disposição a pagar 2 horas
   por mês.

⭐ **Os amigos não eram indisciplinados — eram racionais sobre o custo.** Essa leitura é o que
separa este produto de um app de "crie o hábito": o problema nunca foi de força de vontade.

---

## As três tentativas, e o defeito que cada uma matou

A NorteIA é a terceira tentativa de resolver o mesmo problema, e vista assim a sequência inteira faz
sentido:

| Tentativa | Matou | Sobreviveu |
|---|---|---|
| **Planilha à mão** (desde os 14) | nada | o custo de 2h/mês **e** o dado velho |
| **IA lendo print, PDF e planilha** | o custo — subir um arquivo em vez de digitar tudo | o dado velho |
| **Open Finance** (próximo passo) | o dado velho | — |

⭐ **A IA resolveu o defeito 2, não o 1.** Com o esforço em segundos, a objeção dos amigos cai. Mas
o banco só libera o extrato quando o mês fecha, então o print herdou intacto o defeito da planilha:
**a análise é sempre do que aconteceu até um mês atrás.** A alternativa — printar todo dia — é
exatamente o tipo de disciplina que o produto existe para não exigir.

⭐ **É por isso que o Open Finance é o próximo passo, e não uma aposta nova.** Ele é a última peça
de um problema começado aos 14 anos. → `10-proximos-passos.md`

---

## Por que o Open Finance bancário não resolve: seleção adversa

⭐⭐ **Este é o argumento central do produto.** O Open Finance oferecido pelos bancos falha por
desenho, não por incompetência — e a falha tem forma conhecida.

**O mecanismo.** Um banco que agrega os dados dos concorrentes é concorrente das instituições que
agrega. Não há incentivo para entregar análise profunda: o que se vê na prática é categorização
fraca, saldo e parcelas, sem previsão de gasto. A feature limitada não é bug, é o desenho
funcionando.

**A armadilha.** Some a isso o que o banco faz com o dado, e o mercado se divide em dois grupos, e
nenhum dos dois conecta:

- **Quem está endividado não conecta.** O banco tem incentivo e capacidade de reprecificar risco —
  é a atividade dele. Entregar o histórico completo de 6,7 instituições a quem define o seu juros é
  irracional. Recusar é a escolha certa.
- **Quem não está endividado conecta sem ganhar.** A feature é fraca demais para compensar entregar
  o dado.

⭐⭐ **O resultado é que o Open Finance bancário só é adotado por quem menos precisa dele.** É
seleção adversa: o desenho afasta exatamente a população-alvo.

### Os números que sustentam isso

Fonte: **Relatório de Cidadania Financeira do Banco Central, 4ª edição**, divulgado em 13/04/2026
com dados de dezembro de 2024. Contribuições de Febraban, FGV, Sebrae e Skema.
→ [relatorio_de_cidadania_financeira_2025.pdf](https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/RIF/relatorio_de_cidadania_financeira_2025.pdf)

- ⭐ **6,7** — média de relacionamentos do brasileiro com instituições financeiras diferentes. É a
  fragmentação: ninguém tem visão consolidada sem agregar.
- ⭐ **+47% contra +37%** — entre 2020 e 2024, os clientes com **ativos problemáticos** cresceram
  47%, enquanto os clientes com crédito ativo cresceram 37%. **A inadimplência cresce mais rápido
  que o acesso ao crédito.**
- 130 milhões de pessoas com exposição a crédito, ~74% da população bancarizada; 9 em cada 10 usam
  algum produto de crédito.

⚠️ **Citar o BCB, nunca o jornal.** A notícia que trouxe o dado foi o Monitor Mercantil, mas em
apresentação a fonte é o relatório.

**A tese em uma frase:** *o brasileiro tem em média 6,7 relacionamentos financeiros e a inadimplência
cresce mais rápido que o crédito — quem mais precisa consolidar é quem menos pode entregar o dado.*

---

## Por que os apps de terceiros também não resolvem

Diante do vazio, o mercado foi para plataformas independentes, e elas de fato entregam o que os
bancos não entregam: categorização boa, previsão, integração entre instituições, sugestão de
melhoria.

O preço é o mesmo dado, com outro destinatário. Um app gratuito que processa dado financeiro
precisa se pagar, e as formas disponíveis são poucas e conhecidas — perfil de consumidor tem
mercado, e varejo compra.

⛔ **Argumente o incentivo, nunca a prática.** "O banco aumenta o seu juros com esses dados" e "o
app vende o seu perfil" são acusações: exigem prova, e o ouvinte para de discutir a tese para
discutir a acusação. **"Quem recebe seu histórico completo tem incentivo e capacidade de
reprecificar seu risco"** e **"um app gratuito que processa dado financeiro precisa se pagar de
alguma forma"** dizem a mesma coisa, não precisam de citação e não podem ser desmentidos. Use
sempre a segunda forma.

**A conclusão estrutural:** toda configuração existente exige entregar o dado a alguém cujo
interesse diverge do seu. O banco quer precificar seu risco. O app quer vender seu perfil. Em troca
de liberdade financeira, a pessoa perde a liberdade sobre os próprios dados financeiros — que
acabam usados contra ela.

---

## A regra de decisão

⭐⭐ **Quando autonomia e conveniência entrarem em conflito, autonomia ganha.**

Não é um valor, é um critério operacional — e ele já recusa coisas concretas:

- ⛔ **Instância multi-tenant hospedada como produto principal.** Recriaria o terceiro que a tese
  elimina. A instância da família (`norteia-nexfin.com.br`, cadastro fechado) é exceção doméstica
  declarada, não cabeça de ponte.
- ⛔ **Telemetria.** Nem para contar usuários.
- ⛔ **Feature que só funciona na instância hospedada.** Transformaria o fork em versão de segunda.
- ⛔ **Camada gratuita paga com dado.** Em nenhuma forma.

### O que a regra custa, e é aceito de olhos abertos

🔶 **"Usuário ativo" é imensurável por desenho.** Sem telemetria não há como saber quem usa. A
métrica honesta do projeto é fork e contribuição, nunca uso — e o número de operadores hoje é
estimado por contas na instância própria somadas a forks com commits recentes, que são duas coisas
diferentes. ⛔ Nunca chamar isso de "N usuários ativos": não sobrevive a uma pergunta de
acompanhamento, e a solução tentadora — um ping — é proibida pela regra acima.

**A barreira de entrada mudou de natureza, não desapareceu.** Era "saber rodar software"; com
copiloto de IA fazendo a instalação, virou "estar disposto a criar duas contas e colar duas chaves".
⭐ Os passos que exigem **identidade e pagamento** não se delegam — e é bom que não se deleguem,
porque um agente segurando credencial contradiz a tese. → `INSTALAR.md`

🔶 **O caminho de instalação passa a pressupor acesso a um copiloto pago.** O copiloto vê a
configuração, não o dado financeiro, então não fere a tese — mas é uma dependência nova num projeto
cuja bandeira é não depender de ninguém. Melhor nomear aqui do que deixar alguém nomear por nós.

---

## Por que isto se sustenta sem monetizar

⭐ **Cada operador tem o próprio Supabase e a própria chave de IA. Um usuário novo custa exatamente
zero.**

Não é detalhe de configuração: é o que torna a ideologia sustentável. Todo concorrente que roda
análise de IA sobre dado de terceiro fica mais caro a cada usuário, e por isso **precisa** monetizar
o dado. A NorteIA não fica, e por isso não precisa. É a resposta a "mas como isso se paga?" antes de
alguém perguntar.

⛔ **Corolário:** a tentação de "só hospedar para facilitar" reintroduz custo marginal por usuário —
e com ele, a pressão para monetizar. É assim que projetos como este viram o que combatiam.

---

## O buraco conhecido, e como ele fecha

⚠️ **Hoje o dado financeiro sai da máquina do usuário.** A IA lê a fatura inteira — nomes, valores,
datas — porque escrever um parser por instituição seria inviável. O terceiro é o Google (e a
Anthropic no fallback), não um banco: não há relação de conta nem incentivo para vender crédito ao
usuário. É categoria diferente, mas **"ninguém vê seus dados" não é verdade hoje**, e é melhor
admitir do que ser desmentido.

O fechamento é uma sequência, não um evento:

1. ⭐ **Open Finance devolve JSON.** A IA deixa de ler documento e passa a ver apenas o **nome
   original do estabelecimento**, para devolver apelido e categoria. Sem valor, sem data, sem
   identidade. Todo o resto é conta do código.
2. 🔶 **A superfície decai sozinha.** Com a invariante de determinístico-primeiro, mais o
   `vocabulario` e o `memoria-categoria.ts`, cada estabelecimento confirmado sai do prompt para
   sempre. Pessoas compram nos mesmos lugares: a lista converge para os estabelecimentos
   genuinamente novos de cada ciclo, que são poucos depois de alguns meses. → `CLAUDE.md`,
   invariantes 8 e 9
3. 🔶 **Modelo local passa a ser viável.** Classificar uma string curta em ~28 categorias não exige
   modelo de fronteira. É o término natural da tese, e registrar agora evita que pareça ambição nova
   depois.

⚠️ **O que sobra, mesmo depois disso:** o *conjunto* de estabelecimentos que alguém frequenta é
sinal fraco, ainda que sem valor, data ou identidade. Admitir isso é o que torna o resto do
argumento confiável.

---

## O intermediário que resta, e a formulação correta

Receber dados no Open Finance exige participante autorizado pelo BCB. A saída é usar um agregador
regulado que ofereça API a desenvolvedor — hoje, o Pluggy. → `10-proximos-passos.md` B3

⛔ **Isso muda a frase da tese, e a versão modesta é a que sobrevive.** Com um agregador no caminho,
"quem analisa e quem é analisado são a mesma pessoa" deixa de ser literal. A formulação correta:

> ⭐⭐ O usuário é cliente direto de cada fornecedor, e **nenhum fornecedor recebe dados agregados
> dos usuários da NorteIA.**

É essa a diferença estrutural para um app de terceiro — não a ausência de intermediário, mas a
**ausência de ponto de agregação**. O app concorrente acumula o dado de todos, e é o acúmulo que
torna o perfil vendável; perfil isolado não tem mercado. Cada operador com a própria conta no Pluggy
mantém a propriedade que importa.

⛔⛔ **Confirmado em 2026-09-16: o tier gratuito do Pluggy proíbe uso em produção.** A barreira
voltou — não regulatória, mas econômica, e recai sobre **cada operador**, que é o pior lugar
possível: quebra o custo marginal zero exatamente onde ele importa.

⭐⭐ **A consequência é boa, e redefine o roadmap:** a entrada por print **não é legado nem etapa de
transição — é a porta gratuita e permanente.** O Open Finance é a porta de baixa latência para quem
puder pagar o agregador.

Isso promove duas linhas que pareciam secundárias: continuar melhorando a extração por documento, e
reduzir a superfície de IA no caminho do print. O **modelo local** deixa de ser elegância ideológica
e vira economia — é o que mantém o caminho gratuito realmente gratuito.

⛔ **A saída tentadora é proibida:** uma conta de agregador da NorteIA compartilhada por todos os
forks recria o ponto de agregação que esta página inteira existe para eliminar.

⚠️ **Em aberto:** existe agregador regulado com preço viável para pessoa física operando a própria
instância? → `20-pendencias-e-dividas.md` P48

---

## A missão, em uma frase

Entregar o que o Open Finance tem de bom — integração entre instituições e dado atualizado — sem
que ninguém precise vender o próprio dado financeiro em troca disso.

**A promessa ao usuário:** descubra quanto do seu dinheiro tem dono.
**O argumento por trás dela:** autohospedar é a única configuração em que não existe ponto de
agregação.
