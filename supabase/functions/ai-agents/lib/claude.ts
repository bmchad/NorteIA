/**
 * O provedor reserva: Claude, acionado **só** quando o Gemini responde 503.
 *
 * ⭐⭐ **A propriedade que manda no desenho deste arquivo: o fallback não pode piorar nada.**
 * Toda falha aqui dentro — chave ausente, HTTP de erro, JSON estranho, resposta vazia — vira
 * `null` e um registro no log, nunca uma exceção. Quem chama segue com o erro original do
 * Gemini, que continua sendo a verdade sobre o que aconteceu. Um plano B que introduz um modo
 * de falha novo não é plano B.
 *
 * ⭐ **Só o 503.** Cota estourada (429) e resposta malformada não melhoram trocando de
 * provedor: a primeira é um limite da conta e a segunda é um problema de prompt. Quem decide
 * isso é `classificar()`, em `gemini.ts` — o critério tem um dono só.
 *
 * ⛔ **Sem SDK.** A Messages API é estável e uma chamada `fetch` não traz versão para
 * envelhecer, nem um import remoto a mais para resolver no boot da função.
 */
import type { ArquivoInline } from './gemini.ts';
import type { Log } from '../../_shared/log.ts';

const URL_MENSAGENS = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';

/**
 * Teto de saída.
 *
 * ⚠️ Não é folga decorativa: a extração devolve um objeto JSON por transação, e um extrato de
 * seis meses passa de cem. Teto curto trunca o array no meio, `extrairArrayJson` falha, e o
 * sintoma vira `RESPOSTA_INVALIDA` — que parece erro de prompt e não é. 🔶 Se aparecer
 * `stop: "max_tokens"` no log, é aqui.
 */
const TETO_DE_SAIDA = 32000;

/** ⚠️ A Anthropic aceita jpeg, png, gif e webp — `image/jpg` não é um deles. */
const MIME_CORRIGIDO: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
};

/**
 * Os blocos de conteúdo da mensagem.
 *
 * ⭐ Anexo antes do texto, e não depois: com documento ou imagem primeiro, o modelo lê o
 * material antes da instrução sobre o que fazer com ele.
 */
function blocos(prompt: string, arquivos: ArquivoInline[]): unknown[] {
  const anexos = arquivos.map((a) => {
    const tipo = (MIME_CORRIGIDO[a.mimeType.toLowerCase()] ?? a.mimeType).toLowerCase();
    if (tipo === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: tipo, data: a.base64 } };
    }
    return { type: 'image', source: { type: 'base64', media_type: tipo, data: a.base64 } };
  });

  return [...anexos, { type: 'text', text: prompt }];
}

/**
 * Tenta o Claude. Devolve o texto cru, ou `null` se não deu — nunca lança.
 */
export async function tentarClaude(
  modelo: string,
  prompt: string,
  arquivos: ArquivoInline[] = [],
  log?: Log,
): Promise<string | null> {
  const chave = Deno.env.get('CLAUDE_API_KEY');
  if (!chave) {
    // ⚠️ Ausência de chave é configuração, não incidente: o fallback simplesmente não existe
    // para esta instalação, e o erro do Gemini segue seu caminho.
    log?.etapa('claude.sem.chave');
    return null;
  }

  log?.etapa('claude.envio', {
    modelo,
    promptChars: prompt.length,
    anexos: arquivos.length,
    anexoChars: arquivos.reduce((n, a) => n + a.base64.length, 0),
  });

  try {
    const resposta = await fetch(URL_MENSAGENS, {
      method: 'POST',
      headers: {
        'x-api-key': chave,
        'anthropic-version': VERSAO_API,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: TETO_DE_SAIDA,
        messages: [{ role: 'user', content: blocos(prompt, arquivos) }],
      }),
    });

    if (!resposta.ok) {
      // ⛔ O corpo do erro é recortado: ele pode devolver o eco do prompt, e prompt carrega
      // nome de estabelecimento e valor. Log mede, não transcreve.
      const detalhe = await resposta.text().catch(() => '');
      log?.falha('claude.http', `${resposta.status} ${detalhe.slice(0, 200)}`);
      return null;
    }

    const dados = await resposta.json();
    const texto: string = (dados?.content ?? [])
      .filter((b: { type?: string }) => b?.type === 'text')
      .map((b: { text?: string }) => b.text ?? '')
      .join('');

    if (!texto.trim()) {
      log?.falha('claude.vazio', String(dados?.stop_reason ?? 'sem stop_reason'));
      return null;
    }

    // ⚠️ `stop: "max_tokens"` aqui significa JSON cortado no meio, e o erro só vai aparecer
    // depois, como RESPOSTA_INVALIDA. Esta linha é o que liga uma coisa à outra.
    log?.etapa('claude.resposta', { chars: texto.length, stop: dados?.stop_reason });
    return texto;
  } catch (e) {
    log?.falha('claude.erro', e);
    return null;
  }
}
