import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * A memória que faz o sistema aprender com a correção do usuário.
 *
 * Depois que a IA extrai, conta como aquele mesmo `nome` já foi categorizado no histórico
 * **confirmado**. Se a categoria mais frequente aparecer 3 vezes ou mais, ela sobrescreve
 * o palpite do modelo.
 *
 * ⭐ É invisível: não há tela, aviso nem configuração. O usuário só percebe que o app
 * acerta.
 *
 * Não há tabela de contador nem trigger — a contagem é derivada de `transactions` na hora.
 * O porquê, e a medição que fechou o desenho, estão em
 * context/30-decisoes-e-licoes.md D-013.
 */

/** Quantas vezes a mesma categoria precisa ter sido confirmada para valer mais que a IA. */
const PISO = 3;

/**
 * Para cada nome, a categoria que o usuário já confirmou mais vezes — desde que tenha
 * chegado ao piso.
 *
 * ⚠️ Só os nomes do lote, nunca o histórico inteiro: é o que mantém a consulta pequena
 * quando a base crescer.
 *
 * ⚠️ A consulta usa o cliente do chamador, então a RLS já limita ao histórico do próprio
 * usuário. Não se filtra `user_id` à mão, para não criar um segundo lugar onde o
 * isolamento pode errar.
 */
export async function memoriaDeCategoria(
  supabase: SupabaseClient,
  nomes: string[],
): Promise<Map<string, string>> {
  const memoria = new Map<string, string>();

  const distintos = [...new Set(nomes.filter(n => n && n.trim()))];
  if (distintos.length === 0) return memoria;

  const { data, error } = await supabase
    .from('transactions')
    .select('nome, categoria_id')
    .eq('pendente', false)
    .in('nome', distintos)
    .not('categoria_id', 'is', null);

  // Falha aqui não pode derrubar a extração: sem memória, a sugestão da IA prevalece,
  // que é exatamente o comportamento anterior a esta feature.
  if (error || !data) {
    console.error('Memória de categoria indisponível, seguindo com a sugestão da IA:', error);
    return memoria;
  }

  // contagem[nome][categoria_id] = quantas vezes
  const contagem = new Map<string, Map<string, number>>();
  for (const linha of data) {
    const porCategoria = contagem.get(linha.nome) ?? new Map<string, number>();
    porCategoria.set(linha.categoria_id, (porCategoria.get(linha.categoria_id) ?? 0) + 1);
    contagem.set(linha.nome, porCategoria);
  }

  for (const [nome, porCategoria] of contagem) {
    let vencedora: string | null = null;
    let maior = 0;
    let empatada = false;

    for (const [categoriaId, n] of porCategoria) {
      if (n > maior) {
        maior = n;
        vencedora = categoriaId;
        empatada = false;
      } else if (n === maior) {
        empatada = true;
      }
    }

    // A mais frequente vence e o piso é 3 — não "qualquer uma acima de 3". Empate exato
    // mantém o palpite da IA, porque a memória não tem opinião formada.
    if (vencedora && maior >= PISO && !empatada) {
      memoria.set(nome, vencedora);
    }
  }

  return memoria;
}
