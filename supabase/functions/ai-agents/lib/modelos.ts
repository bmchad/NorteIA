/**
 * Os modelos do Gemini, nomeados pelo papel e nunca pela versao.
 *
 * ⭐ Dois agentes, duas constantes -- mesmo id hoje, de proposito. Trocar o modelo de um
 * agente deixa de tocar no outro, que e justamente o motivo de eles serem separados.
 *
 * ⚠️ Id invalido falha em RUNTIME, com 404 da API: nao ha build nem tsc que pegue isso. A
 * primeira importacao depois do deploy e o que confirma.
 */
export const MODELO = {
  /** Agente 1: extracao a partir de imagem, planilha e PDF. */
  EXTRACAO: 'gemini-3.7-flash',
  /** Agente 2: classificacao de compromisso. So texto, sem anexo. */
  CLASSIFICACAO: 'gemini-3.7-flash',
  /**
   * O provedor reserva, acionado so quando o Gemini responde 503.
   *
   * ⭐ Um id para os dois agentes, e nao dois: o fallback existe para a IMPORTACAO nao
   * morrer numa indisponibilidade do provedor primario, e nao para ajustar qualidade por
   * tarefa. Se um dia valer diferenciar, e aqui que se separa.
   *
   * ⚠️ Outro provedor, outra chave: `CLAUDE_API_KEY`, secret da funcao. Sem ela o fallback
   * simplesmente nao existe, e o erro do Gemini segue.
   */
  FALLBACK: 'claude-sonnet-5',
};
