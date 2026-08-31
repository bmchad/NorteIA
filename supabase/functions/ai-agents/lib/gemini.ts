import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { ErroDeAgente } from '../../_shared/resposta.ts';
import type { Log } from '../../_shared/log.ts';
import { tentarClaude } from './claude.ts';
import { MODELO } from './modelos.ts';

/** Um arquivo enviado ao modelo como conteudo inline. */
export interface ArquivoInline {
  mimeType: string;
  base64: string;
}

/**
 * ⭐⭐ **O orçamento de relógio da requisição inteira, e a razão de ele existir.**
 *
 * Uma chamada que cai no reserva paga **dois** modelos: o que falhou e o que assumiu. A Edge
 * Function tem um teto de tempo dimensionado para um. Estourá-lo não devolve erro — o runtime
 * **mata o worker** (`546`), o `catch` não roda, e o browser recebe um status que a função
 * nunca escolheu. ⛔ Era exatamente isto que acontecia: `gemini.erro` (503), `claude.envio`, e
 * nada mais — com a chamada já faturada do outro lado.
 *
 * ⭐ Então o tempo se **orça**, em vez de se torcer: o primário tem prazo, o reserva recebe o
 * que sobrou, e se não sobrou o bastante ele nem começa. Melhor um `503` com mensagem na tela
 * que um `546` mudo.
 *
 * 🔶 Os números supõem o teto conservador de 150 s. Com um teto maior dá para subir os dois.
 */
const ORCAMENTO_MS = 140_000;

/** Abaixo disto o reserva não tem como terminar, então nem tenta. */
const MINIMO_DO_RESERVA_MS = 40_000;

/** Prazo do primário — o resto do orçamento fica reservado para o plano B. */
const PRAZO_PRIMARIO_MS = ORCAMENTO_MS - MINIMO_DO_RESERVA_MS;

const chave = () => {
  const k = Deno.env.get('GEMINI_API_KEY');
  if (!k) throw new ErroDeAgente('ERRO_INTERNO', 'GEMINI_API_KEY nao configurada na funcao.', 500);
  return k;
};

/**
 * Traduz a falha do provedor para um codigo que o frontend sabe mostrar. 429 e 503 sao
 * transitorios e merecem mensagem diferente de erro real -- foi o 503 aparecendo como
 * `alert()` de texto cru que motivou isto.
 */
function classificar(e: unknown): ErroDeAgente {
  const texto = e instanceof Error ? e.message : String(e);
  if (/\b429\b|quota|rate.?limit/i.test(texto)) {
    return new ErroDeAgente('COTA_EXCEDIDA', 'A cota da IA foi excedida. Tente mais tarde.', 429);
  }
  if (/\b(500|502|503|504)\b|overloaded|unavailable/i.test(texto)) {
    return new ErroDeAgente('IA_INDISPONIVEL', 'O servidor da IA esta indisponivel. Tente novamente em instantes.', 503);
  }
  return new ErroDeAgente('ERRO_INTERNO', texto, 500);
}

/**
 * Envia o prompt e os arquivos ao modelo e devolve o texto cru da resposta.
 *
 * ⭐⭐ **E a porta unica de geracao dos dois agentes** — por isso o fallback mora aqui, e nao
 * em cada um deles. 🔶 O nome do arquivo ficou mais estreito do que o papel: `gemini.ts`
 * agora orquestra dois provedores.
 *
 * ⚠️ **O ponto mais caro da funcao, e o mais provavel de morrer sem falar.** O SDK serializa
 * o base64 inteiro num corpo JSON: com anexo grande, o pico de memoria aqui e multiplo do
 * tamanho do arquivo. Dai as duas etapas em volta -- ver `_shared/log.ts`.
 */
export async function gerar(
  modelo: string,
  prompt: string,
  arquivos: ArquivoInline[] = [],
  log?: Log,
): Promise<string> {
  const inicio = Date.now();
  const genAI = new GoogleGenerativeAI(chave());
  // ⚠️ O `timeout` não é zelo: sem prazo, o primário pode consumir o orçamento inteiro e o
  // reserva começa condenado — que é como o worker morria.
  const model = genAI.getGenerativeModel({ model: modelo }, { timeout: PRAZO_PRIMARIO_MS });
  const partes = [prompt, ...arquivos.map((a) => ({ inlineData: { data: a.base64, mimeType: a.mimeType } }))];

  log?.etapa('gemini.envio', {
    modelo,
    promptChars: prompt.length,
    anexos: arquivos.length,
    anexoChars: arquivos.reduce((n, a) => n + a.base64.length, 0),
  });

  try {
    const resultado = await model.generateContent(partes);
    const texto = resultado.response.text();
    log?.etapa('gemini.resposta', { chars: texto.length });
    return texto;
  } catch (e) {
    // ⚠️ Id de modelo invalido chega aqui como 404 do provedor, e nao em build nem em tsc.
    // Sem esta linha ele viraria um ERRO_INTERNO generico. → P33
    log?.falha('gemini.erro', e);
    const classificado = classificar(e);

    // ⭐ **So o 503.** `classificar` ja e o dono do criterio: 429 e limite da conta e
    // resposta malformada e problema de prompt — nenhum dos dois melhora trocando de
    // provedor, e tentar de novo neles so gasta tempo e token.
    //
    // ⭐ `tentarClaude` nunca lanca: devolve `null` quando nao deu, e ai o erro ORIGINAL do
    // Gemini e que sobe. O fallback nao pode introduzir um modo de falha novo.
    if (classificado.codigo === 'IA_INDISPONIVEL') {
      // ⭐ O reserva herda o que sobrou do orçamento, e não um prazo próprio: quem gastou o
      // relógio foi a tentativa anterior, e ignorar isso é o que estoura o teto da função.
      const restante = ORCAMENTO_MS - (Date.now() - inicio);
      if (restante < MINIMO_DO_RESERVA_MS) {
        log?.etapa('fallback.sem.tempo', { restante, minimo: MINIMO_DO_RESERVA_MS });
        throw classificado;
      }

      const reserva = await tentarClaude(MODELO.FALLBACK, prompt, arquivos, log, restante);
      if (reserva !== null) {
        log?.etapa('fallback.usado', { de: modelo, para: MODELO.FALLBACK });
        return reserva;
      }
    }

    throw classificado;
  }
}

/**
 * Recorta o array JSON da resposta. O modelo costuma cercar o JSON de texto, e as vezes
 * de blocos markdown, apesar de o prompt pedir o contrario.
 */
export function extrairArrayJson<T = unknown>(texto: string): T[] {
  const inicio = texto.indexOf('[');
  const fim = texto.lastIndexOf(']');
  if (inicio === -1 || fim === -1 || fim <= inicio) {
    throw new ErroDeAgente('RESPOSTA_INVALIDA', 'A IA nao devolveu um JSON valido.', 502);
  }
  try {
    const valor = JSON.parse(texto.substring(inicio, fim + 1));
    if (!Array.isArray(valor)) throw new Error('nao e array');
    return valor as T[];
  } catch {
    throw new ErroDeAgente('RESPOSTA_INVALIDA', 'A IA devolveu um JSON malformado.', 502);
  }
}
