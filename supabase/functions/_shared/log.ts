/**
 * Log de estagio das Edge Functions.
 *
 * ⭐⭐ **Escrito para um modo de falha em que a funcao nao consegue falar.** O `546` do
 * Supabase (`WORKER_LIMIT`) nao e uma excecao: e o runtime **matando o worker** por estourar
 * memoria ou tempo de CPU. Nenhum `catch` roda, nenhum `return erro(...)` acontece, e o
 * browser recebe um status que a funcao nunca escolheu. O mesmo vale para `504`.
 *
 * ⭐ Por isso o log e **incremental**: cada etapa imprime ao ENTRAR, com o que ja se sabe.
 * A **ultima linha impressa** e o diagnostico -- ela nomeia a etapa que comecou e nao
 * terminou.
 *
 * ⛔ **Nao acumule para imprimir no fim.** Relatorio final e exatamente o que nao sobrevive
 * a um worker morto, e era o que faltava aqui.
 *
 * ⛔ **Log mede, nunca transcreve.** Tamanho, contagem, tempo e codigo -- jamais nome de
 * estabelecimento, valor, e-mail ou trecho de prompt. Os logs sao legiveis no painel do
 * Supabase, e isto e dado financeiro pessoal.
 */

/** Memoria do worker, quando o runtime expoe. Nunca derruba a chamada por causa disso. */
function memoria(): Record<string, number> | undefined {
  try {
    const m = (Deno as unknown as { memoryUsage?: () => { rss: number; heapUsed: number } }).memoryUsage?.();
    if (!m) return undefined;
    return { rssMB: Math.round(m.rss / 1048576), heapMB: Math.round(m.heapUsed / 1048576) };
  } catch {
    return undefined;
  }
}

export interface Log {
  /** Um identificador curto da chamada, para separar invocacoes concorrentes no painel. */
  readonly id: string;
  /** Imprime uma etapa. Chame ao ENTRAR nela, nao ao sair. */
  etapa(nome: string, dados?: Record<string, unknown>): void;
  /** Imprime uma falha classificada. Diferente de morrer: aqui a funcao ainda fala. */
  falha(nome: string, e: unknown): void;
}

/**
 * ⚠️ Sempre ligado, e de proposito. Sao poucas linhas por chamada, e um log que so acende
 * quando alguem lembra de acender nunca esta aceso na hora em que o defeito acontece.
 */
export function criarLog(escopo: string): Log {
  const id = Math.random().toString(36).slice(2, 8);
  const inicio = Date.now();
  let anterior = inicio;

  const linha = (nivel: 'log' | 'error', nome: string, dados?: Record<string, unknown>) => {
    const agora = Date.now();
    const carga = { ms: agora - inicio, dt: agora - anterior, ...memoria(), ...dados };
    anterior = agora;
    console[nivel](`[${escopo} ${id}] ${nome} ${JSON.stringify(carga)}`);
  };

  return {
    id,
    etapa: (nome, dados) => linha('log', nome, dados),
    falha: (nome, e) => linha('error', nome, {
      erro: e instanceof Error ? e.message : String(e),
      tipo: e instanceof Error ? e.name : typeof e,
    }),
  };
}
