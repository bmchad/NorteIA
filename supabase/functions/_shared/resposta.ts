import { corsHeaders } from './cors.ts';

/** Codigos de erro que o frontend conhece e traduz para o usuario. */
export type CodigoErro =
  | 'NAO_AUTENTICADO'
  | 'REQUISICAO_INVALIDA'
  | 'AGENTE_DESCONHECIDO'
  | 'IA_INDISPONIVEL'
  | 'COTA_EXCEDIDA'
  | 'RESPOSTA_INVALIDA'
  | 'ERRO_INTERNO';

const json = (corpo: unknown, status: number) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

export const ok = (corpo: unknown) => json(corpo, 200);

/**
 * Erro com nome. O frontend decide a mensagem pela `codigo`, nunca pelo texto -- que
 * existe so como fallback legivel.
 */
export const erro = (codigo: CodigoErro, mensagem: string, status = 400) =>
  json({ erro: { codigo, mensagem } }, status);

/** Erro de negocio ja classificado, para ser lancado de dentro de um agente. */
export class ErroDeAgente extends Error {
  constructor(readonly codigo: CodigoErro, mensagem: string, readonly status = 400) {
    super(mensagem);
    this.name = 'ErroDeAgente';
  }
}
