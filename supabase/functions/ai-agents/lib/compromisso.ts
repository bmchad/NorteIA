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
 * ⭐ A camada determinística é o que mantém o prompt pequeno: num extrato mensal, a maior
 * parte dos nomes já foi vista, e só os novos chegam ao modelo.
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
 * As transações que o usuário apontou como exemplo de cada tipo, já em texto.
 *
 * ⭐ **O exemplo é o que o vocabulário sozinho não dá.** "Elizabeth" não parece lavanderia
 * para ninguém, e nenhuma descrição de tipo resolve isso — uma linha de exemplo resolve.
 *
 * ⛔ O teto de 10 por tipo é o que impede o prompt de crescer com o histórico. Ele é
 * imposto pelo banco (trigger `teto_exemplos`); aqui só se lê o que já está lá.
 */
export async function exemplosPorTipo(
  supabase: SupabaseClient,
  slugs: string[],
): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (slugs.length === 0) return mapa;

  const { data, error } = await supabase
    .from('compromisso_exemplos')
    .select('slug, transactions(nome, apelido)')
    .in('slug', slugs);

  // Sem exemplos o vocabulário ainda funciona; falhar aqui não pode derrubar a importação.
  if (error || !data) {
    console.error('Exemplos de compromisso indisponíveis, seguindo só com o vocabulário:', error);
    return mapa;
  }

  for (const linha of data as any[]) {
    const t = linha.transactions;
    const nome = String(t?.apelido || t?.nome || '').trim();
    if (!nome) continue;
    const lista = mapa.get(linha.slug) ?? [];
    if (!lista.includes(nome)) lista.push(nome);
    mapa.set(linha.slug, lista);
  }
  return mapa;
}
