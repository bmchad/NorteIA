/**
 * O que acontece com a resposta da IA antes de virar linha de `transactions`.
 *
 * Nada aqui e IA: sao as regras de negocio que sempre correram em JavaScript depois da
 * extracao, e que agora correm do lado do servidor junto com ela.
 *
 * ⚠️ "Normalizar" aqui e sobre a transacao -- deslocamento de parcela e casamento de
 * categoria. Nao confundir com normalizacao de NOME, que foi deliberadamente descartada:
 * o agrupamento da memoria usa o `nome` cru. Ver context/30-decisoes-e-licoes.md D-013.
 */
import { BANCOS } from './bancos.ts';

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
  compromisso?: string | null;
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
  compromisso: string | null;
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
 * Minusculas, sem acento e sem espaco nas pontas. "Itaú " e "ITAU" dao a mesma chave.
 *
 * ⚠️ A faixa vai como escape (`\u0300-\u036f`), e nao com os caracteres combinantes
 * literais: eles sao invisiveis no editor, e uma copia que os perca deixa a funcao com cara de
 * correta enquanto para de tirar acento.
 */
const chave = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Casa a resposta da IA com um banco real da lista, e devolve o valor CANONICO dela.
 *
 * ⭐⭐ **Contraparte que faltava.** O prompt manda "DEVE obrigatoriamente ser um destes valores
 * exatos" e passa `listaDeBancos()` -- mas isso e instrucao, nao validacao, e ate 2026-09-03 nada
 * conferia a volta: a linha era `banco: t.banco ?? null`, repasse puro. O Postgres tambem nao
 * confere, porque a `chk_banco` foi derrubada de proposito (D-011). `casarCategoria`, dez linhas
 * acima, ja fazia exatamente isto para `categoria_sugerida`; `banco` era o unico campo com lista
 * fechada e sem quem a checasse.
 *
 * ⭐ Devolver o valor **canonico** e o ponto, nao so aceitar ou recusar: "Itau" e "ITAÚ" viram
 * `Itaú`, um so. Quem consome casa `vencimentos.banco` com `transactions.banco` por igualdade, e
 * duas grafias do mesmo banco partiriam a fatura em dois.
 *
 * ⚠️ Ficou MAIS necessario com a mudanca do modo planilha, nao menos: ali se pede ao modelo que
 * mapeie o texto livre do usuario para a lista, que e justamente onde ele erra.
 *
 * ⛔ Fora da lista vira `null`, nao o texto cru. E o que o proprio prompt ja manda quando nao da
 * para deduzir, e guardar um nome inventado seria pior que guardar nada: ele apareceria no /perfil
 * como um banco a configurar.
 */
function casarBanco(sugerido: string | null | undefined): string | null {
  if (!sugerido) return null;
  const alvo = chave(sugerido);
  if (!alvo) return null;
  return BANCOS.find((b) => chave(b) === alvo) ?? null;
}

/**
 * Aplica as duas regras e descarta o que nao serve.
 *
 * Uma transacao sem data, sem nome ou sem valor e ignorada por inteiro. O prompt ja pede
 * isso, mas nada garante que a IA obedeca -- e registro pela metade contamina o total do
 * ciclo, a pizza da categoria e o resultado anual de uma vez.
 */
export function normalizar(
  brutas: TransacaoBruta[],
  categorias: Categoria[],
  memoria: Map<string, string> = new Map(),
  memoriaCompromisso: Map<string, string> = new Map(),
): TransacaoNormalizada[] {
  const linhas: TransacaoNormalizada[] = [];

  for (const t of brutas) {
    if (!t.data || !t.nome || t.valor === null || t.valor === undefined || isNaN(Number(t.valor))) continue;

    // A memória do usuário vence o palpite da IA: ela é a categoria que ele já confirmou
    // 3 vezes ou mais para este mesmo nome. Ver lib/memoria-categoria.ts.
    const categoriaId = memoria.get(t.nome) ?? casarCategoria(t.categoria_sugerida, categorias);

    linhas.push({
      data: deslocarParcela(t.data, t.parcela_atual, t.parcela_total),
      nome: t.nome,
      apelido: t.apelido ?? null,
      valor: Number(t.valor),
      banco: casarBanco(t.banco),
      mes_fatura: t.mes_fatura ?? null,
      categoria_id: categoriaId,
      hora: t.hora ?? '12:00:00',
      parcela_atual: t.parcela_atual ?? null,
      parcela_total: t.parcela_total ?? null,
      pendente: true,
      // O rótulo que o nome já recebeu vence o da IA: é determinístico e estável, e
      // atribuição manual do usuário está na frente da fila. Ver lib/compromisso.ts.
      compromisso: memoriaCompromisso.get(t.nome) ?? t.compromisso ?? null,
    });
  }

  return linhas;
}
