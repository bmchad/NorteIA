import { tratarPreflight } from '../_shared/cors.ts';
import { erro, ErroDeAgente, ok } from '../_shared/resposta.ts';
import { clienteDoUsuario } from '../_shared/supabase.ts';
import { criarLog, type Log } from '../_shared/log.ts';
import { extrairTransacoes } from './agentes/extrair-transacoes.ts';
import { classificarCompromisso } from './agentes/classificar-compromisso.ts';

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

type Agente = (
  corpo: Record<string, unknown>,
  supabase: ReturnType<typeof clienteDoUsuario>,
  log: Log,
) => Promise<unknown>;

const AGENTES: Record<string, Agente> = {
  'extrair-transacoes': extrairTransacoes as Agente,
  // ⚠️ A importação já chama a classificação por dentro. Esta entrada existe para
  // reclassificar um lote depois — criar um tipo novo no /perfil não deveria obrigar a
  // reimportar o extrato para vê-lo aplicado.
  'classificar-compromisso': classificarCompromisso as Agente,
};

Deno.serve(async (req: Request) => {
  const preflight = tratarPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return erro('REQUISICAO_INVALIDA', 'Use POST.', 405);
  }

  const log = criarLog('ai-agents');
  // ⭐ `content-length` em vez de medir o corpo depois de ler: e o numero que importa (bytes
  // na rede) e nao custa uma copia. Ler o corpo como texto so para medi-lo dobraria o pico
  // de memoria justamente na chamada que se suspeita de estourar memoria.
  log.etapa('inicio', { bytes: Number(req.headers.get('content-length') ?? 0) });

  try {
    const supabase = clienteDoUsuario(req);

    // `verify_jwt` já barra chamada sem token; isto garante que o token corresponde a um
    // usuário existente antes de qualquer trabalho caro.
    const { data: { user }, error: erroAuth } = await supabase.auth.getUser();
    if (erroAuth || !user) {
      log.falha('auth', erroAuth ?? 'sem usuário');
      return erro('NAO_AUTENTICADO', 'Sessão inválida ou expirada. Entre novamente.', 401);
    }
    log.etapa('auth.ok');

    let corpo: Record<string, unknown>;
    try {
      // ⚠️ Etapa impressa ANTES do parse: um corpo grande morre AQUI, e a linha
      // "corpo.parse.inicio" sem a "corpo.parse.fim" logo abaixo e a assinatura disso.
      log.etapa('corpo.parse.inicio');
      corpo = await req.json();
      log.etapa('corpo.parse.fim');
    } catch (e) {
      log.falha('corpo.parse', e);
      return erro('REQUISICAO_INVALIDA', 'Corpo da requisição não é um JSON válido.');
    }

    const nome = String(corpo.agente ?? '');
    const agente = AGENTES[nome];
    if (!agente) {
      log.falha('agente.desconhecido', nome);
      return erro('AGENTE_DESCONHECIDO', `Agente "${nome}" não existe. Disponíveis: ${Object.keys(AGENTES).join(', ')}.`, 404);
    }

    log.etapa('agente.inicio', { agente: nome });
    const resposta = await agente(corpo, supabase, log);
    log.etapa('agente.fim');
    return ok(resposta);
  } catch (e) {
    if (e instanceof ErroDeAgente) {
      log.falha('erro.classificado', e);
      return erro(e.codigo, e.message, e.status);
    }
    log.falha('erro.nao.classificado', e);
    return erro('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
  }
});
