import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * O rótulo de compromisso, resolvido em duas camadas.
 *
 * ⭐ **Determinístico primeiro, IA só onde ela é necessária** (D-028):
 *
 * ```
 * nome já rotulado antes  →  reusa. Zero token, zero variação
 * nome nunca visto        →  vai para a IA, que classifica pelo contexto
 * ```
 *
 * A camada determinística é a mesma ideia de `memoria-categoria.ts`, com um campo
 * diferente. A diferença é que aqui a IA continua **necessária**: um mercado onde o usuário
 * nunca comprou não casa com nada, e só o modelo sabe que `SUPERMERCADO SAO LUIZ` é
 * supermercado.
 *
 * ⭐ É por isso que os exemplos escolhidos pelo usuário **não vão ao prompt** — os nomes
 * vivem no banco e alimentam esta consulta. O prompt carrega só o vocabulário.
 */

export interface TipoAtivo {
  slug: string;
  titulo: string;
  /**
   * Texto livre escrito pelo usuário: "todo mês", "2 vezes por semana", "todo dia 10".
   *
   * ⭐ É pista, não regra — **nenhum código interpreta este campo**. Ele existe para ser
   * lido pelo modelo, e para o modelo essas três formas são igualmente compreensíveis.
   * Estruturar o que só vira frase seria cerimônia sem ganho.
   */
  periodicidade: string | null;
  valor_mensal: number | null;
}

/**
 * Os tipos que entram no prompt.
 *
 * ⚠️ Só os `ativo`. Remover um tipo no `/perfil` tem de tirá-lo do vocabulário na
 * importação seguinte — é o que dá sentido a poder editar a lista.
 */
export async function tiposAtivos(supabase: SupabaseClient): Promise<TipoAtivo[]> {
  const { data, error } = await supabase
    .from('compromissos')
    .select('slug, titulo, periodicidade, valor_mensal')
    .eq('ativo', true)
    .order('titulo');

  if (error || !data) {
    console.error('Tipos de compromisso indisponíveis, seguindo sem rótulo:', error);
    return [];
  }
  return data as TipoAtivo[];
}

/**
 * Para cada nome do lote, o rótulo que ele já recebeu antes.
 *
 * ⚠️ **Atribuição manual vence.** Se o usuário pôs ou tirou aquela transação de um
 * compromisso à mão, a decisão dele é a verdade — e é por isso que `compromisso_manual`
 * ordena o resultado. Sem isso, a detecção devolve o que ele tirou.
 *
 * ⚠️ Só os nomes do lote, nunca o histórico inteiro: é o que mantém a consulta pequena.
 * A RLS já limita ao histórico do próprio usuário; não se filtra `user_id` à mão, para não
 * criar um segundo lugar onde o isolamento pode errar.
 */
export async function memoriaDeCompromisso(
  supabase: SupabaseClient,
  nomes: string[],
): Promise<Map<string, string>> {
  const memoria = new Map<string, string>();

  const distintos = [...new Set(nomes.filter(n => n && n.trim()))];
  if (distintos.length === 0) return memoria;

  const { data, error } = await supabase
    .from('transactions')
    .select('nome, compromisso, compromisso_manual')
    .in('nome', distintos)
    .not('compromisso', 'is', null)
    .order('compromisso_manual', { ascending: false });

  // Falha aqui não pode derrubar a extração: sem memória, o rótulo da IA prevalece.
  if (error || !data) {
    console.error('Memória de compromisso indisponível, seguindo com o rótulo da IA:', error);
    return memoria;
  }

  // `order` põe as manuais primeiro, e o primeiro de cada nome vence.
  for (const linha of data) {
    if (!memoria.has(linha.nome)) memoria.set(linha.nome, linha.compromisso);
  }

  return memoria;
}

/**
 * O trecho de vocabulário que vai no prompt.
 *
 * ⚠️ Carrega **título e características**, nunca as transações de exemplo. É o que impede o
 * prompt de crescer com o histórico: vinte e cinco tipos são vinte e cinco linhas curtas,
 * independentemente de quantas transações cada um já acumulou.
 */
export function vocabularioParaPrompt(tipos: TipoAtivo[]): string {
  if (tipos.length === 0) return '';

  const linhas = tipos.map(t => {
    const pistas: string[] = [];
    if (t.periodicidade?.trim()) pistas.push(t.periodicidade.trim());
    if (t.valor_mensal) pistas.push(`cerca de R$ ${Number(t.valor_mensal).toFixed(2)} por mês`);
    return `- "${t.slug}": ${t.titulo}${pistas.length ? ` (${pistas.join(', ')})` : ''}`;
  });

  return `\n      - "compromisso": Se a transação for uma despesa recorrente ou previsível, classifique-a em UM dos tipos abaixo, devolvendo o slug exato. Se nenhum se aplicar, retorne null. Julgue pelo estabelecimento: uma compra em qualquer supermercado é "supermercado", um abastecimento em qualquer posto é "combustivel".\n${linhas.join('\n')}`;
}
