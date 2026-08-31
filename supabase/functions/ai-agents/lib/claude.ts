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
 *
 * ⚠️ **Mas teto alto custa relógio**, e o relógio aqui é compartilhado com a tentativa que já
 * falhou no Gemini. 16 mil cobre com folga um extrato de seis meses (~6 mil na medição do
 * `.csv` de demonstração) sem autorizar uma geração de minutos.
 */
const TETO_DE_SAIDA = 16000;

/**
 * Acima disto o anexo NÃO vai para o reserva.
 *
 * ⛔⛔ **O reenvio é o que dobra o pico de memória.** Na tentativa do Gemini o base64 já foi
 * serializado uma vez num corpo JSON; montar o corpo do Claude serializa o MESMO base64 de
 * novo, na mesma requisição, com a primeira cópia possivelmente ainda viva. É assim que uma
 * importação de print grande sai de "provedor fora do ar" para **worker morto por limite**
 * (`546`) — e o 546 é pior que o 503, porque o 503 tem mensagem traduzida na tela e o 546 não
 * chega nem a passar pelo `catch` da função.
 *
 * ⭐ Então o reserva se recusa, de propósito, no caso pesado. Perder o plano B vale menos que
 * transformar um erro explicado num erro mudo.
 */
const LIMITE_DE_ANEXO = 3 * 1024 * 1024;

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

  const anexoChars = arquivos.reduce((n, a) => n + a.base64.length, 0);
  if (anexoChars > LIMITE_DE_ANEXO) {
    log?.etapa('claude.anexo.grande', { anexoChars, limite: LIMITE_DE_ANEXO });
    return null;
  }

  log?.etapa('claude.envio', { modelo, promptChars: prompt.length, anexos: arquivos.length, anexoChars });

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
        // ⭐ Streaming, e não por elegância: numa resposta longa a chamada sem stream segura
        // a conexão aberta até o último token e o provedor recusa pedidos assim. Lendo por
        // pedaços, o texto se acumula progressivamente e nada fica pendurado.
        stream: true,
        messages: [{ role: 'user', content: blocos(prompt, arquivos) }],
      }),
    });

    if (!resposta.ok || !resposta.body) {
      // ⛔ O corpo do erro é recortado: ele pode devolver o eco do prompt, e prompt carrega
      // nome de estabelecimento e valor. Log mede, não transcreve.
      const detalhe = await resposta.text().catch(() => '');
      log?.falha('claude.http', `${resposta.status} ${detalhe.slice(0, 200)}`);
      return null;
    }

    const { texto, motivo } = await lerStream(resposta.body);

    if (!texto.trim()) {
      log?.falha('claude.vazio', motivo ?? 'sem stop_reason');
      return null;
    }

    // ⚠️ `stop: "max_tokens"` aqui significa JSON cortado no meio, e o erro só vai aparecer
    // depois, como RESPOSTA_INVALIDA. Esta linha é o que liga uma coisa à outra.
    log?.etapa('claude.resposta', { chars: texto.length, stop: motivo });
    return texto;
  } catch (e) {
    log?.falha('claude.erro', e);
    return null;
  }
}

/**
 * Junta os pedaços do SSE num texto só.
 *
 * O formato é `data: {json}` por linha, e só interessam dois eventos: `content_block_delta`,
 * que traz um trecho de texto, e `message_delta`, que traz o `stop_reason` no fim.
 *
 * ⚠️ Um pedaço da rede não respeita fronteira de linha: a última linha incompleta fica no
 * `resto` e só é processada quando o pedaço seguinte a completa. Sem isso, um JSON cortado ao
 * meio viraria erro de parse a cada leitura, e o texto sairia com buracos.
 */
async function lerStream(corpo: ReadableStream<Uint8Array>): Promise<{ texto: string; motivo: string | null }> {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  const partes: string[] = [];
  let motivo: string | null = null;
  let resto = '';

  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;

    resto += decodificador.decode(value, { stream: true });
    const linhas = resto.split('\n');
    resto = linhas.pop() ?? '';

    for (const linha of linhas) {
      if (!linha.startsWith('data:')) continue;
      try {
        const evento = JSON.parse(linha.slice(5).trim());
        if (evento?.type === 'content_block_delta' && typeof evento?.delta?.text === 'string') {
          partes.push(evento.delta.text);
        } else if (evento?.type === 'message_delta' && evento?.delta?.stop_reason) {
          motivo = String(evento.delta.stop_reason);
        }
      } catch {
        // Linha de keep-alive ou evento sem JSON: não é erro, é o protocolo.
      }
    }
  }

  return { texto: partes.join(''), motivo };
}
