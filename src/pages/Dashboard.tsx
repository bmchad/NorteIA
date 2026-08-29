import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Info, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { getCycleKey } from '../lib/ciclo';
import { comprometidoMensal, comprometidoRestante, parcelasRestantes } from '../lib/parcelas';

export default function Dashboard() {
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [entradas, setEntradas] = useState(0);
  // Renda é o subconjunto das entradas que vem de categoria marcada como renda. Estorno e
  // reembolso entram positivos e NÃO são renda -- somá-los infla o divisor e faz o
  // comprometimento parecer menor do que é. Ver context/30-decisoes-e-licoes.md D-025.
  const [renda, setRenda] = useState(0);
  const [temCategoriaRenda, setTemCategoriaRenda] = useState(true);
  const [saidas, setSaidas] = useState(0);
  const [mesesAtivos, setMesesAtivos] = useState(1);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [latestTransaction, setLatestTransaction] = useState<any>(null);
  const [cicloDia, setCicloDia] = useState<number>(5);
  const [restanteParcelas, setRestanteParcelas] = useState(0);
  const [qtdParcelasRestantes, setQtdParcelasRestantes] = useState(0);
  const [mensalParcelas, setMensalParcelas] = useState(0);

  // Calculadora state
  const [calcParcela, setCalcParcela] = useState<number | ''>(100);
  const [calcMeses, setCalcMeses] = useState<number | ''>(12);
  const [calcTaxa, setCalcTaxa] = useState<number | ''>(12);
  const [calcIr, setCalcIr] = useState<number | ''>(25);
  const [isCalcExpanded, setIsCalcExpanded] = useState(false);

  // Notas state
  const [nota, setNota] = useState('');
  const [notaSaving, setNotaSaving] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchNota();
  }, [ano]);

  const fetchNota = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const { data, error } = await supabase
        .from('memory')
        .select('content')
        .eq('user_id', user.id)
        .single();

      // Error PGRST116 occurs when 0 rows are returned, which is fine for new users
      if (error && error.code !== 'PGRST116') throw error;
      if (data) setNota(data.content || '');
    } catch (err) {
      console.error("Erro ao buscar nota:", err);
    }
  };

  const saveNota = async (newText: string) => {
    setNota(newText);
    setNotaSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data: existing } = await supabase.from('memory').select('id').eq('user_id', user.id).single();

      if (existing) {
        await supabase.from('memory').update({ content: newText, updated_at: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await supabase.from('memory').insert([{ user_id: user.id, content: newText }]);
      }
    } catch (err) {
      console.error("Erro ao salvar nota:", err);
    } finally {
      setNotaSaving(false);
    }
  };

  /**
   * O comprometido futuro das compras parceladas.
   *
   * ⚠️ Agrupa como a tela /parcelas agrupa -- por valor absoluto, total de parcelas e dia
   * de cobranca proximo. Enquanto o agrupamento nao tiver dono unico, os dois lugares
   * precisam concordar; o calculo em cima dele ja mora em src/lib/parcelas.ts.
   */
  const fetchComprometido = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('pendente', false)
        .not('parcela_total', 'is', null);

      if (error) throw error;

      const grupos: any[][] = [];
      for (const p of data ?? []) {
        const valor = Math.abs(Number(p.valor)).toFixed(2);
        const total = p.parcela_total || 1;
        const dia = parseInt(p.data.split('-')[2], 10);

        const grupo = grupos.find(g => {
          const b = g[0];
          return Math.abs(Number(b.valor)).toFixed(2) === valor
            && (b.parcela_total || 1) === total
            && Math.abs(parseInt(b.data.split('-')[2], 10) - dia) <= 2;
        });

        if (grupo) grupo.push(p);
        else grupos.push([p]);
      }

      const emAndamento = grupos.filter(g => g.length < (g[0].parcela_total || 1));
      setRestanteParcelas(comprometidoRestante(emAndamento));
      setQtdParcelasRestantes(parcelasRestantes(emAndamento));
      setMensalParcelas(comprometidoMensal(emAndamento));
    } catch (err) {
      console.error("Erro ao buscar comprometido de parcelas:", err);
    }
  };

  const fetchCiclo = async (userId: string) => {
    try {
      const { data, error } = await supabase.from('memory').select('ciclo_dia').eq('user_id', userId).single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data && data.ciclo_dia) {
        setCicloDia(data.ciclo_dia);
        return data.ciclo_dia as number;
      }
    } catch (err) {
      console.error("Erro ao buscar ciclo:", err);
    }
    return 5;
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      // Lido aqui, e nao do state: na primeira renderizacao o valor de `cicloDia` ainda e o
      // padrao, e agrupar com o ciclo errado nao se corrige sozinho depois.
      const ciclo = await fetchCiclo(user.id);

      // O ano do Dashboard e o ano de CICLOS, nao o ano-calendario: com ciclo 5, ele vai de
      // 06/01 a 05/01 do ano seguinte, igual a soma dos 12 ciclos exibidos em /meses.
      // A busca leva um mes de folga em cada ponta porque a transacao de borda tem `data`
      // fora do ano do seu proprio ciclo; o recorte exato e feito abaixo, por getCycleKey.
      const anoNum = parseInt(ano);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('pendente', false)
        .gte('data', `${anoNum - 1}-12-01`)
        .lte('data', `${anoNum + 1}-01-31`);

      if (error) throw error;

      // Enquanto o usuário não marcar nenhuma categoria, `rendaIds` fica vazio e a tela cai
      // no comportamento antigo: toda entrada conta como renda, com um aviso discreto.
      const { data: cats } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('e_renda', true);
      const rendaIds = new Set((cats ?? []).map(c => c.id));
      setTemCategoriaRenda(rendaIds.size > 0);

      let inTotal = 0;
      let rendaTotal = 0;
      let outTotal = 0;
      const uniqueMonths = new Set();

      data?.forEach(t => {
        if (!t.data) return;

        const cycleKey = getCycleKey(t.data, t.mes_fatura, ciclo);
        if (!cycleKey.startsWith(ano)) return;

        if (t.valor >= 0) {
          inTotal += Number(t.valor);
          if (rendaIds.size === 0 || rendaIds.has(t.categoria_id)) rendaTotal += Number(t.valor);
        }
        else outTotal += Math.abs(Number(t.valor));

        uniqueMonths.add(cycleKey);
      });

      setEntradas(inTotal);
      setRenda(rendaTotal);
      setSaidas(outTotal);
      setMesesAtivos(uniqueMonths.size > 0 ? uniqueMonths.size : 1);

      setChartData([
        { name: 'Entradas', value: inTotal, color: '#0ea5e9' }, // primary
        { name: 'Saídas', value: outTotal, color: '#991b1b' }  // danger
      ]);

      await fetchComprometido(user.id);

      // Buscar última transação
      const { data: latest } = await supabase
        .from('transactions')
        .select('*, categories(nome)')
        .eq('user_id', user.id)
        .eq('pendente', false)
        .order('data', { ascending: false })
        .limit(1)
        .single();

      if (latest) {
        setLatestTransaction(latest);
      }

    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const resultadoLiquido = entradas - saidas;

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold text-text">Dashboard Anual</h2>
          <p className="text-text-light mt-1">Visão geral das suas finanças — soma dos 12 ciclos do ano (fechamento no dia {cicloDia}).</p>
        </div>

        <select
          value={ano}
          onChange={(e) => setAno(e.target.value)}
          className="glass-input cursor-pointer font-medium text-lg w-32"
        >
          <option value="2026">2026</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
        </select>
      </header>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* LINHA 1: TOTAIS */}
            <div className="glass-panel p-6 flex flex-col gap-2 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#10b981]"></div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-text-light uppercase tracking-wider">Entradas do Ano</span>
                <div className="bg-[#10b981]/10 p-2 rounded-lg text-[#10b981]">
                  <TrendingUp size={20} />
                </div>
              </div>
              <span className="text-3xl font-bold text-[#10b981] mt-2">R$ {entradas.toFixed(2).replace('.', ',')}</span>
            </div>

            <div className="glass-panel p-6 flex flex-col gap-2 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-danger"></div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-text-light uppercase tracking-wider">Saídas do Ano</span>
                <div className="bg-danger/10 p-2 rounded-lg text-danger">
                  <TrendingDown size={20} />
                </div>
              </div>
              <span className="text-3xl font-bold text-danger mt-2">R$ {saidas.toFixed(2).replace('.', ',')}</span>
            </div>

            <div className="glass-panel p-6 flex flex-col gap-2 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-text-light uppercase tracking-wider">Resultado Líquido</span>
                <div className="bg-primary/10 text-primary p-2 rounded-lg">
                  <DollarSign size={20} />
                </div>
              </div>
              <span className="text-3xl font-bold text-primary mt-2">R$ {resultadoLiquido.toFixed(2).replace('.', ',')}</span>
              {restanteParcelas > 0 && (
                <span className="text-xs text-text-light mt-1" title="Dívida: tudo que ainda vai ser cobrado em parcelas">
                  ⏳ R$ {restanteParcelas.toFixed(2).replace('.', ',')} a pagar em{' '}
                  {qtdParcelasRestantes} parcela{qtdParcelasRestantes === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {/* LINHA 2: MÉDIAS */}
            <div className="glass-panel p-6 flex flex-col gap-2 relative overflow-hidden group opacity-90">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#10b981]"></div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-text-light uppercase tracking-wider">Média de Entradas</span>
                <div className="bg-[#10b981]/10 p-2 rounded-lg text-[#10b981]">
                  <TrendingUp size={20} />
                </div>
              </div>
              <span className="text-2xl font-bold text-[#10b981] mt-2">R$ {(entradas / mesesAtivos).toFixed(2).replace('.', ',')}</span>
              <span className="text-[10px] text-text-light uppercase">Por mês ativo</span>
            </div>

            <div className="glass-panel p-6 flex flex-col gap-2 relative overflow-hidden group opacity-90">
              <div className="absolute top-0 left-0 w-1 h-full bg-danger"></div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-text-light uppercase tracking-wider">Média de Saídas</span>
                <div className="bg-danger/10 p-2 rounded-lg text-danger">
                  <TrendingDown size={20} />
                </div>
              </div>
              <span className="text-2xl font-bold text-danger mt-2">R$ {(saidas / mesesAtivos).toFixed(2).replace('.', ',')}</span>
              <span className="text-[10px] text-text-light uppercase">Por mês ativo</span>
            </div>

            <div className="glass-panel p-6 flex flex-col gap-2 relative overflow-hidden group opacity-90">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-text-light uppercase tracking-wider">Média do Resultado</span>
                <div className="bg-primary/10 text-primary p-2 rounded-lg">
                  <DollarSign size={20} />
                </div>
              </div>
              <span className="text-2xl font-bold text-primary mt-2">R$ {(resultadoLiquido / mesesAtivos).toFixed(2).replace('.', ',')}</span>
              <span className="text-[10px] text-text-light uppercase">Por mês ativo</span>
            </div>

            {/* Comprometido por mes: e FLUXO, entao mora na linha das medias, onde a unidade
                bate com a renda. A divida total fica no card do resultado, que e anual. */}
            {mensalParcelas > 0 && (
              <div className="glass-panel p-6 flex flex-col gap-2 relative overflow-hidden group opacity-90">
                <div className="absolute top-0 left-0 w-1 h-full bg-danger"></div>
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium text-text-light uppercase tracking-wider">Comprometido por Mês</span>
                  <div className="bg-danger/10 text-danger p-2 rounded-lg">
                    <TrendingDown size={20} />
                  </div>
                </div>
                <span className="text-2xl font-bold text-danger mt-2">R$ {mensalParcelas.toFixed(2).replace('.', ',')}</span>
                {renda > 0 ? (
                  <span
                    className="text-[10px] text-text-light uppercase"
                    title={temCategoriaRenda
                      ? 'Quanto da sua renda média já tem dono antes de você decidir qualquer coisa'
                      : 'Somando toda entrada, inclusive estorno e reembolso. Marque suas categorias de renda no Perfil para este número ficar exato'}
                  >
                    {((mensalParcelas / (renda / mesesAtivos)) * 100).toFixed(0)}% da renda média{temCategoriaRenda ? '' : ' *'}
                  </span>
                ) : (
                  <span className="text-[10px] text-text-light uppercase">Em parcelas</span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-6">
              <div className="glass-panel p-6 min-h-[350px] flex flex-col">
                <h3 className="font-bold text-lg mb-4 text-text">Proporção Anual</h3>
                <div className="flex-1 min-h-[250px]">
                  {entradas === 0 && saidas === 0 ? (
                    <div className="h-full flex items-center justify-center text-text-light">
                      Nenhum dado para exibir neste ano.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text-light uppercase tracking-wider text-sm">Base</span>
                    <div className="group/tooltip relative flex items-center justify-center">
                      <Info size={16} className="text-primary cursor-help" />
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-2 bg-text text-white text-xs rounded-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-10 text-center pointer-events-none shadow-lg">
                        A porcentagem das entradas que se tornam resultado
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-text"></div>
                      </div>
                    </div>
                  </div>
                  <span className={`font-bold text-lg ${entradas > 0 ? ((1 - (saidas / entradas)) * 100 >= 0 ? 'text-primary' : 'text-danger') : 'text-text-light'}`}>
                    {entradas > 0 ? ((1 - (saidas / entradas)) * 100).toFixed(2) : '0.00'}%
                  </span>
                </div>
              </div>

              {/* Calculadora de Valor Presente */}
              <div className="glass-panel p-6">
                <button
                  onClick={() => setIsCalcExpanded(!isCalcExpanded)}
                  className="w-full flex items-center justify-between font-bold text-lg text-text group"
                >
                  <div className="flex items-center gap-2">
                    <Calculator size={20} className="text-primary" />
                    Calculadora de Investimentos
                  </div>
                  {isCalcExpanded ? <ChevronUp size={20} className="text-text-light group-hover:text-primary transition-colors" /> : <ChevronDown size={20} className="text-text-light group-hover:text-primary transition-colors" />}
                </button>

                {isCalcExpanded && (
                  <div className="mt-6 pt-6 border-t border-border animate-in slide-in-from-top-2 duration-300">
                    <div className="mb-6 p-4 bg-primary/5 border border-primary/10 rounded-xl">
                      <h5 className="font-bold text-primary text-sm mb-1 flex items-center gap-2">
                        <Info size={14} /> Fórmula do Valor Presente
                      </h5>
                      <p className="text-xs text-text-light leading-relaxed">
                        Essa ferramenta utiliza a fórmula do <strong>Valor Presente de uma Série Uniforme</strong>.
                        Ela calcula o montante exato que você precisa colocar hoje em um investimento (já descontando o imposto de renda cobrado no resgate) para que ele pague todas as parcelas e zere exatamente no último mês.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div>
                        <label className="text-[10px] text-text-light uppercase font-bold block mb-1" title="Valor de cada parcela mensal">Parcela (R$)</label>
                        <input type="number" value={calcParcela} onChange={e => setCalcParcela(e.target.value ? Number(e.target.value) : '')} className="glass-input w-full p-2 text-sm text-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-light uppercase font-bold block mb-1" title="Quantas parcelas faltam para terminar de pagar">Meses Restantes</label>
                        <input type="number" value={calcMeses} onChange={e => setCalcMeses(e.target.value ? Number(e.target.value) : '')} className="glass-input w-full p-2 text-sm text-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-light uppercase font-bold block mb-1" title="Taxa bruta ao ano do seu investimento">Taxa Anual (%)</label>
                        <input type="number" value={calcTaxa} onChange={e => setCalcTaxa(e.target.value ? Number(e.target.value) : '')} className="glass-input w-full p-2 text-sm text-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-light uppercase font-bold block mb-1" title="Aliquota do imposto de renda cobrado no resgate">I.R. (%)</label>
                        <input type="number" value={calcIr} onChange={e => setCalcIr(e.target.value ? Number(e.target.value) : '')} className="glass-input w-full p-2 text-sm text-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                    </div>

                    {(() => {
                      const p = Number(calcParcela) || 0;
                      const n = Number(calcMeses) || 0;
                      const taxa = Number(calcTaxa) || 0;
                      const ir = Number(calcIr) || 0;

                      // Retirando imposto de renda da taxa anual
                      const taxaLiquidaAnual = taxa * (1 - ir / 100);
                      const iAnual = taxaLiquidaAnual / 100;
                      // Encontrando a taxa equivalente mensal (juros compostos)
                      const iMensal = Math.pow(1 + iAnual, 1 / 12) - 1;

                      // Fórmula VPL (Valor Presente)
                      const valorPresente = iMensal > 0 && n > 0
                        ? p * ((1 - Math.pow(1 + iMensal, -n)) / iMensal)
                        : p * n;

                      const rendimento = (p * n) - valorPresente;

                      return (
                        <div className="bg-primary/5 rounded-lg p-4 flex flex-col gap-2 border border-primary/20">
                          <div className="flex justify-between items-end">
                            <span className="text-sm text-text-light font-medium">Valor a investir hoje:</span>
                            <span className="text-2xl font-bold text-primary">R$ {valorPresente.toFixed(2).replace('.', ',')}</span>
                          </div>
                          <div className="flex justify-between items-center mt-2 pt-2 border-t border-primary/10">
                            <span className="text-xs text-text-light">Soma das parcelas: R$ {(p * n).toFixed(2).replace('.', ',')}</span>
                            <span className="text-xs text-[#10b981] font-bold">+ R$ {rendimento.toFixed(2).replace('.', ',')} em juros a favor</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {/* Última Transação */}
              {latestTransaction && (
                <div className="glass-panel p-6 flex flex-col">
                  <h3 className="font-bold text-lg text-text mb-4">Última Transação Registrada</h3>
                  <div className="flex justify-between items-center bg-white/40 p-4 rounded-xl border border-border/50">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-text">{latestTransaction.data}</span>
                      <span className="font-bold text-lg text-text">{latestTransaction.apelido || latestTransaction.nome}</span>
                      <div className="flex gap-2 items-center mt-1">
                        <span className="bg-background px-2 py-0.5 rounded text-[10px] uppercase font-bold text-text-light border border-border">
                          {latestTransaction.categories?.nome || 'Sem categoria'}
                        </span>
                        {latestTransaction.parcela_total && (
                          <span className="text-[10px] uppercase font-bold text-text-light">
                            Parc {latestTransaction.parcela_atual}/{latestTransaction.parcela_total}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`font-extrabold text-xl ${latestTransaction.valor >= 0 ? 'text-primary' : 'text-danger'}`}>
                      R$ {Number(latestTransaction.valor).toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                </div>
              )}

              {/* Notas */}
              <div className="glass-panel p-6 flex-1 flex flex-col min-h-[350px]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-text">Notas</h3>
                  {notaSaving && (
                    <span className="text-xs text-primary flex items-center gap-1 font-medium">
                      <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      Salvando...
                    </span>
                  )}
                </div>
                <textarea
                  className="glass-input flex-1 w-full p-4 resize-none bg-white/40 focus:bg-white/80 transition-colors text-sm text-text"
                  placeholder="Escreva suas metas, lembretes ou estratégias financeiras aqui..."
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  onBlur={(e) => saveNota(e.target.value)}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
