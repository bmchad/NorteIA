import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extrairArrayJson, gerar } from '../lib/gemini.ts';
import { MODELO } from '../lib/modelos.ts';
import { exemplosPorTipo, tiposAtivos } from '../lib/compromisso.ts';
import { montarPrompt, type ParaClassificar } from '../prompts/classificar-compromisso.ts';

/**
 * O agente 2 — decide o `compromisso` de cada transação, e só isso.
 *
 * ⭐⭐ **Separado do agente 1 de propósito.** As duas tarefas pedem contextos diferentes:
 * extrair é ler um print; classificar é comparar contra um vocabulário que o usuário
 * configurou. Juntas num prompt só, o vocabulário disputava espaço com as regras de data,
 * banco e parcela — e exemplo nenhum cabia.
 *
 * ⭐ **Determinístico primeiro** (D-028): quem chama já resolveu por memória os nomes que o
 * usuário confirmou antes. Só o que sobrou nulo chega aqui. Num extrato de fatura mensal,
 * isso costuma ser um punhado de nomes novos, não a fatura inteira.
 *
 * ⚠️ Só texto, sem anexo — é a parte barata da importação. A imagem já foi lida pelo
 * agente 1 e não volta ao Gemini.
 */

export interface Requisicao {
  /** As transações a classificar. `compromisso` já preenchido é respeitado e não é tocado. */
  transacoes?: Array<Record<string, unknown>>;
}

/**
 * Preenche o `compromisso` das transações que ainda estão sem.
 *
 * ⚠️ **Nunca sobrescreve o que já veio preenchido.** Quem chegou aqui com rótulo veio da
 * memória do usuário, e ela vence o palpite do modelo.
 *
 * ⚠️ Falhar aqui não pode derrubar a importação: sem rótulo, a transação entra sem
 * compromisso e o usuário atribui à mão. Perder a fatura inteira por causa disso seria
 * trocar um problema pequeno por um grande.
 */
export async function classificarPendentes<T extends Record<string, any>>(
  supabase: SupabaseClient,
  transacoes: T[],
): Promise<T[]> {
  // Entradas não são compromisso, e o que já tem rótulo está resolvido.
  const alvos = transacoes
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !t.compromisso && Number(t.valor) < 0);

  if (alvos.length === 0) return transacoes;

  try {
    const tipos = await tiposAtivos(supabase);
    if (tipos.length === 0) return transacoes;

    const exemplos = await exemplosPorTipo(supabase, tipos.map(t => t.slug));

    const paraClassificar: ParaClassificar[] = alvos.map(({ t, i }) => ({
      i,
      nome: String(t.nome ?? ''),
      apelido: t.apelido ? String(t.apelido) : null,
      valor: Number(t.valor) || 0,
    }));

    const texto = await gerar(MODELO.CLASSIFICACAO, montarPrompt(tipos, exemplos, paraClassificar));
    const respostas = extrairArrayJson<{ i: number; compromisso: string }>(texto);

    const slugsValidos = new Set(tipos.map(t => t.slug));
    const porIndice = new Map<number, string>();
    for (const r of respostas) {
      // ⚠️ Slug inventado pelo modelo vira rótulo órfão: não casa com tipo nenhum, some da
      // tela e ainda tira a transação da camada Previsível. Barrado aqui.
      if (slugsValidos.has(r?.compromisso)) porIndice.set(Number(r.i), r.compromisso);
    }

    return transacoes.map((t, i) =>
      porIndice.has(i) ? { ...t, compromisso: porIndice.get(i)! } : t,
    );
  } catch (e) {
    console.error('Classificação de compromisso falhou; seguindo sem rótulo:', e);
    return transacoes;
  }
}

/**
 * A entrada pelo roteador, para reclassificar um lote já existente.
 *
 * ⭐ Existe separada da importação porque a lista de tipos muda depois: criar um tipo novo
 * no `/perfil` não deveria obrigar a reimportar o extrato para vê-lo aplicado.
 */
export async function classificarCompromisso(req: Requisicao, supabase: SupabaseClient) {
  const transacoes = req.transacoes ?? [];
  return { transacoes: await classificarPendentes(supabase, transacoes) };
}
