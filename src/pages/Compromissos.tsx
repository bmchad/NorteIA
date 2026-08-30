import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Anchor, CreditCard, Layers, Settings2, Check, X, Info, ChevronDown, ChevronUp, Trash2, TrendingDown, Undo2, ShoppingCart, ListChecks, AlertTriangle, type LucideIcon } from 'lucide-react';
import {
  agruparParcelas, comprometidoRestante, contaDaCompra, parcelasRestantes, projecaoPorCiclo,
} from '../lib/parcelas';
import ConfirmModal from '../components/ConfirmModal';
import ExemplosDoCompromisso from '../components/ExemplosDoCompromisso';
import {
  detectarPropostas, lancamentosDoFixo, PISO, PREFIXO_CORRECAO, type PropostaDeFixo,
} from '../lib/fixos-propostos';
import { TETO_EXEMPLOS, valorDoCompromisso } from '../lib/compromissos';
import { comprometidoDoCiclo, proximoAlivio } from '../lib/comprometido';

/**
 * `/compromissos` — dinheiro que já tem dono antes de você decidir qualquer coisa.
 *
 * ⭐⭐ A fusão de `/fixos` e `/parcelas` numa tela só. O eixo não é o canal — Netflix no
 * cartão ocupa limite — é **quando o compromisso foi assumido**: parcela é dívida
 * contratada, fixo é comportamento observado.
 *
 * ⭐ O painel nunca mostra um total único. Três camadas de certeza, porque somá-las esconde
 * o que dá para cancelar — e é essa distinção que faz o número servir para decidir.
 */
