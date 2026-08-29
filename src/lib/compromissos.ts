/**
 * Compromisso: dinheiro que já tem dono antes de você decidir qualquer coisa.
 *
 * Este módulo é o dono de duas coisas — a lista semente de tipos e a agregação por rótulo.
 * O cálculo mora aqui, e não dentro da tela, porque o painel de `/compromissos` e o card do
 * Dashboard somam exatamente estes números. Tela calculando por conta própria foi o que
 * fez o Dashboard e o `/meses` discordarem por um ano (D-007).
 */

/** Quantas transações rotuladas até uma proposta aparecer. ⭐ O mesmo 3 de todo o produto. */
export const PISO_COMPROMISSO = 3;

/** Teto de tipos que entram no prompt. Acima disso o modelo começa a forçar encaixe. */
export const TETO_TIPOS_ATIVOS = 25;

export interface TipoSemente {
  slug: string;
  titulo: string;
}

/**
 * Os tipos semeados no primeiro acesso.
 *
 * ⚠️ **É semente, não fonte da verdade.** Depois do primeiro acesso a lista é do usuário,
 * editada no `/perfil`. Acrescentar um tipo aqui NÃO alcança quem já usa o app — é o mesmo
 * comportamento das 27 categorias padrão.
 *
 * O que entra passa por três testes, todos estruturais — o produto é horizontal, então a
 * lista se justifica pelo que vale para pessoas em geral e nunca pelo extrato de alguém:
 *
 * 1. É obrigação ou necessidade recorrente para a maioria?
 * 2. O nome do estabelecimento varia enquanto a natureza não? (Se o nome fosse estável, a
 *    detecção por nome e valor já resolveria.)
 * 3. ⭐ Um punhado de marcas domina, ou o nome é reconhecível? É o teste que decide —
 *    categoria que o modelo não infere pelo nome é inútil aqui.
 *
 * ⛔ Fora, e o motivo vale a regra: `restaurante`, `entretenimento`, `viagem`, `vestuario`.
 * Neles o nome varia E a natureza varia junto — é gasto disperso, não compromisso.
 * `delivery` entra e `restaurante` não porque no delivery duas ou três marcas cobrem quase
 * tudo.
 */
export const TIPOS_SEMENTE: TipoSemente[] = [
  { slug: 'aluguel', titulo: 'Aluguel' },
  { slug: 'condominio', titulo: 'Condomínio' },
  { slug: 'utilidades', titulo: 'Água, luz e gás' },
  { slug: 'internet_telefone', titulo: 'Internet e telefone' },
  { slug: 'supermercado', titulo: 'Supermercado' },
  { slug: 'delivery', titulo: 'Delivery' },
  { slug: 'combustivel', titulo: 'Combustível' },
  { slug: 'transporte_app', titulo: 'Transporte por aplicativo' },
  { slug: 'transporte_publico', titulo: 'Transporte público' },
  { slug: 'estacionamento', titulo: 'Estacionamento' },
  { slug: 'farmacia', titulo: 'Farmácia' },
  { slug: 'saude', titulo: 'Saúde' },
  { slug: 'academia', titulo: 'Academia' },
  { slug: 'educacao', titulo: 'Educação' },
  { slug: 'seguro', titulo: 'Seguro' },
  { slug: 'imposto', titulo: 'Imposto' },
  { slug: 'investimento', titulo: 'Investimento' },
  { slug: 'pet', titulo: 'Pet' },
];

export interface CompromissoDetectado {
  slug: string;
  titulo: string;
  /** Média por ciclo observada no histórico. */
  amortizadoObservado: number;
  /** O que o usuário fixou, quando fixou. É este que o painel soma. */
  valorFixado: number | null;
  transacoes: any[];
  ciclos: number;
  /** ⚠️ O observado divergiu do fixado o bastante para valer um aviso. */
  divergente: boolean;
}

/** Acima disto o observado e o fixado divergem o bastante para avisar. */
const DIVERGENCIA = 0.2;

/**
 * Agrupa as transações rotuladas por tipo e calcula o amortizado por mês.
 *
 * ⭐ Aqui periodicidade não importa: seis compras de mercado em 30 dias e um imposto por
 * trimestre produzem a mesma pergunta — quanto sai por mês, em média. O divisor é o número
 * de ciclos distintos em que o tipo apareceu, não o número de transações.
 *
 * ⛔ O valor fixado pelo usuário NUNCA é recalculado aqui. Valor que persegue a própria
 * média não pode discordar de quem o gerou: estourou três meses, a média sobe e a
 * "sugestão" sobe junto. O sistema avisa da divergência e a decisão fica com o usuário.
 */
export function agruparPorCompromisso(
  transacoes: any[],
  tipos: any[],
  chaveDeCiclo: (t: any) => string,
): CompromissoDetectado[] {
  const porSlug = new Map<string, any[]>();

  for (const t of transacoes) {
    if (!t.compromisso) continue;
    const lista = porSlug.get(t.compromisso) ?? [];
    lista.push(t);
    porSlug.set(t.compromisso, lista);
  }

  const detectados: CompromissoDetectado[] = [];

  for (const [slug, lista] of porSlug) {
    if (lista.length < PISO_COMPROMISSO) continue;

    const tipo = tipos.find(x => x.slug === slug);
    const ciclos = new Set(lista.map(chaveDeCiclo)).size || 1;
    const total = lista.reduce((acc, t) => acc + Math.abs(Number(t.valor) || 0), 0);
    const amortizadoObservado = total / ciclos;
    const valorFixado = tipo?.valor_mensal != null ? Number(tipo.valor_mensal) : null;

    detectados.push({
      slug,
      titulo: tipo?.titulo ?? slug,
      amortizadoObservado,
      valorFixado,
      transacoes: lista,
      ciclos,
      divergente:
        valorFixado != null &&
        valorFixado > 0 &&
        Math.abs(amortizadoObservado - valorFixado) / valorFixado > DIVERGENCIA,
    });
  }

  return detectados.sort((a, b) => valorDoCompromisso(b) - valorDoCompromisso(a));
}

/** O que o painel soma: o que o usuário fixou, ou o observado enquanto ele não fixou. */
export function valorDoCompromisso(c: CompromissoDetectado): number {
  return c.valorFixado ?? c.amortizadoObservado;
}

/** Soma da camada "previsível" do painel. */
export function totalPrevisivel(detectados: CompromissoDetectado[]): number {
  return detectados.reduce((acc, c) => acc + valorDoCompromisso(c), 0);
}
