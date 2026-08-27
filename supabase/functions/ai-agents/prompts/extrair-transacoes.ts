import { listaDeBancos } from '../lib/bancos.ts';

/**
 * O prompt da extração, montado de partes comuns.
 *
 * Até 2026-08-27 existiam três cópias deste texto dentro de `Pendentes.tsx`, uma por porta
 * de entrada, e elas já haviam divergido entre si: a regra de nome vazio só existia na
 * planilha, a de parcelas só na imagem. Mudar o contrato exigia lembrar dos três.
 *
 * Aqui o que varia por modo é declarado como diferença, não como texto novo.
 */

export type Modo = 'imagem' | 'planilha' | 'pdf';

/** Como a regra do ciclo é escrita para o modelo, já com o dia do usuário dentro. */
function regraDoCiclo(cicloDia: number): string {
  const inicio = String(cicloDia + 1).padStart(2, '0');
  const fim = String(cicloDia).padStart(2, '0');
  return `Nome do mês do ciclo da fatura ou do balanço em que a transação entra (ex: "Janeiro", "Fevereiro"). DEVE ser estritamente o nome do mês em português com a primeira letra maiúscula, ou null. A regra é: a fatura (ou balanço) de um determinado Mês engloba as transações do dia ${cicloDia + 1} desse mês até o dia ${cicloDia} do mês seguinte. Exemplo: A fatura de Janeiro contém as transações do dia ${inicio} de Janeiro até o dia ${fim} de Fevereiro (inclusive).`;
}

const ORIGEM: Record<Modo, string> = {
  imagem: 'a imagem fornecida, que é um print de extrato bancário ou fatura de cartão',
  planilha: 'o conteúdo em formato CSV de uma planilha financeira fornecido no fim desta mensagem',
  pdf: 'o documento PDF fornecido, que é um extrato bancário ou fatura',
};

/** O campo `banco`: dedutível na imagem e no PDF, inexistente na planilha. */
function campoBanco(modo: Modo): string {
  if (modo === 'planilha') return '- "banco": Sempre retorne null para planilhas.';
  const onde = modo === 'imagem' ? 'pela interface do print' : 'pelo documento';
  return `- "banco": Nome do banco deduzido ${onde}. DEVE obrigatoriamente ser um destes valores exatos: [ ${listaDeBancos()} ], ou null se não for possível deduzir.`;
}

/** Parcelamento: a planilha nunca traz, e inventar parcela ali cria despesa futura falsa. */
function camposParcela(modo: Modo): string {
  if (modo === 'planilha') {
    return '- "parcela_atual": Sempre retorne null para planilhas.\n- "parcela_total": Sempre retorne null para planilhas.';
  }
  return '- "parcela_atual": Número da parcela atual (se for compra parcelada, ex: "1 de 10" -> 1). Se não houver, retorne null.\n- "parcela_total": Total de parcelas (ex: "1 de 10" -> 10). Se não houver, retorne null.';
}

/** De onde a categoria pode ser deduzida — a planilha pode ter uma coluna própria. */
function campoCategoria(modo: Modo, categorias: string): string {
  const fonte = modo === 'planilha'
    ? 'de acordo com o nome, apelido ou qualquer coluna de categoria da planilha'
    : 'de acordo com o nome e apelido da transação';
  return `- "categoria_sugerida": Se o "valor" for negativo (saída), deduza a categoria mais provável ${fonte} e selecione obrigatoriamente um dos seguintes valores exatos da nossa lista: [ ${categorias} ]. Se o "valor" for positivo (entrada/receita), ou se nenhuma categoria da lista fizer sentido, retorne null.`;
}

/**
 * A planilha é a única origem que costuma vir incompleta — linha sem nome, sem dia, às
 * vezes só com o ano. Sem estas regras a IA descarta linha demais ou inventa data.
 */
function regrasDaPlanilha(cicloDia: number): string {
  const dia = String(cicloDia).padStart(2, '0');
  return `
3. REGRAS DE NOME E APELIDO: Se o nome da transação estiver ausente, em branco ou nulo, coloque o NOME DA CATEGORIA SUGERIDA tanto em "nome" quanto em "apelido". Se a categoria sugerida também for nula, use "Outros".
4. REGRAS DE DATA INCOMPLETA:
   - Havendo data completa, retorne no formato YYYY-MM-DD.
   - Faltando o dia (só mês e ano), padronize o DIA como ${cicloDia}. Ex: Maio/2026 vira "2026-05-${dia}".
   - Faltando também o mês (só o ano), use Janeiro e o mesmo dia. Ex: 2026 vira "2026-01-${dia}".
   - Não havendo informação nenhuma de data na linha, use a data de hoje.
5. O campo "banco" e os campos de parcela DEVEM ser null em TODAS as linhas da planilha. Nunca configure parcelas para planilhas.`;
}

export interface Contexto {
  modo: Modo;
  cicloDia: number;
  categorias: string[];
  instrucao?: string | null;
  csv?: string | null;
}

export function montarPrompt({ modo, cicloDia, categorias, instrucao, csv }: Contexto): string {
  const lista = categorias.join(', ');

  let prompt = `Você é um assistente financeiro de elite. Analise ${ORIGEM[modo]} e extraia TODAS as transações válidas.
Retorne APENAS um JSON válido contendo um array de objetos com a seguinte estrutura para cada transação:
- "data": Data no formato YYYY-MM-DD.
- "nome": Nome do estabelecimento, descrição ou transferência na íntegra (ex: "PGTO MERCADOLIVRE *OSASCO").
- "apelido": Um nome limpo e resumido, deduzido a partir do nome na íntegra (ex: "Mercado Livre").
- "valor": Valor numérico, positivo para entradas e negativo para saídas.
${campoBanco(modo)}
- "mes_fatura": ${regraDoCiclo(cicloDia)}
- "hora": Hora no formato HH:MM:SS. Se não houver, use "12:00:00".
${camposParcela(modo)}
${campoCategoria(modo, lista)}

REGRAS CRÍTICAS (SIGA À RISCA):
1. Se uma transação NÃO tiver data, OU NÃO tiver nome, OU NÃO tiver valor claro, IGNORE-A COMPLETAMENTE. Nunca registre transações pela metade.
2. Não use blocos de código nem markdown: retorne o JSON puro. A "categoria_sugerida" DEVE ser textualmente idêntica a uma das opções da lista ou null.`;

  if (modo === 'planilha') {
    prompt += regrasDaPlanilha(cicloDia);
  }

  if (instrucao && instrucao.trim()) {
    prompt += `\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${instrucao.trim()}`;
  }

  if (modo === 'planilha' && csv) {
    prompt += `\n\nCONTEÚDO DA PLANILHA EM FORMATO CSV:\n${csv}`;
  }

  return prompt;
}