export default function Compromissos() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  // ⭐ As abas têm o nome das três camadas. Cards dizendo "Contratado" sobre abas dizendo
  // "Parcelas" são dois vocabulários para a mesma coisa, e o conceito está no card.
  const [aba, setAba] = useState<Camada>('contratado');

  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [fixos, setFixos] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [exemplos, setExemplos] = useState<any[]>([]);
  const [cicloDia, setCicloDia] = useState(5);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [buscaTransacao, setBuscaTransacao] = useState('');
  const [verRecusados, setVerRecusados] = useState(false);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; mensagem: string; onConfirmar: () => void } | null>(null);

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setCarregando(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const [mem, tx, fx, tp, ex] = await Promise.all([
        supabase.from('memory').select('ciclo_dia').maybeSingle(),
        supabase.from('transactions').select('*').eq('pendente', false),
        supabase.from('fixos').select('*'),
        supabase.from('compromissos').select('*').order('titulo'),
        supabase.from('compromisso_exemplos').select('id, slug, transaction_id, transactions(data, nome, apelido)'),
      ]);

      setCicloDia(mem.data?.ciclo_dia ?? 5);
      setTransacoes(tx.data ?? []);
      setFixos(fx.data ?? []);
      setTipos(tp.data ?? []);
      setExemplos(ex.data ?? []);
    } catch (err) {
      console.error('Erro ao carregar compromissos:', err);
    } finally {
      setCarregando(false);
    }
  };

  // ⚠️ Detecção é derivada, não guardada: recalcula ao abrir. O que persiste em `fixos` é
  // o que foi decidido — aceito, recusado, encerrado. Mesmo desenho de D-013.
  const propostas = useMemo(
    () => (carregando ? [] : detectarPropostas(transacoes, fixos, cicloDia)),
    [transacoes, fixos, cicloDia, carregando],
  );

  // ⭐ O cálculo mora em src/lib/comprometido.ts, e o Dashboard usa o mesmo. Duas telas
  // calculando o mesmo número por conta própria é o erro da D-007.
  const { contratado, recorrente, previsivel, total, gruposEmAndamento: emAndamento, detectados } =
    useMemo(
      () => comprometidoDoCiclo(transacoes, fixos, tipos, cicloDia),
      [transacoes, fixos, tipos, cicloDia],
    );

  /**
   * As compras já quitadas.
   *
   * ⚠️ **Não entram em nenhum total** — parcela paga é histórico, não compromisso. Por isso
   * `comprometidoDoCiclo` não as devolve, e por isso elas são derivadas só aqui: as em
   * andamento continuam vindo de lá (`emAndamento`), com um dono só.
   */
  const concluidas = useMemo(
    () => agruparParcelas(transacoes).filter(g => contaDaCompra(g).concluida),
    [transacoes],
  );

  const restante = useMemo(() => comprometidoRestante(emAndamento), [emAndamento]);
  const faltamParcelas = useMemo(() => parcelasRestantes(emAndamento), [emAndamento]);
  const projecao = useMemo(() => projecaoPorCiclo(emAndamento, cicloDia, 6), [emAndamento, cicloDia]);

  const alivio = useMemo(
    () => proximoAlivio(emAndamento, recorrente + previsivel, cicloDia),
    [emAndamento, recorrente, previsivel, cicloDia],
  );

  const fixosAtivos = fixos.filter(f => f.status === 'ativo');
  const recusados = fixos.filter(f => f.status === 'recusado');

  /**
   * ⭐ O aviso de silêncio mora no card do fixo que parou, não numa lista à parte.
   *
   * Como mais uma linha em "Propostas", ele ficava longe do gasto de que fala — e a pergunta
   * que ele levanta ("ainda pago isto?") só se responde olhando o próprio gasto.
   */
  const encerramentos = useMemo(() => {
    const porFixo = new Map<string, PropostaDeFixo>();
    for (const p of propostas) if (p.natureza === 'encerrar' && p.fixoId) porFixo.set(p.fixoId, p);
    return porFixo;
  }, [propostas]);

  const propostasAbertas = useMemo(
    () => propostas.filter(p => p.natureza !== 'encerrar'),
    [propostas],
  );

  const aceitarProposta = async (p: PropostaDeFixo) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    if (p.natureza === 'corrigir' && p.fixoId) {
      await supabase.from('fixos').update({ valor: p.valor, dia: p.dia }).eq('id', p.fixoId);
    } else if (p.natureza === 'encerrar' && p.fixoId) {
      await supabase.from('fixos').update({ status: 'encerrado' }).eq('id', p.fixoId);
    } else {
      await supabase.from('fixos').insert([{
        user_id: user.id, nome: p.nome, valor: p.valor, dia: p.dia,
        periodicidade_meses: p.periodicidade_meses, origem: p.origem,
        status: 'ativo', assinatura: p.assinatura,
        evidencia: p.evidencia.map((t: any) => ({ id: t.id, data: t.data, nome: t.nome, valor: t.valor })),
      }]);
    }
    await carregar();
  };

  /**
   * ⭐ Recusar é para sempre, e as assinaturas de criação e correção são separadas: fossem a
   * mesma, recusar a correção mataria também a proposta de criação.
   */
  const recusarProposta = async (p: PropostaDeFixo) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const prefixo = p.natureza === 'corrigir' ? PREFIXO_CORRECAO : '';
    await supabase.from('fixos').insert([{
      user_id: user.id, nome: p.nome, valor: p.valor, dia: p.dia,
      periodicidade_meses: p.periodicidade_meses, origem: p.origem,
      status: 'recusado', assinatura: prefixo + p.assinatura,
    }]);
    await carregar();
  };

  /**
   * Põe uma transação num compromisso à mão.
   *
   * ⭐ Sem isto o usuário só consegue tirar, nunca corrigir para mais — e a IA errar para
   * menos é o caso mais comum: ela não rotula o que não reconhece.
   *
   * ⚠️ `compromisso_manual` marca a decisão como declarada, e é o que a faz vencer a
   * detecção automática na importação seguinte.
   */
  const acrescentarAoCompromisso = async (transacaoId: string, slug: string) => {
    await supabase
      .from('transactions')
      .update({ compromisso: slug, compromisso_manual: true })
      .eq('id', transacaoId);
    setBuscaTransacao('');
    await carregar();
  };

  /** ⚠️ Marca `compromisso_manual`: a detecção não pode devolver o que o usuário tirou. */
  const removerDoCompromisso = async (transacaoId: string) => {
    await supabase
      .from('transactions')
      .update({ compromisso: null, compromisso_manual: true })
      .eq('id', transacaoId);
    await carregar();
  };

  /**
   * Desfaz uma recusa.
   *
   * ⭐ Recusar é permanente **por decisão**, não por falta de saída. A assinatura some e a
   * proposta volta na próxima carga — porque a detecção é derivada, e o que a segurava era
   * exatamente esta linha.
   *
   * ⚠️ Criação e correção têm assinaturas separadas de propósito: desfazer uma não
   * ressuscita a outra.
   */
  const desfazerRecusa = async (id: string) => {
    await supabase.from('fixos').delete().eq('id', id);
    await carregar();
  };

  /** ⚠️ Some com a compra inteira, parcela por parcela. Por isso passa pela confirmação. */
  const excluirGrupo = (grupo: any[]) => {
    const nome = grupo[0].apelido || grupo[0].nome;
    setConfirmacao({
      titulo: 'Excluir parcelas',
      mensagem: `Excluir TODAS as ${grupo.length} parcelas de "${nome}"?`,
      onConfirmar: async () => {
        await supabase.from('transactions').delete().in('id', grupo.map((t: any) => t.id));
        setConfirmacao(null);
        await carregar();
      },
    });
  };

  const excluirFixo = async (id: string) => {
    await supabase.from('fixos').delete().eq('id', id);
    await carregar();
  };

  /**
   * Aceitar um compromisso previsível: fixa o valor e guarda as transações como exemplo.
   *
   * ⭐⭐ **É o laço que fecha o aprendizado.** Você confirmou que aquelas transações são
   * daquele tipo; o agente que classifica compromisso passa a receber os nomes delas no
   * prompt. Sem isso, você ensinaria a mesma coisa a cada importação.
   *
   * ⚠️ Falha ao gravar exemplo não desfaz o valor fixado: o número é a decisão que o
   * usuário tomou, e o exemplo é otimização em cima dela. O teto de 10 e a unicidade são do
   * banco, então tentar de novo o que já existe simplesmente não passa — e está certo.
   */
  const fixarValor = async (slug: string, valor: number, transacoes?: any[]) => {
    const user = (await supabase.auth.getUser()).data.user;
    await supabase.from('compromissos').update({ valor_mensal: valor, status: 'aceito' }).eq('slug', slug);

    if (user && transacoes?.length) {
      const jaTem = new Set(
        exemplos.filter(e => e.slug === slug).map(e => e.transaction_id),
      );
      const novos = transacoes
        .filter(t => !jaTem.has(t.id))
        .slice(0, Math.max(0, TETO_EXEMPLOS - jaTem.size))
        .map(t => ({ user_id: user.id, slug, transaction_id: t.id }));

      if (novos.length > 0) {
        const { error } = await supabase.from('compromisso_exemplos').insert(novos);
        if (error) console.error('Exemplos não gravados; o valor fixado continua valendo:', error);
      }
    }
    await carregar();
  };

  const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  if (carregando) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {confirmacao && (
        <ConfirmModal
          title={confirmacao.titulo}
          message={confirmacao.mensagem}
          onConfirm={confirmacao.onConfirmar}
          onCancel={() => setConfirmacao(null)}
        />
      )}

      <header>
        <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
          <Layers size={32} className="text-primary" /> Compromissos
        </h2>
        <p className="text-text-light mt-1">
          Quanto do seu dinheiro já tem dono antes de você decidir qualquer coisa.
        </p>
      </header>

      {/* ⭐ A resposta da tela, sozinha na própria caixa. Dividir a linha com o rótulo à
          esquerda e o número à direita fazia dele mais um item de cabeçalho. */}
      <div className="glass-panel p-8 text-center">
        <span className="text-text-light text-sm uppercase font-bold tracking-wider">
          Comprometido por mês
        </span>
        <div className="text-5xl font-bold text-text mt-2">{brl(total)}</div>

        {/* ⭐ A frase que só existe porque parcela tem fim conhecido — e a razão de as duas
            telas terem virado uma. Para assinatura não dá para dizer nada: pode durar
            para sempre. */}
        {alivio && (
          <div className="mt-4 inline-flex items-start gap-2 text-sm bg-[#10b981]/5 rounded-xl p-3 text-left">
            <TrendingDown size={16} className="text-[#10b981] shrink-0 mt-0.5" />
            <span className="text-text-light">
              A partir de <strong className="text-text">{alivio.rotulo}</strong>, cai para{' '}
              <strong className="text-text">{brl(alivio.valor)}</strong> — são{' '}
              {brl(alivio.diferenca)} a menos por mês, quando as parcelas acabam.
            </span>
          </div>
        )}
      </div>

      {/* ⭐⭐ O painel decomposto: um total só esconderia o que dá para cancelar.
          ⭐ E o card É o botão da aba — três cards e, logo abaixo, três abas repetindo os
          mesmos nomes seria o mesmo controle duas vezes. */}
      <div className="glass-panel p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CardCamada
            id="contratado"
            titulo="Contratado"
            valor={brl(contratado)}
            nota="Parcelas. Você deve, e tem data de fim"
            cor="text-danger"
            icone={CreditCard}
            ativo={aba === 'contratado'}
            onClick={() => setAba('contratado')}
          />
          <CardCamada
            id="recorrente"
            titulo="Recorrente"
            valor={brl(recorrente)}
            nota="Dia e valor previsíveis. Dá para cancelar"
            cor="text-azul"
            icone={Anchor}
            ativo={aba === 'recorrente'}
            onClick={() => setAba('recorrente')}
          />
          <CardCamada
            id="previsivel"
            titulo="Previsível"
            valor={brl(previsivel)}
            nota="Mercado, combustível. Você vai gastar"
            cor="text-[#10b981]"
            icone={ShoppingCart}
            ativo={aba === 'previsivel'}
            onClick={() => setAba('previsivel')}
          />
        </div>
      </div>

      {aba === 'recorrente' && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="font-bold text-text">Ativos</h3>
            {fixosAtivos.length === 0 ? (
              /* ⭐ O vazio aqui é espera, não falta de ação: não há nada para o usuário
                 fazer além de importar. Dizer isso evita que ele procure um botão que não
                 existe mais. */
              <div className="glass-panel p-8 text-center text-text-light">
                Nada por aqui ainda — seus gastos fixos são importados automaticamente.
                <div className="text-xs mt-1 text-text-light/70">
                  Depois de {PISO} cobranças iguais, a assinatura aparece como proposta.
                </div>
              </div>
            ) : (
              fixosAtivos.map(f => (
                <FixoAtivo
                  key={f.id}
                  f={f}
                  brl={brl}
                  lancamentos={lancamentosDoFixo(f, transacoes)}
                  encerramento={encerramentos.get(f.id) ?? null}
                  onExcluir={() => excluirFixo(f.id)}
                  onEncerrar={() => aceitarProposta(encerramentos.get(f.id)!)}
                  onIgnorar={() => recusarProposta(encerramentos.get(f.id)!)}
                />
              ))
            )}

          </section>

          {propostasAbertas.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-bold text-text">Propostas</h3>
              {propostasAbertas.map((p, i) => (
                <Proposta
                  key={`${p.assinatura}-${i}`}
                  p={p}
                  brl={brl}
                  onAceitar={() => aceitarProposta(p)}
                  onRecusar={() => recusarProposta(p)}
                />
              ))}
            </section>
          )}

          {recusados.length > 0 && (
            <section>
              {/* ⚠️ Discreto de propósito: recusa é decisão que o usuário quer esquecer.
                  Mas precisa ser encontrável, senão "para sempre" vira "sem saída". */}
              <button
                onClick={() => setVerRecusados(v => !v)}
                className="flex items-center gap-2 text-sm text-text-light hover:text-text transition-colors"
              >
                {verRecusados ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {recusados.length} proposta{recusados.length > 1 ? 's' : ''} recusada
                {recusados.length > 1 ? 's' : ''}
              </button>

              {verRecusados && (
                <div className="mt-3 space-y-2">
                  {recusados.map(f => {
                    const eraCorrecao = String(f.assinatura ?? '').startsWith(PREFIXO_CORRECAO);
                    return (
                      <div key={f.id} className="glass-panel p-3 flex items-center justify-between gap-3 opacity-70 hover:opacity-100 transition-opacity">
                        <div className="min-w-0">
                          <span className="text-sm text-text truncate">{f.nome}</span>
                          <div className="text-[11px] text-text-light">
                            {eraCorrecao ? 'Correção recusada' : 'Não é um gasto fixo'}
                            {' · '}{brl(Number(f.valor))}
                          </div>
                        </div>
                        <button
                          onClick={() => desfazerRecusa(f.id)}
                          className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors shrink-0"
                          title="A proposta volta a aparecer"
                        >
                          <Undo2 size={14} /> Desfazer
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {aba === 'previsivel' && (
        <section className="space-y-3">
          {/* ⚠️ A lista de tipos só governa esta aba. No cabeçalho, o botão valia para as três
              e sugeria configurar coisas que ele não configura.
              ⭐ Navegação, não modal: a configuração mora no /perfil (D-029). */}
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h3 className="font-bold text-text">Previsíveis</h3>
            <button
              onClick={() => navigate('/perfil')}
              className="glass-input flex items-center gap-2 px-4 py-2 text-sm font-medium hover:text-primary transition-colors"
            >
              <Settings2 size={16} /> Editar lista de compromissos
            </button>
          </div>
          {detectados.length === 0 ? (
            <div className="glass-panel p-8 text-center text-text-light">
              Nenhum compromisso previsível detectado. Eles aparecem quando 3 transações do mesmo
              tipo são importadas.
            </div>
          ) : (
            detectados.map(c => (
              <div key={c.slug} className="glass-panel p-4">
                <button
                  onClick={() => setExpandido(expandido === c.slug ? null : c.slug)}
                  className="w-full flex items-center justify-between gap-4"
                >
                  <div className="text-left">
                    <span className="font-medium text-text">{c.titulo}</span>
                    <div className="text-xs text-text-light">
                      {c.transacoes.length} lançamentos em {c.ciclos} ciclo(s)
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-bold text-text">{brl(valorDoCompromisso(c))}/mês</div>
                      {c.valorFixado == null && (
                        <div className="text-[10px] text-text-light">média observada</div>
                      )}
                    </div>
                    {expandido === c.slug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {/* ⚠️ Fora do cabeçalho porque ele é um <button> inteiro, e botão dentro de
                    botão é HTML inválido. Aqui o ícone fica visível com o card fechado, que
                    é o ponto. */}
                <ExemplosDoCompromisso
                  exemplos={exemplos.filter(e => e.slug === c.slug)}
                  className="mt-2"
                />

                {/* ⭐ Avisa, não age: valor que persegue a própria média nunca discorda de você. */}
                {c.divergente && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-text-light bg-primary/5 rounded-lg p-3">
                    <Info size={14} className="text-primary shrink-0 mt-0.5" />
                    <span>
                      Os lançamentos recentes dão {brl(c.amortizadoObservado)}/mês, e você fixou{' '}
                      {brl(c.valorFixado!)}.{' '}
                      <button
                        onClick={() => fixarValor(c.slug, c.amortizadoObservado, c.transacoes)}
                        className="text-primary font-medium underline"
                      >
                        Atualizar
                      </button>
                    </span>
                  </div>
                )}

                {expandido === c.slug && (
                  <div className="mt-4 space-y-1 border-t border-border pt-3">
                    {c.valorFixado == null && (
                      <button
                        onClick={() => fixarValor(c.slug, c.amortizadoObservado, c.transacoes)}
                        className="text-xs text-primary font-medium mb-2"
                      >
                        Fixar {brl(c.amortizadoObservado)}/mês
                      </button>
                    )}
                    {c.transacoes.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between text-xs py-1">
                        <span className="text-text-light truncate">
                          {t.data} · {t.apelido || t.nome}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-text">{brl(Math.abs(Number(t.valor)))}</span>
                          <button
                            onClick={() => removerDoCompromisso(t.id)}
                            className="text-text-light hover:text-danger p-1"
                            title="Tirar deste compromisso"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* ⭐ Acrescentar existe porque a IA erra mais para menos que para
                        mais: ela não rotula o que não reconhece. */}
                    <div className="pt-2 mt-2 border-t border-border">
                      <input
                        value={buscaTransacao}
                        onChange={e => setBuscaTransacao(e.target.value)}
                        placeholder="Buscar transação para acrescentar..."
                        className="glass-input w-full p-2 text-xs bg-white"
                      />
                      {buscaTransacao.trim().length >= 2 && (
                        <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                          {transacoes
                            .filter(t =>
                              Number(t.valor) < 0 &&
                              t.compromisso !== c.slug &&
                              `${t.nome} ${t.apelido ?? ''}`.toLowerCase()
                                .includes(buscaTransacao.toLowerCase().trim()))
                            .slice(0, 8)
                            .map((t: any) => (
                              <button
                                key={t.id}
                                onClick={() => acrescentarAoCompromisso(t.id, c.slug)}
                                className="w-full flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-primary/10 transition-colors"
                              >
                                <span className="text-text-light truncate">
                                  {t.data} · {t.apelido || t.nome}
                                </span>
                                <span className="text-text shrink-0 ml-2">
                                  {brl(Math.abs(Number(t.valor)))}
                                </span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {aba === 'contratado' && (
        <div className="space-y-6">
          {/* ⚠️ Dois números grandes na mesma tela parecem contradição, e não são: o card do
              topo diz quanto sai POR MÊS, este diz o TOTAL que ainda falta pagar. */}
          {emAndamento.length > 0 && (
            <div className="glass-panel p-6">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-light font-bold">
                    Comprometido restante
                  </p>
                  <p className="text-4xl font-bold text-danger mt-1">{brl(restante)}</p>
                  <p className="text-sm text-text-light mt-1">
                    {faltamParcelas} parcela{faltamParcelas === 1 ? '' : 's'} a vencer em{' '}
                    {emAndamento.length} compra{emAndamento.length === 1 ? '' : 's'}
                  </p>
                </div>

                {projecao.length > 0 && (
                  <div className="flex-1 min-w-[280px]">
                    <p className="text-xs uppercase tracking-wider text-text-light font-bold mb-2">
                      Saída por ciclo
                    </p>
                    <div className="flex items-end gap-3 flex-wrap">
                      {projecao.map(c => (
                        <div key={c.cicloKey} className="text-center">
                          <div className="text-[11px] text-text-light">{c.rotulo}</div>
                          <div className="text-sm font-bold text-text">{brl(c.valor)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {emAndamento.length === 0 && concluidas.length === 0 ? (
            <div className="glass-panel p-12 text-center text-text-light">
              Você não possui nenhuma compra parcelada registrada.
            </div>
          ) : (
            <>
              <section>
                <h3 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                  <CreditCard size={20} className="text-primary" /> Em andamento
                </h3>
                {emAndamento.length === 0 ? (
                  <div className="glass-panel p-8 text-center text-text-light bg-white/20">
                    Nenhuma compra parcelada em andamento.
                  </div>
                ) : (
                  <Colunas
                    itens={emAndamento}
                    render={g => (
                      <CardParcelas
                        key={g[0].id}
                        grupo={g}
                        brl={brl}
                        aberto={grupoAberto === g[0].id}
                        onAlternar={() => setGrupoAberto(grupoAberto === g[0].id ? null : g[0].id)}
                        onExcluir={() => excluirGrupo(g)}
                      />
                    )}
                  />
                )}
              </section>

              {concluidas.length > 0 && (
                <section>
                  <h3 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                    <Check size={20} className="text-[#10b981]" /> Quitadas
                  </h3>
                  <Colunas
                    itens={concluidas}
                    render={g => (
                      <CardParcelas
                        key={g[0].id}
                        grupo={g}
                        brl={brl}
                        aberto={grupoAberto === g[0].id}
                        onAlternar={() => setGrupoAberto(grupoAberto === g[0].id ? null : g[0].id)}
                        onExcluir={() => excluirGrupo(g)}
                      />
                    )}
                  />
                </section>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}

/** As três camadas de certeza. ⭐ Também são as abas: o nome do conceito é um só. */
type Camada = 'contratado' | 'recorrente' | 'previsivel';

function CardCamada({ titulo, valor, nota, cor, icone: Icone, ativo, onClick }: {
  id: Camada; titulo: string; valor: string; nota: string; cor: string;
  icone: LucideIcon; ativo: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-4 transition-all ${
        ativo
          ? 'bg-white ring-2 ring-primary shadow-md'
          : 'bg-white/50 hover:bg-white/80'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-text-light tracking-wider">
        <Icone size={12} /> {titulo}
      </div>
      <div className={`text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
      <div className="text-[10px] text-text-light mt-1">{nota}</div>
    </button>
  );
}

const ROTULO_NATUREZA: Record<string, string> = {
  criar: 'Parece um gasto fixo novo',
  corrigir: 'O valor mudou',
  encerrar: 'Não vejo isto há um tempo',
};

/**
 * A lista de lançamentos que sustenta um gasto fixo — na proposta e no ativo.
 *
 * ⭐ Compartilhada de propósito. Antes a evidência existia só na proposta pendente: aceita,
 * o "por que isto virou um fixo" sumia da tela. E a lista aqui é **derivada na hora**, não a
 * cópia guardada em `fixos.evidencia` — cobranças novas aparecem sozinhas, sem escrita
 * nenhuma no banco. É a D-013: não guarde o que dá para derivar.
 */
function Lancamentos({ itens, brl, rotulo }: {
  itens: any[]; brl: (v: number) => string; rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  if (itens.length === 0) {
    return (
      <div className="text-[11px] text-text-light/70 mt-1">
        Sem lançamentos vinculados
      </div>
    );
  }
  return (
    <>
      <button onClick={() => setAberto(v => !v)} className="text-[11px] text-primary mt-1">
        {aberto ? 'ocultar' : 'ver'} {rotulo ?? 'os'} {itens.length} lançamentos
      </button>
      {aberto && (
        <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
          {itens.map((t: any) => (
            <div key={t.id} className="text-[11px] text-text-light">
              {t.data} · {t.nome} · {brl(Math.abs(Number(t.valor)))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Um gasto fixo ativo, com os lançamentos que o sustentam e o aviso de silêncio. */
function FixoAtivo({ f, brl, lancamentos, encerramento, onExcluir, onEncerrar, onIgnorar }: {
  f: any; brl: (v: number) => string; lancamentos: any[];
  encerramento: PropostaDeFixo | null;
  onExcluir: () => void; onEncerrar: () => void; onIgnorar: () => void;
}) {
  return (
    <div className="glass-panel p-4 group">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="font-medium text-text">{f.nome}</span>
          <div className="text-xs text-text-light">
            {f.dia ? `dia ${f.dia}` : 'sem dia'}
            {(f.periodicidade_meses ?? 1) > 1 && ` · a cada ${f.periodicidade_meses} meses`}
            {f.origem === 'manual' && ' · cadastrado por você'}
          </div>
          <Lancamentos itens={lancamentos} brl={brl} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-bold text-text">{brl(Number(f.valor))}</div>
            {(f.periodicidade_meses ?? 1) > 1 && (
              <div className="text-[10px] text-text-light" title="Amortizado por mês">
                {brl(Number(f.valor) / f.periodicidade_meses)}/mês
              </div>
            )}
          </div>
          <button
            onClick={onExcluir}
            className="p-2 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            title="Excluir"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* ⚠️ O texto diz há quanto tempo, não "cancelado": o produto não vê cancelamento,
          vê ausência. Quem conclui é você, no botão ao lado. */}
      {encerramento && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2 text-xs text-danger">
            <AlertTriangle size={14} className="shrink-0" />
            Sem cobrança há {encerramento.silencioCiclos} ciclos — ainda paga isto?
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onEncerrar}
              className="text-xs px-3 py-1 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
            >
              Encerrar
            </button>
            <button
              onClick={onIgnorar}
              className="text-xs px-3 py-1 rounded-lg text-text-light hover:bg-black/5 transition-colors"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Proposta({ p, brl, onAceitar, onRecusar }: {
  p: PropostaDeFixo; brl: (v: number) => string; onAceitar: () => void; onRecusar: () => void;
}) {
  return (
    <div className="glass-panel p-4 border-l-4 border-primary">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase font-bold text-azul tracking-wider">
            {ROTULO_NATUREZA[p.natureza]}
          </div>
          <div className="font-medium text-text truncate">{p.nome}</div>
          {/* ⭐ Os dois valores lado a lado. Sem o antigo não dá para julgar a correção — e é
              esta linha que torna visível um casamento errado com o fixo. */}
          {p.natureza === 'corrigir' && p.nomeDoFixo && (
            <div className="text-[11px] text-text-light">
              corrige «{p.nomeDoFixo}» · {brl(p.valorAtual ?? 0)} → {brl(p.valor)}
            </div>
          )}
          <div className="text-xs text-text-light">
            {brl(p.valor)} · dia {p.dia}
            {p.periodicidade_meses > 1 && ` · a cada ${p.periodicidade_meses} meses`}
          </div>
          {/* ⭐ Evidência é o que torna a proposta discutível: sem ver o que a gerou, aceitar é chute. */}
          <Lancamentos itens={p.evidencia} brl={brl} />
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onAceitar} className="p-2 text-primary hover:bg-primary/10 rounded-lg" title="Aceitar">
            <Check size={18} />
          </button>
          <button onClick={onRecusar} className="p-2 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg" title="Recusar">
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Os mesmos pontos de quebra do Tailwind: `md` e `xl`. */
const LARGURAS = ['(min-width: 1280px)', '(min-width: 768px)'];

function quantasColunas(): number {
  if (typeof window === 'undefined') return 3;
  if (window.matchMedia(LARGURAS[0]).matches) return 3;
  return window.matchMedia(LARGURAS[1]).matches ? 2 : 1;
}

/**
 * Colunas que crescem de forma independente — o que um grid não faz.
 *
 * ⚠️ Num grid, expandir um card faz a **linha inteira** crescer, e tudo abaixo dela desce
 * junto. `items-start` resolve só metade do problema: os vizinhos param de esticar, mas a
 * linha continua empurrando o resto da página.
 *
 * ⛔ CSS multi-column (`columns-3`) resolveria em uma classe, e é a tentação óbvia. Mas ele
 * rebalanceia a altura sozinho: ao expandir um card, os outros **pulam de coluna**. Trocaria
 * um incômodo por um pior.
 *
 * ⭐ Distribuir por `i % n` mantém a leitura da esquerda para a direita — os três primeiros
 * itens continuam sendo a primeira "linha" visual, e nenhum card muda de coluna ao expandir.
 */
function Colunas({ itens, render }: { itens: any[]; render: (item: any) => ReactNode }) {
  const [colunas, setColunas] = useState(quantasColunas);

  useEffect(() => {
    const consultas = LARGURAS.map(q => window.matchMedia(q));
    const aoMudar = () => setColunas(quantasColunas());
    consultas.forEach(c => c.addEventListener('change', aoMudar));
    return () => consultas.forEach(c => c.removeEventListener('change', aoMudar));
  }, []);

  return (
    <div className="flex gap-6 items-start">
      {Array.from({ length: colunas }, (_, col) => (
        <div key={col} className="flex-1 min-w-0 flex flex-col gap-6">
          {itens.filter((_, i) => i % colunas === col).map(render)}
        </div>
      ))}
    </div>
  );
}

/**
 * Uma compra parcelada.
 *
 * ⭐ Mostra a **compra**, não a parcela: valor pago, pendente e total. É o que responde
 * "quanto ainda devo disto", que a linha de uma parcela sozinha não responde.
 *
 * ⚠️ Toda conta vem de `contaDaCompra`. Card que calcula sozinho é a D-007.
 */
function CardParcelas({ grupo, brl, aberto, onAlternar, onExcluir }: {
  grupo: any[]; brl: (v: number) => string;
  aberto: boolean; onAlternar: () => void; onExcluir: () => void;
}) {
  const base = grupo[0];
  const c = contaDaCompra(grupo);
  const pct = Math.min((c.pagas / c.totalParcelas) * 100, 100);

  return (
    <div
      className={`glass-panel p-6 flex flex-col gap-4 relative overflow-hidden group/card border-t-4 transition-all duration-300 ${
        c.concluida
          ? 'border-t-[#10b981] hover:border-t-[#059669] bg-[#10b981]/[0.01]'
          : 'border-t-transparent hover:border-t-primary'
      }`}
    >
      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover/card:opacity-100 transition-opacity">
        <button
          onClick={onExcluir}
          className="text-text-light hover:text-danger p-2 bg-white rounded-full shadow-md transition-all"
          title="Excluir a compra inteira"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <ListChecks size={14} className={c.concluida ? 'text-[#10b981]' : 'text-primary'} />
          <span className="text-[10px] text-text-light font-bold uppercase tracking-wider">
            Última entrada: {base.data}
          </span>
        </div>
        <h3 className="font-bold text-lg text-text leading-tight">{base.apelido || base.nome}</h3>
        {base.apelido && base.apelido !== base.nome && (
          <div className="text-[10px] text-text-light/70 break-words leading-tight mt-0.5" title={base.nome}>
            Original: {base.nome}
          </div>
        )}
        {base.banco && (
          <div className={`text-sm mt-1 font-medium ${c.concluida ? 'text-[#10b981]' : 'text-azul'}`}>
            {base.banco}
          </div>
        )}
      </div>

      <div className="mt-auto pt-4 border-t border-border">
        <div className="flex justify-between items-end mb-2">
          <div>
            <span className="text-xs text-text-light uppercase block">Valor da parcela</span>
            <span className="font-bold text-danger text-lg">{brl(c.valorParcela)}</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-text-light uppercase block">Progresso</span>
            <span className={`font-bold text-lg ${c.concluida ? 'text-[#10b981]' : 'text-text'}`}>
              {c.pagas} de {c.totalParcelas}
            </span>
          </div>
        </div>

        <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ease-out ${c.concluida ? 'bg-[#10b981]' : 'bg-primary/70'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <div className="text-xs text-text-light flex justify-between">
            <span>Valor pago:</span>
            <span className={`font-medium ${c.concluida ? 'text-[#10b981]' : 'text-azul'}`}>
              {brl(c.valorPago)}
            </span>
          </div>
          <div className="text-xs text-text-light flex justify-between">
            <span>Valor pendente:</span>
            <span className={`font-medium ${c.valorPendente > 0 ? 'text-danger' : 'text-text-light'}`}>
              {brl(c.valorPendente)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Valor total:</span>
            <span className="font-medium text-text">{brl(c.valorTotal)}</span>
          </div>
        </div>

        <button
          onClick={onAlternar}
          className={`mt-4 w-full flex items-center justify-center gap-1 text-xs font-bold transition-colors py-2 border-t border-border/50 ${
            c.concluida ? 'text-[#10b981] hover:text-[#059669]' : 'text-primary hover:text-primary-hover'
          }`}
        >
          {aberto
            ? <><ChevronUp size={14} /> Ocultar histórico</>
            : <><ChevronDown size={14} /> Ver parcelas pagas</>}
        </button>

        {aberto && (
          <div className={`mt-2 flex flex-col gap-2 p-3 rounded-lg border ${
            c.concluida ? 'bg-[#10b981]/5 border-[#10b981]/10' : 'bg-primary/5 border-primary/10'
          }`}>
            <h4 className="text-[10px] font-bold text-text-light uppercase tracking-wider mb-1">
              Histórico de pagamentos
            </h4>
            {grupo.map((t: any) => (
              <div key={t.id} className="flex justify-between items-center text-xs border-b border-border/30 pb-1 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium text-text">{t.data}</span>
                  <span className="text-[10px] text-text-light ml-2">({t.nome})</span>
                </div>
                <span className={`font-bold ${c.concluida ? 'text-[#10b981]' : 'text-azul'}`}>
                  {brl(Math.abs(Number(t.valor)))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
