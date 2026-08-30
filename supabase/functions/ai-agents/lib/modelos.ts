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
};
