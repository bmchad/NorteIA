import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Anchor, CreditCard, Layers, Settings2, Check, X, Info, ChevronDown, ChevronUp, PlusCircle, Trash2 } from 'lucide-react';
import { getCycleKey } from '../lib/ciclo';
import { contaDaCompra, comprometidoMensal } from '../lib/parcelas';
import { comprometidoRecorrente, detectarPropostas, type PropostaDeFixo } from '../lib/fixos-propostos';
import { agruparPorCompromisso, totalPrevisivel, valorDoCompromisso } from '../lib/compromissos';

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
  const [aba, setAba] = useState<'recorrentes' | 'parcelas'>('recorrentes');

  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [fixos, setFixos] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [cicloDia, setCicloDia] = useState(5);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [novo, setNovo] = useState({ nome: '', valor: '', dia: '' });

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setCarregando(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const [mem, tx, fx, tp] = await Promise.all([
        supabase.from('memory').select('ciclo_dia').maybeSingle(),
        supabase.from('transactions').select('*').eq('pendente', false),
        supabase.from('fixos').select('*'),
        supabase.from('compromissos').select('*').order('titulo'),
      ]);

      setCicloDia(mem.data?.ciclo_dia ?? 5);
      setTransacoes(tx.data ?? []);
      setFixos(fx.data ?? []);
      setTipos(tp.data ?? []);
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

  const gruposParcelas = useMemo(() => agruparParcelas(transacoes), [transacoes]);
  const emAndamento = useMemo(
    () => gruposParcelas.filter(g => g.length < (g[0].parcela_total || 1)),
    [gruposParcelas],
  );

  const detectados = useMemo(
    () => agruparPorCompromisso(transacoes, tipos, t => getCycleKey(t.data, t.mes_fatura, cicloDia)),
    [transacoes, tipos, cicloDia],
  );

  const fixosAtivos = fixos.filter(f => f.status === 'ativo');

  // ⛔ As três camadas somam conjuntos disjuntos. Parcela entra só no Contratado; a cascata
  // garante que uma transação reivindicada por 1.b não chega ao rótulo de compromisso.
  const contratado = comprometidoMensal(emAndamento);
  const recorrente = comprometidoRecorrente(fixosAtivos);
  const previsivel = totalPrevisivel(detectados);
  const total = contratado + recorrente + previsivel;

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
    const prefixo = p.natureza === 'corrigir' ? 'CORRIGIR::' : '';
    await supabase.from('fixos').insert([{
      user_id: user.id, nome: p.nome, valor: p.valor, dia: p.dia,
      periodicidade_meses: p.periodicidade_meses, origem: p.origem,
      status: 'recusado', assinatura: prefixo + p.assinatura,
    }]);
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
   * Cadastro manual de gasto fixo.
   *
   * ⭐ Continua existindo, e a deduplicação depende disso: um fixo manual tem o nome que
   * VOCÊ digitou (`Netflix`), enquanto o candidato tem o do extrato (`NETFLIX.COM`). É por
   * isso que a chave de casamento aceita dia OU nome, e não só nome.
   *
   * ⚠️ Dia é opcional de propósito: "gasto uns R$ 300 no mercado" é cadastro legítimo, e
   * obrigar o dia expulsaria esse caso.
   */
  const adicionarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = parseFloat(novo.valor.replace(',', '.'));
    if (!novo.nome.trim() || isNaN(valor)) return;

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    await supabase.from('fixos').insert([{
      user_id: user.id, nome: novo.nome.trim(), valor,
      dia: novo.dia ? parseInt(novo.dia) : null,
      origem: 'manual', status: 'ativo', periodicidade_meses: 1,
    }]);
    setNovo({ nome: '', valor: '', dia: '' });
    await carregar();
  };

  const excluirFixo = async (id: string) => {
    await supabase.from('fixos').delete().eq('id', id);
    await carregar();
  };

  const fixarValor = async (slug: string, valor: number) => {
    await supabase.from('compromissos').update({ valor_mensal: valor, status: 'aceito' }).eq('slug', slug);
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
      <header className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold text-text flex items-center gap-3">
            <Layers size={32} className="text-primary" /> Compromissos
          </h2>
          <p className="text-text-light mt-1">
            Quanto do seu dinheiro já tem dono antes de você decidir qualquer coisa.
          </p>
        </div>
        {/* ⭐ Navegação, não modal: a configuração mora no /perfil (D-029). */}
        <button
          onClick={() => navigate('/perfil')}
          className="glass-input flex items-center gap-2 px-4 py-2 text-sm font-medium hover:text-primary transition-colors"
        >
          <Settings2 size={16} /> Editar lista de compromissos
        </button>
      </header>

      {/* ⭐⭐ O painel decomposto: um total só esconderia o que dá para cancelar. */}
      <div className="glass-panel p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <span className="text-text-light text-sm uppercase font-bold tracking-wider">
            Comprometido por mês
          </span>
          <span className="text-4xl font-bold text-text">{brl(total)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
          <Camada
            titulo="Contratado"
            valor={brl(contratado)}
            nota="Parcelas. Você deve, e tem data de fim"
            cor="text-danger"
          />
          <Camada
            titulo="Recorrente"
            valor={brl(recorrente)}
            nota="Assinatura e mensalidade. Dá para cancelar"
            cor="text-primary"
          />
          <Camada
            titulo="Previsível"
            valor={brl(previsivel)}
            nota="Mercado, combustível. Você vai gastar"
            cor="text-[#10b981]"
          />
        </div>
      </div>

      <div className="flex gap-2">
        {([['recorrentes', 'Gastos fixos', Anchor], ['parcelas', 'Parcelas', CreditCard]] as const).map(
          ([id, rotulo, Icone]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                aba === id ? 'bg-primary text-white shadow-md' : 'text-text-light hover:bg-white/60'
              }`}
            >
              <Icone size={16} /> {rotulo}
            </button>
          ),
        )}
      </div>

      {aba === 'recorrentes' ? (
        <div className="space-y-6">
          {propostas.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-bold text-text">Propostas</h3>
              {propostas.map((p, i) => (
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

          <section className="space-y-3">
            <h3 className="font-bold text-text">Ativos</h3>
            {fixosAtivos.length === 0 ? (
              <div className="glass-panel p-8 text-center text-text-light">
                Nenhum gasto fixo ainda. Importe alguns meses de extrato e as propostas aparecem aqui.
              </div>
            ) : (
              fixosAtivos.map(f => (
                <div key={f.id} className="glass-panel p-4 flex items-center justify-between gap-4 group">
                  <div className="min-w-0">
                    <span className="font-medium text-text">{f.nome}</span>
                    <div className="text-xs text-text-light">
                      {f.dia ? `dia ${f.dia}` : 'sem dia'}
                      {(f.periodicidade_meses ?? 1) > 1 && ` · a cada ${f.periodicidade_meses} meses`}
                      {f.origem === 'manual' && ' · cadastrado por você'}
                    </div>
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
                      onClick={() => excluirFixo(f.id)}
                      className="p-2 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}

            <form onSubmit={adicionarManual} className="glass-panel p-4 flex flex-wrap gap-2">
              <input
                value={novo.nome}
                onChange={e => setNovo({ ...novo, nome: e.target.value })}
                placeholder="Nome do gasto fixo"
                className="glass-input p-2 text-sm bg-white flex-1 min-w-[160px]"
              />
              <input
                value={novo.valor}
                onChange={e => setNovo({ ...novo, valor: e.target.value })}
                placeholder="Valor" inputMode="decimal"
                className="glass-input p-2 text-sm bg-white w-28"
              />
              <input
                value={novo.dia}
                onChange={e => setNovo({ ...novo, dia: e.target.value })}
                placeholder="Dia (opcional)" type="number" min={1} max={31}
                className="glass-input p-2 text-sm bg-white w-32"
                title="Opcional: 'gasto uns R$ 300 no mercado' é cadastro legítimo"
              />
              <button type="submit" className="bg-primary text-white px-4 rounded-xl hover:bg-primary-hover transition-colors">
                <PlusCircle size={18} />
              </button>
            </form>
          </section>

          <section className="space-y-3">
            <h3 className="font-bold text-text">Previsíveis</h3>
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

                  {/* ⭐ Avisa, não age: valor que persegue a própria média nunca discorda de você. */}
                  {c.divergente && (
                    <div className="mt-3 flex items-start gap-2 text-xs text-text-light bg-primary/5 rounded-lg p-3">
                      <Info size={14} className="text-primary shrink-0 mt-0.5" />
                      <span>
                        Os lançamentos recentes dão {brl(c.amortizadoObservado)}/mês, e você fixou{' '}
                        {brl(c.valorFixado!)}.{' '}
                        <button
                          onClick={() => fixarValor(c.slug, c.amortizadoObservado)}
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
                          onClick={() => fixarValor(c.slug, c.amortizadoObservado)}
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
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      ) : (
        <section className="space-y-3">
          {emAndamento.length === 0 ? (
            <div className="glass-panel p-8 text-center text-text-light">
              Nenhuma compra parcelada em andamento.
            </div>
          ) : (
            emAndamento.map(g => {
              const c = contaDaCompra(g);
              return (
                <div key={g[0].id} className="glass-panel p-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-medium text-text">{g[0].apelido || g[0].nome}</span>
                    <div className="text-xs text-text-light">
                      {c.pagas} de {c.totalParcelas} · faltam {c.faltam}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-text">{brl(c.valorParcela)}/mês</div>
                    <div className="text-[10px] text-text-light">
                      {brl(c.valorPendente)} pendente
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

function Camada({ titulo, valor, nota, cor }: { titulo: string; valor: string; nota: string; cor: string }) {
  return (
    <div className="bg-white/50 rounded-xl p-4">
      <div className="text-[10px] uppercase font-bold text-text-light tracking-wider">{titulo}</div>
      <div className={`text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
      <div className="text-[10px] text-text-light mt-1">{nota}</div>
    </div>
  );
}

const ROTULO_NATUREZA: Record<string, string> = {
  criar: 'Parece um gasto fixo novo',
  corrigir: 'O valor mudou',
  encerrar: 'Não vejo isto há um tempo',
};

function Proposta({ p, brl, onAceitar, onRecusar }: {
  p: PropostaDeFixo; brl: (v: number) => string; onAceitar: () => void; onRecusar: () => void;
}) {
  const [verEvidencia, setVerEvidencia] = useState(false);
  return (
    <div className="glass-panel p-4 border-l-4 border-primary">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase font-bold text-primary tracking-wider">
            {ROTULO_NATUREZA[p.natureza]}
          </div>
          <div className="font-medium text-text truncate">{p.nome}</div>
          <div className="text-xs text-text-light">
            {brl(p.valor)} · dia {p.dia}
            {p.periodicidade_meses > 1 && ` · a cada ${p.periodicidade_meses} meses`}
          </div>
          {/* ⭐ Evidência é o que torna a proposta discutível: sem ver o que a gerou, aceitar é chute. */}
          <button
            onClick={() => setVerEvidencia(v => !v)}
            className="text-[11px] text-primary mt-1"
          >
            {verEvidencia ? 'ocultar' : 'ver'} os {p.evidencia.length} lançamentos
          </button>
          {verEvidencia && (
            <div className="mt-2 space-y-0.5">
              {p.evidencia.map((t: any) => (
                <div key={t.id} className="text-[11px] text-text-light">
                  {t.data} · {t.nome} · {brl(Math.abs(Number(t.valor)))}
                </div>
              ))}
            </div>
          )}
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

/**
 * Agrupa parcelas soltas na compra original.
 *
 * ⭐ Por valor, total e dia próximo — nunca por nome. O nome vem sujo do extrato e muda
 * entre faturas da mesma compra; estes três não mudam. Ver D-008.
 */
function agruparParcelas(transacoes: any[]): any[][] {
  const grupos: any[][] = [];
  for (const p of transacoes.filter(t => t.parcela_total)) {
    const valor = Math.abs(Number(p.valor)).toFixed(2);
    const total = p.parcela_total || 1;
    const dia = parseInt(String(p.data).split('-')[2], 10);

    const grupo = grupos.find(g => {
      const b = g[0];
      return Math.abs(Number(b.valor)).toFixed(2) === valor
        && (b.parcela_total || 1) === total
        && Math.abs(parseInt(String(b.data).split('-')[2], 10) - dia) <= 2;
    });
    if (grupo) grupo.push(p);
    else grupos.push([p]);
  }
  return grupos;
}
