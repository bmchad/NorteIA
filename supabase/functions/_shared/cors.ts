/**
 * Cabecalhos de CORS. As funcoes deste projeto sao chamadas pelo browser, entao toda
 * resposta precisa carrega-los -- inclusive as de erro, senao o erro chega ao cliente
 * como falha de CORS e a mensagem real se perde.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Responde ao preflight. Devolve null quando a requisicao nao e um OPTIONS. */
export function tratarPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
