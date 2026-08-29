import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * O vocabulário do usuário — o que só ele sabe.
 *
 * A memória de categoria casa `nome` exato, e por isso não aprende que `PIX ELIZABETH
 * SILVA`, `PIX ELIZABETH S` e `TED ELIZABETH` são a mesma lavanderia: nenhum dos três
 * chega a 3 confirmações sozinho. Nem o texto exato nem a inferência semântica descobrem
 * isso — a informação é privada.
 *
 * ⭐ **Regra antes de nota** (D-028). A regra é substring: roda no código, custa zero token
 * e pega as três grafias de uma vez. A nota vai ao prompt e só existe para o que não é
 * mapeamento — contexto, regra de extração, condicional.
 */

export interface Regra {
  padrao: string;
  categoria_id: string | null;
  compromisso: string | null;
}

export interface Vocabulario {
  regras: Regra[];
  notas: string[];
}

export async function carregarVocabulario(supabase: SupabaseClient): Promise<Vocabulario> {
  const { data, error } = await supabase
    .from('vocabulario')
    .select('tipo, padrao, categoria_id, compromisso, texto')
    .order('criado_em');

  // Falha aqui não pode derrubar a extração: sem vocabulário, vale o que a IA decidir.
  if (error || !data) {
    console.error('Vocabulário indisponível, seguindo sem ele:', error);
    return { regras: [], notas: [] };
  }

  return {
    regras: data
      .filter(v => v.tipo === 'regra' && v.padrao)
      .map(v => ({ padrao: v.padrao, categoria_id: v.categoria_id, compromisso: v.compromisso })),
    notas: data.filter(v => v.tipo === 'nota' && v.texto).map(v => v.texto),
  };
}

/**
 * Aplica as regras sobre uma transação já normalizada.
 *
 * ⭐⭐ **Vencem tudo.** A ordem de autoridade é: o que o usuário **declarou** > o que ele
 * **confirmou** repetidamente > o que a IA **inferiu**. Uma regra é declaração explícita —
 * ele digitou "Elizabeth é lavanderia" —, então nem a memória nem o modelo a sobrepõem.
 *
 * ⚠️ A primeira regra que casa vence. Regras são ordenadas por criação, então a mais antiga
 * tem prioridade — previsível, e o usuário pode reordenar apagando e recriando.
 */
export function aplicarRegras<T extends { nome: string; categoria_id: string | null; compromisso: string | null }>(
  linhas: T[],
  regras: Regra[],
): T[] {
  if (regras.length === 0) return linhas;

  return linhas.map(linha => {
    const alvo = linha.nome.toUpperCase();
    const regra = regras.find(r => alvo.includes(r.padrao.toUpperCase().trim()));
    if (!regra) return linha;

    return {
      ...linha,
      categoria_id: regra.categoria_id ?? linha.categoria_id,
      compromisso: regra.compromisso ?? linha.compromisso,
    };
  });
}

/**
 * As notas, formatadas para o prompt.
 *
 * ⚠️ É a única parte do vocabulário que custa token, e por isso a única que precisa de
 * teto. As regras não aparecem aqui de propósito: elas já foram aplicadas no código.
 */
export function notasParaPrompt(notas: string[]): string {
  if (notas.length === 0) return '';
  return `\n\nO QUE O USUÁRIO JÁ TE ENSINOU (vale para todas as transações):\n${notas.map(n => `- ${n}`).join('\n')}`;
}
