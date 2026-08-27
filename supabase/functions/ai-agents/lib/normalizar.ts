/**
 * O que acontece com a resposta da IA antes de virar linha de `transactions`.
 *
 * Nada aqui e IA: sao as duas regras de negocio que sempre correram em JavaScript depois
 * da extracao, e que agora correm do lado do servidor junto com ela.
 */

/** Uma transacao como a IA a devolve, antes de qualquer tratamento. */
export interface TransacaoBruta {
  data?: string | null;
  nome?: string | null;
  apelido?: string | null;
  valor?: number | null;
  banco?: string | null;
  mes_fatura?: string | null;
  hora?: string | null;
  parcela_atual?: number | null;
  parcela_total?: number | null;
  categoria_sugerida?: string | null;
}

/** Uma linha pronta para insert. Falta so o `user_id`, que o frontend acrescenta. */
export interface TransacaoNormalizada {
  data: string;
  nome: string;
  apelido: string | null;
  valor: number;
  banco: string | null;
  mes_fatura: string | null;
  categoria_id: string | null;
  hora: string;
  parcela_atual: number | null;
  parcela_total: number | null;
  pendente: true;
}

export interface Categoria {
  id: string;
  nome: string;
}

/**
 * Desloca a data da parcela para o mes em que ela e cobrada: uma compra de Janeiro na
 * parcela 3 e registrada em Marco.
 *
 * So entra no sistema o que ja foi cobrado -- por isso cada parcela vira um registro
 * quando aparece no extrato, em vez de as N serem geradas de uma vez.
 * Ver context/30-decisoes-e-licoes.md D-003.
 */
function deslocarParcela(data: string, parcelaAtual?: number | null, parcelaTotal?: number | null): string {
  if (!parcelaTotal || !parcelaAtual) return data;
  const [ano, mes, dia] = data.split('-');
  if (!ano || !mes || !dia) return data;

  const d = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
  d.setMonth(d.getMonth() + parcelaAtual - 1);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Casa a sugestao da IA com uma categoria real do usuario, ignorando maiusculas. */
function casarCategoria(sugerida: string | null | undefined, categorias: Categoria[]): string | null {
  if (!sugerida) return null;
  const alvo = sugerida.toLowerCase().trim();
  return categorias.find((c) => c.nome.toLowerCase() === alvo)?.id ?? null;
}

/**
 * Aplica as duas regras e descarta o que nao serve.
 *
 * Uma transacao sem data, sem nome ou sem valor e ignorada por inteiro. O prompt ja pede
 * isso, mas nada garante que a IA obedeca -- e registro pela metade contamina o total do
 * ciclo, a pizza da categoria e o resultado anual de uma vez.
 */
export function normalizar(brutas: TransacaoBruta[], categorias: Categoria[]): TransacaoNormalizada[] {
  const linhas: TransacaoNormalizada[] = [];

  for (const t of brutas) {
    if (!t.data || !t.nome || t.valor === null || t.valor === undefined || isNaN(Number(t.valor))) continue;

    linhas.push({
      data: deslocarParcela(t.data, t.parcela_atual, t.parcela_total),
      nome: t.nome,
      apelido: t.apelido ?? null,
      valor: Number(t.valor),
      banco: t.banco ?? null,
      mes_fatura: t.mes_fatura ?? null,
      categoria_id: casarCategoria(t.categoria_sugerida, categorias),
      hora: t.hora ?? '12:00:00',
      parcela_atual: t.parcela_atual ?? null,
      parcela_total: t.parcela_total ?? null,
      pendente: true,
    });
  }

  return linhas;
}
