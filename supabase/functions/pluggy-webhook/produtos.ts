/**
 * Os produtos alem das transacoes: identidade (so o CPF, como HMAC), investimentos, as
 * movimentacoes de cada um, e emprestimos.
 *
 * ⭐⭐ **A Pluggy nao tem evento para nenhum deles** -- so `item/*` e `transactions/*`. Por isso eles
 * so chegam pela sincronizacao completa (`sincronizar.ts`), que roda em todo `item/*` e em todo
 * registro autenticado.
 *
 * ⭐ **O principio de gravacao e o mesmo do `open_finance` pos-720ece4, levado ao fim:** coluna
 * explicita para cada campo com valor analitico, `jsonb` so para lista aninhada que tambem tem, e
 * **nenhum objeto cru**. Identificador de pessoa sai aqui, NA GRAVACAO -- nunca na leitura.
 */

import type { Log } from '../_shared/log.ts';
import {
  type EmprestimoPluggy,
  type InvestimentoPluggy,
  type ItemPluggy,
  type Listagem,
  type MovimentoPluggy,
  buscarIdentidade,
  listarEmprestimos,
  listarInvestimentos,
  listarMovimentos,
} from './pluggy.ts';
import {
  admin,
  apagarAusentes,
  dataLocal,
  donosDoItem,
  erroDeEscrita,
  gravarEmLotes,
  porDono,
  semIdentidade,
} from './gravar.ts';
import type { Orcamento, ResultadoEtapa } from './sincronizar.ts';

// ---------------------------------------------------------------------------------------
// Identidade: o CPF, so como HMAC
// ---------------------------------------------------------------------------------------

/**
 * ⛔ **HMAC, nao hash puro.** O espaco de CPFs e pequeno (10^9 antes dos digitos verificadores):
 * um SHA-256 sem segredo se inverte por forca bruta em minutos, e o hash viraria o CPF com um
 * passo a mais. Com o segredo fora do banco, o dump sozinho nao inverte.
 *
 * ⚠️ **Trocar `OPEN_FINANCE_CPF_SEGREDO` invalida TODOS os hashes** -- o mesmo CPF passa a dar outro
 * valor, e `cpf_divergente` acenderia para todo mundo. O procedimento e esvaziar
 * `open_finance_identidades` junto com a troca; a proxima sincronizacao de cada item repoe.
 */
const SEGREDO_CPF = Deno.env.get('OPEN_FINANCE_CPF_SEGREDO');

/** A chave importada uma vez por worker. Rejeicao sai do cache, como em `pluggy.ts`. */
let chaveCpf: Promise<CryptoKey> | null = null;

function chaveHmac(segredo: string): Promise<CryptoKey> {
  if (chaveCpf) return chaveCpf;
  const promessa = crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  chaveCpf = promessa;
  promessa.catch(() => {
    if (chaveCpf === promessa) chaveCpf = null;
  });
  return promessa;
}

