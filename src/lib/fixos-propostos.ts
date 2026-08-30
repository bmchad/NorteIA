/**
 * Detecção de gastos recorrentes, em cascata.
 *
 * ⭐⭐ As regras não competem pela mesma transação: **reivindicam em ordem**, e cada uma só
 * olha o que sobrou. Sem isso a mesma transação aparece em duas propostas e o painel conta
 * o mesmo dinheiro duas vezes — que é o erro que invalida o número inteiro.
 *
 * ```
 * 0. atribuição manual  → o usuário declarou. Nada automático sobrepõe
 * 1. 1.b nome + valor   → o nome é o sinal mais forte
 * 2. 1.a valor + dia    → só o que a 1.b não reivindicou
 * 3. rótulo de compromisso → o resto (fora deste módulo, ver compromissos.ts)
 * ```
 *
 * ⚠️ Parcelas ficam de fora de tudo: o comprometido delas já é contado por
 * `src/lib/parcelas.ts`, e contá-lo de novo como fixo seria dupla contagem.
 */
import { getCycleKey } from './ciclo';

/** Ocorrências mínimas para virar proposta. ⭐ O mesmo 3 de todo o produto. */
export const PISO = 3;

/** Tolerância de dia: débito automático cai em dia útil e escorrega. */
const TOLERANCIA_DIA = 2;

export type Natureza = 'criar' | 'corrigir' | 'encerrar';

export interface PropostaDeFixo {
  natureza: Natureza;
  /** `auto-nome-valor` (1.b) ou `auto-valor-dia` (1.a). */
  origem: string;
  nome: string;
  valor: number;
  dia: number;
  periodicidade_meses: number;
  /** Os lançamentos que geraram a proposta. Sem eles, aceitar é chute. */
  evidencia: any[];
  assinatura: string;
  /** Só em `corrigir` e `encerrar`: a linha de `fixos` que a proposta atinge. */
  fixoId?: string;
}

const abs = (t: any) => Math.abs(Number(t.valor) || 0);
const diaDe = (t: any) => parseInt(String(t.data).split('-')[2], 10);

/** Elegível: confirmada, saída, e não parcelada. */
function elegivel(t: any): boolean {
  return t.pendente === false && Number(t.valor) < 0 && !t.parcela_total;
}

/**
 * Mede o intervalo entre ocorrências, em meses.
 *
 * ⭐⭐ Detectar recorrência e medir cadência são o mesmo passo, nunca dois. Sem isso, uma
 * cobrança trimestral que aparece 12 vezes em 3 anos é lida como mensal — e o painel, cujo
 * objetivo é dizer quanto sai por mês, infla o comprometido em três vezes.
 *
 * Devolve `null` quando o intervalo não é regular: três cobranças iguais em meses
 * aleatórios são coincidência, não assinatura.
 */
export function periodicidadeDe(ocorrencias: any[], cicloDia: number): number | null {
  const chaves = [...new Set(ocorrencias.map(t => getCycleKey(t.data, t.mes_fatura, cicloDia)))].sort();
  if (chaves.length < 2) return null;

  const absoluto = chaves.map(k => {
    const [ano, mes] = k.split('-').map(Number);
    return ano * 12 + (mes - 1);
  });

  const saltos: number[] = [];
  for (let i = 1; i < absoluto.length; i++) saltos.push(absoluto[i] - absoluto[i - 1]);

  const media = saltos.reduce((a, b) => a + b, 0) / saltos.length;
  const arredondado = Math.max(1, Math.round(media));

  // Irregular: algum intervalo foge mais de um mês da média.
  if (saltos.some(s => Math.abs(s - arredondado) > 1)) return null;
  return arredondado;
}

