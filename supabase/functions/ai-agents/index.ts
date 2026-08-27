import { tratarPreflight } from '../_shared/cors.ts';
import { erro, ErroDeAgente, ok } from '../_shared/resposta.ts';
import { clienteDoUsuario } from '../_shared/supabase.ts';
import { extrairTransacoes } from './agentes/extrair-transacoes.ts';

/**
 * `ai-agents` — a porta única de todas as chamadas de agente de IA.
 *
 * Nenhuma tela fala com o Gemini. A chave vive aqui, como secret do servidor, e o browser
 * só sabe pedir um agente pelo nome. Agente novo é um arquivo em `agentes/` e uma linha no
 * roteador abaixo — não uma Edge Function nova, com deploy, CORS e auth próprios.
 * Ver context/30-decisoes-e-licoes.md D-012.
 *
 * Contrato: POST com `Authorization: Bearer <access_token>` e
 *   { "agente": "extrair-transacoes", ...campos do agente }
 */

type Agente = (corpo: Record<string, unknown>, supabase: ReturnType<typeof clienteDoUsuario>) => Promise<unknown>;

const AGENTES: Record<string, Agente> = {
  'extrair-transacoes': extrairTransacoes as Agente,
};

Deno.serve(async (req: Request) => {
  const preflight = tratarPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return erro('REQUISICAO_INVALIDA', 'Use POST.', 405);
  }

  try {
    const supabase = clienteDoUsuario(req);

    // `verify_jwt` já barra chamada sem token; isto garante que o token corresponde a um
    // usuário existente antes de qualquer trabalho caro.
    const { data: { user }, error: erroAuth } = await supabase.auth.getUser();
    if (erroAuth || !user) {
      return erro('NAO_AUTENTICADO', 'Sessão inválida ou expirada. Entre novamente.', 401);
    }

    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return erro('REQUISICAO_INVALIDA', 'Corpo da requisição não é um JSON válido.');
    }

    const nome = String(corpo.agente ?? '');
    const agente = AGENTES[nome];
    if (!agente) {
      return erro('AGENTE_DESCONHECIDO', `Agente "${nome}" não existe. Disponíveis: ${Object.keys(AGENTES).join(', ')}.`, 404);
    }

    return ok(await agente(corpo, supabase));
  } catch (e) {
    if (e instanceof ErroDeAgente) {
      return erro(e.codigo, e.message, e.status);
    }
    console.error('Falha não classificada em ai-agents:', e);
    return erro('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
  }
});
