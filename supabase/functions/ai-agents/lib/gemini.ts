import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { ErroDeAgente } from '../../_shared/resposta.ts';

/** Um arquivo enviado ao modelo como conteudo inline. */
export interface ArquivoInline {
  mimeType: string;
  base64: string;
}

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

/** Envia o prompt e os arquivos ao modelo e devolve o texto cru da resposta. */
export async function gerar(modelo: string, prompt: string, arquivos: ArquivoInline[] = []): Promise<string> {
  const genAI = new GoogleGenerativeAI(chave());
  const model = genAI.getGenerativeModel({ model: modelo });
  const partes = [prompt, ...arquivos.map((a) => ({ inlineData: { data: a.base64, mimeType: a.mimeType } }))];

  try {
    const resultado = await model.generateContent(partes);
    return resultado.response.text();
  } catch (e) {
    throw classificar(e);
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
