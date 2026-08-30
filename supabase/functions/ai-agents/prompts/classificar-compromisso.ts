import type { TipoAtivo } from '../lib/compromisso.ts';

/**
 * O prompt do agente 2 — classificar compromisso, e nada mais.
 *
 * ⭐⭐ Existe separado porque extrair e classificar pedem contextos diferentes e brigavam
 * pelo mesmo prompt. Extrair é ler o que está escrito; classificar é comparar contra um
 * vocabulário que o usuário configurou. Num prompt só, o vocabulário disputava espaço com
 * as regras de data, banco e parcela — e não cabia exemplo nenhum.
 *
 * ⭐ Aqui não há imagem nem PDF: entra texto, sai texto. É a parte barata da importação, e
 * é por isso que dá para carregar o vocabulário inteiro com exemplos.
 */

/** Uma transação a classificar, reduzida ao que importa para a decisão. */
export interface ParaClassificar {
  i: number;
  nome: string;
  apelido?: string | null;
  valor: number;
}

/**
 * O vocabulário, tipo a tipo, com os exemplos que o usuário apontou.
 *
 * ⚠️ O exemplo é o que o vocabulário sozinho não dá: "Elizabeth" não parece lavanderia para
 * ninguém, e nenhuma descrição de tipo resolve isso. Uma linha de exemplo resolve.
 */
export function vocabularioComExemplos(
  tipos: TipoAtivo[],
  exemplos: Map<string, string[]>,
): string {
  return tipos.map(t => {
    const pistas: string[] = [];
    if (t.periodicidade?.trim()) pistas.push(t.periodicidade.trim());
    if (t.valor_mensal) pistas.push(`cerca de R$ ${Number(t.valor_mensal).toFixed(2)} por mês`);

    const linha = `- "${t.slug}": ${t.titulo}${pistas.length ? ` (${pistas.join(', ')})` : ''}`;
    const meus = exemplos.get(t.slug) ?? [];
    if (meus.length === 0) return linha;

    return `${linha}\n    exemplos do usuário: ${meus.join('; ')}`;
  }).join('\n');
}

export function montarPrompt(
  tipos: TipoAtivo[],
  exemplos: Map<string, string[]>,
  transacoes: ParaClassificar[],
): string {
  const linhas = transacoes
    .map(t => `${t.i}. ${t.nome}${t.apelido && t.apelido !== t.nome ? ` (${t.apelido})` : ''} — R$ ${Math.abs(t.valor).toFixed(2)}`)
    .join('\n');

  return `Você classifica despesas em tipos de compromisso previamente definidos pelo usuário.

TIPOS DISPONÍVEIS:
${vocabularioComExemplos(tipos, exemplos)}

TRANSAÇÕES A CLASSIFICAR:
${linhas}

REGRAS:
1. Julgue pelo estabelecimento, não pelo valor: uma compra em qualquer supermercado é do tipo de supermercado, um abastecimento em qualquer posto é do tipo de combustível.
2. Os "exemplos do usuário" são decisões dele e valem mais que a sua intuição sobre o nome. Se uma transação se parece com um exemplo, use aquele tipo.
3. Só classifique quando tiver confiança. Uma transação que não é claramente de nenhum tipo deve ficar de fora — rótulo errado é pior que rótulo ausente, porque o usuário confia no total.
4. Use exatamente o slug entre aspas, nunca o título.

Retorne APENAS um JSON válido: um array com as transações que você conseguiu classificar, no formato [{"i": <número da transação>, "compromisso": "<slug>"}]. Omita as que não se encaixam em nenhum tipo. Se nenhuma se encaixar, retorne [].
Não use blocos de código nem markdown.`;
}