async function hmacHex(segredo: string, texto: string): Promise<string> {
  const assinatura = await crypto.subtle.sign(
    'HMAC', await chaveHmac(segredo), new TextEncoder().encode(texto),
  );
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Le a identidade do item e guarda **so o HMAC do CPF**.
 *
 * ⭐⭐ **Falha FECHADA, sempre, e nunca derruba a sincronizacao.** Cada caso duvidoso pula a
 * gravacao com um log que diz por que -- e nenhum desses logs carrega o CPF, o hash ou o nome.
 *
 *   sem o secret              `cpf_sem_segredo`       -> indisponivel (fork sem o secret)
 *   item sem dono unico       `cpf_sem_dono_unico`    -> conta conjunta e IGNORADA: o CPF e de
 *                                                        um titular, e atribui-lo a todos os donos
 *                                                        daria a um o CPF do outro
 *   documento nao e CPF       `identidade_sem_cpf`    -> conta PJ, ou formato inesperado
 *   usuario ja tem outro      `cpf_divergente`        -> MANTEM o que existe; trocar em silencio
 *                                                        apagaria o sinal de que algo esta errado
 *   hash ja e de outro dono   `cpf_de_outro_usuario`  -> pula (o UNIQUE recusou)
 *
 * ⚠️ O dono e contado com `donosDoItem` AQUI, e nao recebido de quem chama: a lista que a
 * sincronizacao carrega pode ter sido lida antes de um segundo dono entrar.
 * ⭐ A ordem e para buscar o dado pessoal o MENOS possivel: segredo e donos sao conferidos antes da
 * chamada a `/identity`.
 */
export async function sincronizarIdentidade(itemId: string, log: Log): Promise<ResultadoEtapa> {
  if (!SEGREDO_CPF) {
    log.etapa('cpf_sem_segredo');
    return { status: 'indisponivel', n: 0 };
  }

  const donos = await donosDoItem(itemId);
  if (donos.length !== 1) {
    log.etapa('cpf_sem_dono_unico', { donos: donos.length });
    return { status: 'ok', n: 0 };
  }
  const [dono] = donos;

  const identidade = await buscarIdentidade(itemId);
  if (!identidade) return { status: 'indisponivel', n: 0 };

  const digitos = String(identidade.document ?? '').replace(/\D/g, '');
  if (identidade.documentType !== 'CPF' || digitos.length !== 11) {
    log.etapa('identidade_sem_cpf', { tipo: identidade.documentType ?? null, digitos: digitos.length });
    return { status: 'ok', n: 0 };
  }

  const hash = await hmacHex(SEGREDO_CPF, digitos);
  const tabela = 'open_finance_identidades';

  const { data: atual, error: erroLer } = await admin()
    .from(tabela)
    .select('cpf_hmac')
    .eq('user_id', dono)
    .maybeSingle();
  if (erroLer) throw erroDeEscrita('select', tabela, erroLer, log);

  if (atual) {
    if (atual.cpf_hmac === hash) return { status: 'ok', n: 1 };
    log.etapa('cpf_divergente');
    return { status: 'ok', n: 0 };
  }

  const { error } = await admin()
    .from(tabela)
    .insert({ user_id: dono, cpf_hmac: hash, pluggy_item_id: itemId });
  if (error) {
    // ⚠️ O nome da constraint e o que separa os dois 23505 (ver a migration 20261002120000).
    if (error.code === '23505' && error.message.includes('open_finance_identidades_cpf_unico')) {
      log.etapa('cpf_de_outro_usuario');
      return { status: 'ok', n: 0 };
    }
    // A PK: outra sincronizacao do mesmo item gravou entre o `select` e o `insert`. Mesmo item,
    // mesmo segredo -> mesmo hash. Nada a fazer.
    if (error.code === '23505') return { status: 'ok', n: 1 };
    throw erroDeEscrita('insert', tabela, error, log);
  }
  return { status: 'ok', n: 1 };
}

// ---------------------------------------------------------------------------------------
// O que todo mapeamento de produto usa
// ---------------------------------------------------------------------------------------

/** Lista aninhada para `jsonb`: ausente vira `null`, e o resto passa por `semIdentidade`. */
const aninhado = (v: unknown) => (v == null ? null : semIdentidade(v));

/**
 * CPF solto num texto: 11 digitos seguidos, ou no formato `000.000.000-00`.
 *
 * ⛔ **Existe por causa do `issuer` -- e do `name`, que o repete.** Medido em 2026-10-02: 5 dos 6
 * emissores nao nulos do sandbox sao pessoa fisica, com o CPF colado no nome ("NOME COMPLETO
 * 00000000000"), e os 5 CRIs dela trazem o MESMO numero no nome do titulo. O nome fica, pelo
 * mesmo criterio de `paymentData.*.name` em `gravar.ts`; o documento sai.
 * ⚠️ Vale para todo texto livre de produto (nome, emissor, descricao): e onde a Pluggy cola o que
 * o banco mandou, e nenhuma lista de campos fixa preve onde um documento vai aparecer.
 * ⚠️ As bordas `\b` impedem casar 11 digitos de dentro de um CNPJ de 14.
 */
const CPF_SOLTO = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

function semCpf(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpo = texto.replace(CPF_SOLTO, '').replace(/\s{2,}/g, ' ').trim();
  return limpo || null;
}

/** `issuerCNPJ` com 11 digitos e CPF com nome errado -- descarta. */
function soCnpj(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.replace(/\D/g, '').length === 11 ? null : v;
}

/**
 * ⛔ **So apaga o que sumiu com as tres condicoes juntas:**
 *
 *   listagem completa     o `total` da Pluggy bateu com o que chegou
 *   conjunto nao vazio    lista vazia de um item com investimentos e muito mais provavelmente
 *                         falha do conector do que "vendeu tudo"
 *   item UPDATED          `OUTDATED`/`LOGIN_ERROR` servem a ultima coleta boa, que pode estar
 *                         incompleta, e `PARTIAL_SUCCESS` e incompleta por definicao
 *
 * Qualquer duvida mantem a linha. Uma posicao vendida que fica um dia a mais e um erro pequeno e
 * visivel; uma posicao viva apagada some sem rastro.
 */
function podeLimpar<T>(lista: Listagem<T>, item: ItemPluggy): boolean {
  return lista.completa && lista.itens.length > 0 && item.status === 'UPDATED';
}

// ---------------------------------------------------------------------------------------
// Investimentos: a posicao
// ---------------------------------------------------------------------------------------

/** Fora, de proposito: `owner` (o titular), `number` e `metadata` -- este nulo em 17 de 17. */
function investimentoParaLinha(i: InvestimentoPluggy, itemId: string) {
  return {
    pluggy_item_id: itemId,
    pluggy_investment_id: i.id,
    nome: semCpf(i.name),
    codigo: i.code ?? null,
    isin: i.isin ?? null,
    tipo: i.type ?? null,
    subtipo: i.subtype ?? null,
    status: i.status ?? null,
    saldo: i.balance ?? null,
    montante: i.amount ?? null,
    montante_original: i.amountOriginal ?? null,
    montante_lucro: i.amountProfit ?? null,
    montante_resgatado: i.amountWithdrawal ?? null,
    impostos: i.taxes ?? null,
    impostos2: i.taxes2 ?? null,
    valor_cota: i.value ?? null,
    quantidade: i.quantity ?? null,
    taxa: i.rate ?? null,
    taxa_tipo: i.rateType ?? null,
    taxa_periodicidade: i.ratePeriodicity ?? null,
    taxa_fixa_anual: i.fixedAnnualRate ?? null,
    indexador: i.indexerAdditionalInfo ?? null,
    rentab_mes: i.lastMonthRate ?? null,
    rentab_12m: i.lastTwelveMonthsRate ?? null,
    rentab_anual: i.annualRate ?? null,
    isento_ir: i.taxExempt ?? null,
    cupom: aninhado(i.couponPayment),
    data: dataLocal(i.date),
    data_compra: dataLocal(i.purchaseDate),
    data_emissao: dataLocal(i.issueDate),
    vencimento: dataLocal(i.dueDate),
    carencia: dataLocal(i.gracePeriodDate),
    emissor: semCpf(i.issuer),
    emissor_cnpj: soCnpj(i.issuerCNPJ),
    moeda: i.currencyCode ?? 'BRL',
    pluggy_atualizado_em: i.updatedAt ?? null,
    atualizado_em: new Date().toISOString(),
  };
}

/**
 * Grava a posicao e devolve os ids, que a etapa de movimentacoes usa.
 *
 * ⚠️ Status `TOTAL_WITHDRAWAL` (12 de 17 no sandbox) NAO e ausencia: a Pluggy continua listando a
 * posicao resgatada, e ela fica, com o status cru. So some o que some da listagem.
 */
export async function sincronizarInvestimentos(
  itemId: string,
  item: ItemPluggy,
  donos: string[],
  log: Log,
): Promise<ResultadoEtapa & { ids?: string[] }> {
  const lista = await listarInvestimentos(itemId);
  if (!lista) return { status: 'indisponivel', n: 0 };

  const base = lista.itens.map((i) => investimentoParaLinha(i, itemId));
  await gravarEmLotes(
    'open_finance_investimentos', porDono(base, donos), 'user_id,pluggy_investment_id', log,
  );

  const ids = lista.itens.map((i) => i.id);
  if (podeLimpar(lista, item)) {
    const apagados = await apagarAusentes(
      'open_finance_investimentos', 'pluggy_investment_id', itemId, donos, ids, log,
    );
    if (apagados) log.etapa('investimentos.apagados', { n: apagados });
  } else {
    log.etapa('investimentos.sem_limpeza', {
      completa: lista.completa, n: ids.length, status: item.status ?? null,
    });
  }

  return { status: 'ok', n: ids.length, ...(lista.completa ? {} : { incompleta: true }), ids };
}

// ---------------------------------------------------------------------------------------
// Movimentacoes de investimento
// ---------------------------------------------------------------------------------------

/** Fora, de proposito: `brokerageNumber` (o numero da nota de corretagem). */
function movimentoParaLinha(m: MovimentoPluggy, investmentId: string, itemId: string) {
  return {
    pluggy_item_id: itemId,
    pluggy_investment_id: investmentId,
    pluggy_investment_transaction_id: m.id,
    tipo: m.type ?? null,
    movimento: m.movementType ?? null,
    descricao: semCpf(m.description),
    montante: m.amount ?? null,
    montante_liquido: m.netAmount ?? null,
    valor_cota: m.value ?? null,
    quantidade: m.quantity ?? null,
    data: dataLocal(m.date),
    data_negociacao: dataLocal(m.tradeDate),
    percentual_indexador: m.indexerPercentage ?? null,
    taxa_acordada: m.agreedRate ?? null,
    despesas: aninhado(m.expenses),
    atualizado_em: new Date().toISOString(),
  };
}

/** Investimentos listados ao mesmo tempo. Segura a mao na API sem serializar 17 chamadas. */
const PARALELISMO_MOVIMENTOS = 3;

/**
 * As movimentacoes de cada investimento, 3 por vez.
 *
 * ⛔ **Nunca apaga.** E historico: o movimento de um investimento resgatado e justamente o que
 * explica o resgate, e ele continua valendo depois que a posicao some.
 *
 * ⭐ O orcamento e conferido antes de CADA investimento. Estourou, o que falta conta como adiado --
 * o que ja foi gravado fica, e o upsert torna a proxima passagem inofensiva.
 */
export async function sincronizarMovimentos(
  itemId: string,
  investimentos: string[],
  donos: string[],
  log: Log,
  orcamento: Orcamento,
): Promise<ResultadoEtapa> {
  const fila = [...investimentos];
  let n = 0;
  let falhas = 0;
  let adiados = 0;

  const trabalhador = async () => {
    for (let id = fila.shift(); id !== undefined; id = fila.shift()) {
      if (orcamento.esgotado()) {
        adiados += 1 + fila.length;
        fila.length = 0;
        return;
      }
      try {
        const lista = await listarMovimentos(id);
        if (!lista) continue;
        const base = lista.itens.map((m) => movimentoParaLinha(m, id, itemId));
        await gravarEmLotes(
          'open_finance_investimento_movimentos',
          porDono(base, donos),
          'user_id,pluggy_investment_id,pluggy_investment_transaction_id',
          log,
        );
        n += lista.itens.length;
        if (!lista.completa) log.etapa('movimentos.incompleta', { n: lista.itens.length });
      } catch (e) {
        // ⚠️ Um investimento que falha nao derruba os outros -- mas marca a etapa como falha.
        falhas++;
        log.falha('movimentos.investimento', e);
      }
    }
  };

  await Promise.all(Array.from({ length: PARALELISMO_MOVIMENTOS }, trabalhador));
  if (adiados) log.etapa('movimentos.adiados', { investimentos: adiados });
  return { status: falhas ? 'falhou' : adiados ? 'adiado' : 'ok', n };
}

// ---------------------------------------------------------------------------------------
// Emprestimos
// ---------------------------------------------------------------------------------------

/**
 * ⛔ Fora, de proposito: `contractNumber` e `ipocCode` (identificam o contrato de UMA pessoa no
 * banco) e `cnpjConsignee` (o empregador, no consignado). Os tres tambem estao em
 * `CAMPOS_DE_IDENTIDADE`, para que nenhuma lista aninhada os traga de volta.
 *
 * ⚠️ `parcelas_total` sem `parcelas_total_unidade` e ambiguo: no sandbox 4 de 5 contratos contam o
 * prazo em DIAS (`typeNumberOfInstallments = DAY`), e 365 "parcelas" seriam um ano, nao 365 boletos.
 */
function emprestimoParaLinha(l: EmprestimoPluggy, itemId: string) {
  const parcelas = l.installments ?? null;
  const pagamentos = l.payments ?? null;
  return {
    pluggy_item_id: itemId,
    pluggy_loan_id: l.id,
    produto: l.productName ?? null,
    tipo: l.type ?? null,
    modalidade: l.kind ?? null,
    subtipo_categoria: l.productSubTypeCategory ?? null,
    montante_contratado: l.contractAmount ?? null,
    saldo_restante: l.totalRemainingAmount ?? null,
    saldo_devedor: pagamentos?.contractOutstandingBalance ?? null,
    saldo_devedor_em: pagamentos?.contractOutstandingBalanceUpdatedAt ?? null,
    proxima_parcela: l.nextInstallmentAmount ?? null,
    cet: l.CET ?? null,
    amortizacao: l.amortizationScheduled ?? null,
    periodicidade: l.installmentPeriodicity ?? null,
    tem_seguro: l.hasInsuranceContracted ?? null,
    data: dataLocal(l.date),
    data_contrato: dataLocal(l.contractDate),
    data_liquidacao: dataLocal(l.settlementDate),
    vencimento: dataLocal(l.dueDate),
    primeira_parcela: dataLocal(l.firstInstallmentDueDate),
    parcelas_total: parcelas?.totalNumberOfInstallments ?? null,
    parcelas_total_unidade: parcelas?.typeNumberOfInstallments ?? null,
    parcelas_pagas: parcelas?.paidInstallments ?? null,
    parcelas_a_vencer: parcelas?.dueInstallments ?? null,
    parcelas_vencidas: parcelas?.pastDueInstallments ?? null,
    parcelas_restantes: parcelas?.contractRemainingNumber ?? null,
    parcelas_restantes_unidade: parcelas?.typeContractRemaining ?? null,
    datas_desembolso: aninhado(l.disbursementDates),
    juros: aninhado(l.interestRates),
    tarifas: aninhado(l.contractedFees),
    encargos: aninhado(l.contractedFinanceCharges),
    garantias: aninhado(l.warranties),
    pagamentos: aninhado(pagamentos?.releases),
    baloes: aninhado(parcelas?.balloonPayments),
    moeda: l.currencyCode ?? 'BRL',
    pluggy_atualizado_em: l.updatedAt ?? null,
    atualizado_em: new Date().toISOString(),
  };
}

/** Grava os contratos e apaga o que sumiu (contrato quitado), nas condicoes de `podeLimpar`. */
export async function sincronizarEmprestimos(
  itemId: string,
  item: ItemPluggy,
  donos: string[],
  log: Log,
): Promise<ResultadoEtapa> {
  const lista = await listarEmprestimos(itemId);
  if (!lista) return { status: 'indisponivel', n: 0 };

  const base = lista.itens.map((l) => emprestimoParaLinha(l, itemId));
  await gravarEmLotes('open_finance_emprestimos', porDono(base, donos), 'user_id,pluggy_loan_id', log);

  const ids = lista.itens.map((l) => l.id);
  if (podeLimpar(lista, item)) {
    const apagados = await apagarAusentes(
      'open_finance_emprestimos', 'pluggy_loan_id', itemId, donos, ids, log,
    );
    if (apagados) log.etapa('emprestimos.apagados', { n: apagados });
  } else {
    log.etapa('emprestimos.sem_limpeza', {
      completa: lista.completa, n: ids.length, status: item.status ?? null,
    });
  }

  return { status: 'ok', n: ids.length, ...(lista.completa ? {} : { incompleta: true }) };
}