/** A moda dos dias observados — o dia que a proposta carrega. */
function diaTipico(ocorrencias: any[]): number {
  const contagem = new Map<number, number>();
  for (const t of ocorrencias) {
    const d = diaDe(t);
    contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * A direção do ajuste de dia útil, inferida do histórico.
 *
 * Débito que cai em fim de semana escorrega para um lado só, e qual lado é do banco.
 * ⭐ Sem histórico suficiente, **antecipar** — errar para antes avisa cedo demais, errar
 * para depois avisa tarde demais, e só o segundo custa juros.
 */
export function ajusteDeDia(ocorrencias: any[]): 'adiar' | 'antecipar' {
  const tipico = diaTipico(ocorrencias);
  let antes = 0;
  let depois = 0;
  for (const t of ocorrencias) {
    const d = diaDe(t);
    if (d < tipico) antes++;
    else if (d > tipico) depois++;
  }
  return depois > antes ? 'adiar' : 'antecipar';
}

/**
 * Prefixo que separa a recusa de uma **correção** da recusa de uma **criação**.
 *
 * ⚠️ Fossem a mesma assinatura, recusar "o valor certo é mesmo R$ 39,90" mataria também a
 * proposta de criar o fixo — ou o contrário.
 */
export const PREFIXO_CORRECAO = 'CORRIGIR::';

/** Assinatura para não repropor o recusado. ⚠️ Sem o valor: valor muda, a recusa cairia. */
export function assinaturaDe(nome: string, periodicidade: number): string {
  return `${nome.trim().toUpperCase()}::${periodicidade}`;
}

/**
 * Regra 1.b — mesmo nome e mesmo valor exato.
 *
 * ⭐ Prioritária porque o nome é o sinal mais forte. Valor exato, sem tolerância: a medição
 * mostrou que afrouxar compra pouco e custa a assinatura da recusa, que não poderia mais
 * incluir o valor.
 */
function detectarPorNomeEValor(transacoes: any[], cicloDia: number) {
  const grupos = new Map<string, any[]>();
  for (const t of transacoes) {
    const chave = `${t.nome}::${abs(t).toFixed(2)}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(t);
    grupos.set(chave, lista);
  }

  const propostas: PropostaDeFixo[] = [];
  const reivindicadas = new Set<any>();

  for (const lista of grupos.values()) {
    if (lista.length < PISO) continue;
    const periodicidade = periodicidadeDe(lista, cicloDia);
    if (periodicidade === null) continue;

    const base = lista[0];
    propostas.push({
      natureza: 'criar',
      origem: 'auto-nome-valor',
      nome: base.apelido || base.nome,
      valor: abs(base),
      dia: diaTipico(lista),
      periodicidade_meses: periodicidade,
      evidencia: lista,
      assinatura: assinaturaDe(base.nome, periodicidade),
    });
    lista.forEach(t => reivindicadas.add(t));
  }

  return { propostas, reivindicadas };
}

/**
 * Regra 1.a — mesmo valor, dia próximo, **só o que a 1.b não pegou**.
 *
 * ⭐ Existe para um caso só: cobrança cujo nome muda entre faturas. Se o nome fosse estável,
 * a 1.b já teria pego.
 */
function detectarPorValorEDia(transacoes: any[], cicloDia: number) {
  const grupos = new Map<string, any[]>();

  for (const t of transacoes) {
    const valor = abs(t).toFixed(2);
    const dia = diaDe(t);
    // Casa com um grupo de mesmo valor cujo dia esteja dentro da tolerância.
    const existente = [...grupos.keys()].find(k => {
      const [v, d] = k.split('::');
      return v === valor && Math.abs(Number(d) - dia) <= TOLERANCIA_DIA;
    });
    const chave = existente ?? `${valor}::${dia}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(t);
    grupos.set(chave, lista);
  }

  const propostas: PropostaDeFixo[] = [];
  for (const lista of grupos.values()) {
    if (lista.length < PISO) continue;
    const periodicidade = periodicidadeDe(lista, cicloDia);
    if (periodicidade === null) continue;

    const base = lista[0];
    propostas.push({
      natureza: 'criar',
      origem: 'auto-valor-dia',
      nome: base.apelido || base.nome,
      valor: abs(base),
      dia: diaTipico(lista),
      periodicidade_meses: periodicidade,
      evidencia: lista,
      assinatura: assinaturaDe(base.nome, periodicidade),
    });
  }
  return propostas;
}

/**
 * A cascata inteira, comparada com o que já existe em `fixos`.
 *
 * ⚠️ A detecção é derivada, não guardada: roda ao abrir a tela, sobre o histórico. O que
 * persiste em `fixos` é o que foi **decidido** — aceito, recusado, encerrado. Mesmo desenho
 * de D-013: não guarde o que dá para derivar.
 */
export function detectarPropostas(
  transacoes: any[],
  fixos: any[],
  cicloDia: number,
): PropostaDeFixo[] {
  const candidatas = transacoes.filter(elegivel);

  const porNome = detectarPorNomeEValor(candidatas, cicloDia);
  const sobraram = candidatas.filter(t => !porNome.reivindicadas.has(t));
  const porValor = detectarPorValorEDia(sobraram, cicloDia);

  const brutas = [...porNome.propostas, ...porValor];
  const saida: PropostaDeFixo[] = [];

  for (const p of brutas) {
    const casado = casarComFixo(p, fixos);

    // ⭐ A checagem de recusa depende da natureza, e a natureza só se conhece depois de
    // casar. Criação e correção têm assinaturas separadas de propósito: recusar "não é um
    // gasto fixo" não pode matar também "o valor certo é 39,90", nem o contrário.
    const assinatura = casado ? PREFIXO_CORRECAO + p.assinatura : p.assinatura;
    if (fixos.some(f => f.status === 'recusado' && f.assinatura === assinatura)) continue;

    if (!casado) {
      saida.push(p);
      continue;
    }
    // Casa e concorda: nada a propor.
    if (Math.abs(Number(casado.valor) - p.valor) < 0.01 && Number(casado.dia) === p.dia) continue;

    saida.push({ ...p, natureza: 'corrigir', fixoId: casado.id, nome: casado.nome });
  }

  return [...saida, ...detectarEncerramentos(transacoes, fixos, cicloDia)];
}

/**
 * Casa um candidato com uma linha de `fixos`.
 *
 * ⭐ A chave é periodicidade + valor + (dia ±2 **ou** nome idêntico), e o "ou" cobre as duas
 * origens com uma regra só: cadastro manual casa pelo dia (o nome você digitou, o extrato
 * diz outro), proposta aceita casa pelo nome (veio do extrato). Deduplicar só por nome
 * deixaria todo cadastro manual passar batido — que é o caso mais comum.
 */
function casarComFixo(p: PropostaDeFixo, fixos: any[]): any | null {
  return (
    fixos.find(f => {
      if (f.status === 'recusado' || f.status === 'encerrado') return false;
      if ((f.periodicidade_meses ?? 1) !== p.periodicidade_meses) return false;
      const mesmoDia = f.dia != null && Math.abs(Number(f.dia) - p.dia) <= TOLERANCIA_DIA;
      const mesmoNome = String(f.nome).trim().toUpperCase() === p.nome.trim().toUpperCase();
      return mesmoDia || mesmoNome;
    }) ?? null
  );
}

/**
 * Fixo ativo sem lançamento há 2 ciclos além da periodicidade.
 *
 * ⭐ É o que impede a lista de envelhecer com assinatura cancelada: sem isso, o comprometido
 * mostra dinheiro que já parou de sair.
 */
function detectarEncerramentos(transacoes: any[], fixos: any[], cicloDia: number): PropostaDeFixo[] {
  const hoje = new Date();
  const cicloAtual = hoje.getFullYear() * 12 + hoje.getMonth();

  return fixos
    .filter(f => f.status === 'ativo' && f.origem !== 'manual')
    .flatMap(f => {
      const relacionadas = transacoes.filter(
        t => elegivel(t) && String(t.nome).trim().toUpperCase() === String(f.nome).trim().toUpperCase(),
      );
      if (relacionadas.length === 0) return [];

      const ultima = relacionadas
        .map(t => getCycleKey(t.data, t.mes_fatura, cicloDia))
        .sort()
        .pop()!;
      const [ano, mes] = ultima.split('-').map(Number);
      const silencio = cicloAtual - (ano * 12 + (mes - 1));

      if (silencio <= (f.periodicidade_meses ?? 1) + 1) return [];

      return [{
        natureza: 'encerrar' as Natureza,
        origem: f.origem,
        nome: f.nome,
        valor: Number(f.valor),
        dia: Number(f.dia ?? 1),
        periodicidade_meses: f.periodicidade_meses ?? 1,
        evidencia: relacionadas.slice(-3),
        assinatura: `ENCERRAR::${assinaturaDe(f.nome, f.periodicidade_meses ?? 1)}`,
        fixoId: f.id,
      }];
    });
}

/** O comprometido mensal da camada "recorrente": amortizado pela periodicidade. */
export function comprometidoRecorrente(fixosAtivos: any[]): number {
  return fixosAtivos.reduce(
    (acc, f) => acc + Number(f.valor || 0) / Math.max(Number(f.periodicidade_meses) || 1, 1),
    0,
  );
}
