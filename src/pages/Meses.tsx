import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, Trash2, Edit2, CheckCircle, XCircle, ChevronUp, Minus, Search, ListFilter, X, PieChart as PieChartIcon, BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import ConfirmModal from '../components/ConfirmModal';
import { MESES, getCycleKey } from '../lib/ciclo';

export default function Meses() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const [sortConfig, setSortConfig] = useState<{ key: 'data' | 'valor', direction: 'asc' | 'desc' } | null>(null);
  const [filterApelido, setFilterApelido] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [isApelidoFilterOpen, setIsApelidoFilterOpen] = useState(false);
  const [isCategoriaFilterOpen, setIsCategoriaFilterOpen] = useState(false);
  const [cicloDia, setCicloDia] = useState<number>(5);
  const [dashboardType, setDashboardType] = useState<'bar' | 'pie'>('pie');

  const handleSort = (key: 'data' | 'valor') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      setSortConfig(null);
      return;
    }
    setSortConfig({ key, direction });
  };

  useEffect(() => {
    fetchTransactions();
    fetchCategories();
    fetchCiclo();
  }, []);

  const fetchCiclo = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const { data, error } = await supabase.from('memory').select('ciclo_dia').eq('user_id', user.id).single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data && data.ciclo_dia) {
        setCicloDia(data.ciclo_dia);
      }
    } catch (err) {
      console.error("Erro ao buscar ciclo:", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id).order('nome');
      if (error) throw error;
      if (data) setCategories(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('transactions')
        .select('*, categories(nome, cor)')
        .eq('user_id', user.id)
        .eq('pendente', false)
        .order('data', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Erro ao buscar transações:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Transação',
      message: 'Tem certeza que deseja excluir esta transação?',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('transactions').delete().eq('id', id);
          if (error) throw error;
          setTransactions(prev => prev.filter(t => t.id !== id));
        } catch (error) {
          console.error("Erro ao excluir:", error);
          alert("Erro ao excluir transação.");
        }
      }
    });
  };

  const startEditing = (t: any) => {
    setEditingId(t.id);
    setEditForm({
      data: t.data,
      apelido: t.apelido || t.nome,
      categoria_id: t.categoria_id || '',
      mes_fatura: t.mes_fatura || '',
      valor: t.valor,
      parcela_atual: t.parcela_atual || '',
      parcela_total: t.parcela_total || ''
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEditing = async (id: string) => {
    try {
      const updates = {
        data: editForm.data,
        apelido: editForm.apelido,
        categoria_id: editForm.categoria_id || null,
        mes_fatura: editForm.mes_fatura || null,
        valor: parseFloat(editForm.valor),
        parcela_atual: editForm.parcela_atual ? parseInt(editForm.parcela_atual) : null,
        parcela_total: editForm.parcela_total ? parseInt(editForm.parcela_total) : null
      };

      const { error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      // Atualiza o estado local incluindo o nome da categoria para a UI
      const selectedCategory = categories.find(c => c.id === updates.categoria_id);

      setTransactions(prev => prev.map(t => {
        if (t.id === id) {
          return {
            ...t,
            ...updates,
            categories: selectedCategory ? { nome: selectedCategory.nome } : null
          };
        }
        return t;
      }));

      setEditingId(null);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar alterações.");
    }
  };

  const groupTransactionsByCycle = () => {
    const cycles: Record<string, any[]> = {};

    transactions.forEach(t => {
      const cycleKey = getCycleKey(t.data, t.mes_fatura, cicloDia);
      if (!cycles[cycleKey]) {
        cycles[cycleKey] = [];
      }
      cycles[cycleKey].push(t);
    });

    return cycles;
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev =>
      prev.includes(monthKey) ? prev.filter(m => m !== monthKey) : [...prev, monthKey]
    );
  };

  const cycles = groupTransactionsByCycle();
  const sortedCycleKeys = Object.keys(cycles).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {confirmModal.isOpen && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        />
      )}
      <header>
        <h2 className="text-3xl font-bold text-text flex items-center gap-3">
          <CalendarIcon size={32} className="text-primary" /> Balanços Mensais
        </h2>
        <p className="text-text-light mt-1">Transações agrupadas do dia {cicloDia} ao dia {cicloDia} do mês seguinte.</p>
      </header>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : sortedCycleKeys.length === 0 ? (
        <div className="glass-panel p-12 text-center text-text-light">
          Nenhuma transação concluída encontrada. Aprove prints na aba Novos Registros!
        </div>
      ) : (
        <div className="space-y-4">
          {sortedCycleKeys.map(key => {
            const cycleTransactions = cycles[key];
            const isExpanded = expandedMonths.includes(key);

            const [year, month] = key.split('-');
            const cycleName = `Balanço de ${MESES[parseInt(month) - 1]} ${year}`;

            const entradas = cycleTransactions.reduce((acc, curr) => curr.valor > 0 ? acc + Number(curr.valor) : acc, 0);
            const saidas = cycleTransactions.reduce((acc, curr) => curr.valor < 0 ? acc + Math.abs(Number(curr.valor)) : acc, 0);
            const saldoMes = entradas - saidas;

            // Agrupar transações por categoria para exibir acima das transações
            const categoriesMap: Record<string, { totalSpent: number; totalReceived: number; cor: string }> = {};
            cycleTransactions.forEach(t => {
              const catName = t.categories?.nome || 'Sem categoria';
              const catCor = t.categories?.cor || '#64748b'; // default slate color
              if (!categoriesMap[catName]) {
                categoriesMap[catName] = { totalSpent: 0, totalReceived: 0, cor: catCor };
              }
              const valorNum = Number(t.valor);
              if (valorNum < 0) {
                categoriesMap[catName].totalSpent += Math.abs(valorNum);
              } else {
                categoriesMap[catName].totalReceived += valorNum;
              }
            });

            const despesasCategories = Object.entries(categoriesMap)
              .filter(([_, data]) => data.totalSpent > 0)
              .sort((a, b) => b[1].totalSpent - a[1].totalSpent);

            const receitasCategories = Object.entries(categoriesMap)
              .filter(([_, data]) => data.totalReceived > 0)
              .sort((a, b) => b[1].totalReceived - a[1].totalReceived);

            return (
              <div key={key} className="glass-panel overflow-hidden transition-all duration-300">
                <button
                  onClick={() => toggleMonth(key)}
                  className="w-full p-4 flex items-center justify-between bg-white/40 hover:bg-white/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={20} className="text-primary" /> : <ChevronRight size={20} className="text-text-light" />}
                    <h3 className="text-lg font-bold text-text">{cycleName}</h3>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                      {cycleTransactions.length} itens
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <div className="w-[110px] flex justify-end">
                      {entradas > 0 && (
                        <span className="bg-[#10b981]/10 text-[#10b981] px-2 py-1 rounded-lg border border-[#10b981]/20 w-full text-center whitespace-nowrap">
                          +R$ {entradas.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </div>
                    <div className="w-[110px] flex justify-end">
                      {saidas > 0 && (
                        <span className="bg-black/5 text-black px-2 py-1 rounded-lg border border-black/10 w-full text-center whitespace-nowrap">
                          -R$ {saidas.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </div>
                    <div className="w-[130px] flex justify-end">
                      <span className={`text-lg px-2 py-1 rounded-lg border w-full text-center whitespace-nowrap ${saldoMes >= 0 ? 'bg-primary/10 text-primary border-primary/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
                        R$ {saldoMes.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-4 border-t border-border bg-white/20">
                    {/* Resumo por Categoria - Dois Dashboards */}
                    {(despesasCategories.length > 0 || receitasCategories.length > 0) && (
                      <>
                        {/* Toggle de Visualização */}
                        <div className="flex justify-start mb-4">
                          <div className="flex bg-white/40 p-1 rounded-lg border border-border/40">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDashboardType('pie'); }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${dashboardType === 'pie' ? 'bg-white shadow-sm text-primary' : 'text-text-light hover:text-text'}`}
                            >
                              <PieChartIcon size={14} /> Pizza
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDashboardType('bar'); }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${dashboardType === 'bar' ? 'bg-white shadow-sm text-primary' : 'text-text-light hover:text-text'}`}
                            >
                              <BarChart3 size={14} /> Barras
                            </button>
                          </div>
                        </div>

                        {dashboardType === 'bar' ? (
                          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Dashboard de Despesas (Barras) */}
                            {despesasCategories.length > 0 && (
                              <div className="flex flex-col gap-3">
                                <h4 className="text-xs font-bold text-danger uppercase tracking-wider border-b border-danger/20 pb-2">
                                  Despesas por Categoria (Total: R$ {saidas.toFixed(2).replace('.', ',')})
                                </h4>
                                <div className="flex flex-col gap-2">
                                  {despesasCategories.map(([catName, data]) => {
                                    const percentage = saidas > 0 ? (data.totalSpent / saidas) * 100 : 0;
                                    return (
                                      <div key={catName} className="flex items-center gap-3 group h-8">
                                        <div className="w-24 shrink-0 text-right">
                                          <span className="text-xs font-semibold text-text truncate block" title={catName}>{catName}</span>
                                        </div>
                                        <div className="flex-1 flex items-center gap-2">
                                          <div className="flex-1 rounded-full overflow-hidden relative">
                                            <div
                                              className="h-2 group-hover:h-4 transition-all duration-300 ease-out rounded-full min-w-[4px]"
                                              style={{ width: `${Math.max(percentage, 1)}%`, backgroundColor: data.cor }}
                                            ></div>
                                          </div>
                                          <div className="w-[120px] shrink-0 text-right">
                                            <span className="text-[11px] font-semibold text-text-light">
                                              R$ {data.totalSpent.toFixed(2).replace('.', ',')} ({percentage.toFixed(1)}%)
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Dashboard de Receitas (Barras) */}
                            {receitasCategories.length > 0 && (
                              <div className="flex flex-col gap-3">
                                <h4 className="text-xs font-bold text-[#10b981] uppercase tracking-wider border-b border-[#10b981]/20 pb-2">
                                  Receitas por Categoria (Total: R$ {entradas.toFixed(2).replace('.', ',')})
                                </h4>
                                <div className="flex flex-col gap-2">
                                  {receitasCategories.map(([catName, data]) => {
                                    const percentage = entradas > 0 ? (data.totalReceived / entradas) * 100 : 0;
                                    return (
                                      <div key={catName} className="flex items-center gap-3 group h-8">
                                        <div className="w-24 shrink-0 text-right">
                                          <span className="text-xs font-semibold text-text truncate block" title={catName}>{catName}</span>
                                        </div>
                                        <div className="flex-1 flex items-center gap-2">
                                          <div className="flex-1 rounded-full overflow-hidden relative">
                                            <div
                                              className="h-2 group-hover:h-4 transition-all duration-300 ease-out rounded-full min-w-[4px]"
                                              style={{ width: `${Math.max(percentage, 1)}%`, backgroundColor: data.cor }}
                                            ></div>
                                          </div>
                                          <div className="w-[120px] shrink-0 text-right">
                                            <span className="text-[11px] font-semibold text-text-light">
                                              R$ {data.totalReceived.toFixed(2).replace('.', ',')} ({percentage.toFixed(1)}%)
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mb-6 flex flex-col gap-10 items-center">
                            {/* Dashboard de Despesas (Pizza) */}
                            {despesasCategories.length > 0 && (
                              <div className="flex flex-col gap-3 w-full max-w-[600px]">
                                <h4 className="text-sm font-bold text-danger uppercase tracking-wider border-b border-danger/20 pb-2 text-center">
                                  Despesas por Categoria (Total: R$ {saidas.toFixed(2).replace('.', ',')})
                                </h4>
                                <div className="h-[350px] w-full mt-2">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={despesasCategories.map(([n, d]) => ({ name: n, value: d.totalSpent, cor: d.cor }))}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={90}
                                        outerRadius={140}
                                        paddingAngle={5}
                                        dataKey="value"
                                        label={({ name, percent }: { name?: string; percent?: number }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                      >
                                        {despesasCategories.map((_, idx) => (
                                          <Cell key={`cell-${idx}`} fill={despesasCategories[idx][1].cor} />
                                        ))}
                                      </Pie>
                                      <RechartsTooltip
                                        formatter={(value: any) => [`R$ ${Number(value).toFixed(2).replace('.', ',')}`, '']}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            )}

                            {/* Dashboard de Receitas (Pizza) */}
                            {receitasCategories.length > 0 && (
                              <div className="flex flex-col gap-3 w-full max-w-[600px]">
                                <h4 className="text-sm font-bold text-[#10b981] uppercase tracking-wider border-b border-[#10b981]/20 pb-2 text-center">
                                  Receitas por Categoria (Total: R$ {entradas.toFixed(2).replace('.', ',')})
                                </h4>
                                <div className="h-[350px] w-full mt-2">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={receitasCategories.map(([n, d]) => ({ name: n, value: d.totalReceived, cor: d.cor }))}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={90}
                                        outerRadius={140}
                                        paddingAngle={3}
                                        dataKey="value"
                                        label={({ name, percent }: { name?: string; percent?: number }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                      >
                                        {receitasCategories.map((_, idx) => (
                                          <Cell key={`cell-${idx}`} fill={receitasCategories[idx][1].cor} />
                                        ))}
                                      </Pie>
                                      <RechartsTooltip
                                        formatter={(value: any) => [`R$ ${Number(value).toFixed(2).replace('.', ',')}`, 'Recebido']}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border text-sm text-text-light">
                            <th className="pb-2 font-medium w-[15%]">
                              <div className="flex items-center gap-1 cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('data')} title="Ordenar por Data">
                                Data (Y/M/D)
                                {sortConfig?.key === 'data' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <Minus size={14} />}
                              </div>
                            </th>
                            <th className="pb-2 font-medium w-[35%]">
                              <div className="flex items-center gap-1">
                                <span>Apelido</span>
                                <button onClick={() => setIsApelidoFilterOpen(!isApelidoFilterOpen)} className={`p-1 rounded hover:md-black/5 transition-colors ${filterApelido ? 'text-primary' : ''}`} title="Buscar Apelido">
                                  <Search size={14} />
                                </button>
                                {isApelidoFilterOpen && (
                                  <div className="relative ml-2 flex-1">
                                    <input
                                      type="text"
                                      value={filterApelido}
                                      onChange={e => setFilterApelido(e.target.value)}
                                      placeholder="Buscar..."
                                      className="glass-input text-xs p-1 pr-6 w-full max-w-[100px] font-normal"
                                      autoFocus
                                    />
                                    {filterApelido && (
                                      <button onClick={() => setFilterApelido('')} className="absolute right-1 top-1/2 -translate-y-1/2 text-text-light hover:text-danger">
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </th>
                            <th className="pb-2 font-medium w-[20%] text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span>Categoria</span>
                                <button onClick={() => setIsCategoriaFilterOpen(!isCategoriaFilterOpen)} className={`p-1 rounded hover:bg-black/5 transition-colors ${filterCategoria ? 'text-primary' : ''}`} title="Filtrar Categoria">
                                  <ListFilter size={14} />
                                </button>
                                {isCategoriaFilterOpen && (
                                  <select
                                    value={filterCategoria}
                                    onChange={e => setFilterCategoria(e.target.value)}
                                    className="glass-input text-xs py-0.5 px-1 ml-1 font-normal cursor-pointer w-[95px]"
                                  >
                                    <option value="">Todas</option>
                                    {categories.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                                  </select>
                                )}
                              </div>
                            </th>
                            <th className="pb-2 font-medium w-[15%] text-center">
                              <div className="flex items-center justify-center gap-1 cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('valor')} title="Ordenar por Valor">
                                Valor
                                {sortConfig?.key === 'valor' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <Minus size={14} />}
                              </div>
                            </th>
                            <th className="pb-2 font-medium w-[15%] text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            let filtered = cycleTransactions.filter(t => {
                              if (filterApelido && !(t.apelido || t.nome).toLowerCase().includes(filterApelido.toLowerCase())) return false;
                              if (filterCategoria && t.categories?.nome !== filterCategoria) return false;
                              return true;
                            });

                            if (sortConfig) {
                              filtered.sort((a, b) => {
                                if (sortConfig.key === 'data') {
                                  return sortConfig.direction === 'asc' ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data);
                                } else if (sortConfig.key === 'valor') {
                                  return sortConfig.direction === 'asc' ? a.valor - b.valor : b.valor - a.valor;
                                }
                                return 0;
                              });
                            }

                            if (filtered.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={5} className="py-8 text-center text-text-light text-sm bg-white/10 rounded-xl">
                                    Nenhuma transação corresponde aos filtros atuais.
                                  </td>
                                </tr>
                              );
                            }

                            return filtered.map(t => {

                              const isEditing = editingId === t.id;

                              if (isEditing) {
                                return (
                                  <tr key={t.id} className="border-b border-border/50 bg-primary/5">
                                    <td className="py-2 px-1">
                                      <input
                                        type="date"
                                        value={editForm.data}
                                        onChange={e => setEditForm({ ...editForm, data: e.target.value })}
                                        className="glass-input w-full p-1 text-sm bg-white mb-1"
                                      />
                                      <select
                                        value={editForm.mes_fatura || ''}
                                        onChange={e => setEditForm({ ...editForm, mes_fatura: e.target.value || null })}
                                        className="glass-input w-full p-1 text-xs bg-white text-text-light"
                                        title="Balanço (Mês da Fatura)"
                                      >
                                        <option value="">Ciclo do dia {cicloDia}</option>
                                        {MESES.map(mes => (
                                          <option key={mes} value={mes}>{mes}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-2 px-1">
                                      <input
                                        type="text"
                                        value={editForm.apelido}
                                        onChange={e => setEditForm({ ...editForm, apelido: e.target.value })}
                                        className="glass-input w-full p-1 text-sm bg-white"
                                      />
                                      {t.nome && t.nome !== 'Nova Transação' && t.nome !== 'Nova transação' && (
                                        <div className="mt-1 text-[10px] text-text-light/70 break-words whitespace-normal" title={t.nome}>
                                          Original: {t.nome}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2 px-1 text-center">
                                      <select
                                        value={editForm.categoria_id}
                                        onChange={e => setEditForm({ ...editForm, categoria_id: e.target.value })}
                                        className="glass-input w-full p-1 text-sm bg-white appearance-none text-center"
                                      >
                                        <option value="">Selecione...</option>
                                        {categories.map(c => (
                                          <option key={c.id} value={c.id}>{c.nome}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-2 px-1">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={editForm.valor}
                                        onChange={e => setEditForm({ ...editForm, valor: e.target.value })}
                                        className="glass-input w-full p-1 text-lg font-extrabold text-center bg-white"
                                      />
                                      <div className="flex items-center justify-center gap-1 mt-1">
                                        <span className="text-[10px] text-text-light font-semibold">Parc:</span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          value={editForm.parcela_atual}
                                          onChange={e => setEditForm({ ...editForm, parcela_atual: e.target.value })}
                                          className="glass-input w-10 px-1 py-0.5 text-[11px] text-center bg-white font-medium"
                                        />
                                        <span className="text-[10px] text-text-light font-bold">/</span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          value={editForm.parcela_total}
                                          onChange={e => setEditForm({ ...editForm, parcela_total: e.target.value })}
                                          className="glass-input w-10 px-1 py-0.5 text-[11px] text-center bg-white font-medium"
                                        />
                                      </div>
                                    </td>
                                    <td className="py-2 px-1 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        <button
                                          onClick={() => saveEditing(t.id)}
                                          className="text-primary hover:text-primary-hover p-1"
                                          title="Salvar"
                                        >
                                          <CheckCircle size={18} />
                                        </button>
                                        <button
                                          onClick={cancelEditing}
                                          className="text-text-light hover:text-danger p-1"
                                          title="Cancelar"
                                        >
                                          <XCircle size={18} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              // View Mode
                              return (
                                <tr key={t.id} className="border-b border-border/50 hover:bg-white/40 transition-colors">
                                  <td className="py-3 text-sm">
                                    <div>
                                      {t.data.split('-')[2]} de <span className="text-primary font-semibold">{MESES[parseInt(t.data.split('-')[1]) - 1]}</span>
                                    </div>
                                  </td>
                                  <td className="py-3">
                                      <div className="font-medium text-text">{t.apelido || t.nome}</div>
                                      {t.nome && t.nome !== 'Nova Transação' && t.nome !== 'Nova transação' && (
                                        <div className="text-[10px] text-text-light/70 break-words whitespace-normal" title={t.nome}>
                                          Original: {t.nome}
                                        </div>
                                      )}
                                  </td>
                                  <td className="py-3 text-sm text-center">
                                    <span className="bg-background px-3 py-1.5 rounded-md border border-border">
                                      {t.categories?.nome || 'Sem categoria'}
                                    </span>
                                  </td>
                                  <td className={`py-3 text-center ${t.valor >= 0 ? 'text-primary' : 'text-danger'}`}>
                                    <div className="text-lg font-extrabold">R$ {Number(t.valor).toFixed(2)}</div>
                                    {t.parcela_total && (
                                      <div className="text-[10px] text-text-light mt-0.5 font-medium uppercase">
                                        Parcela {t.parcela_atual || 1}/{t.parcela_total}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => startEditing(t)}
                                        className="text-text-light hover:text-primary transition-colors p-1"
                                        title="Editar"
                                      >
                                        <Edit2 size={16} />
                                      </button>
                                      <button
                                        onClick={() => deleteTransaction(t.id)}
                                        className="text-text-light hover:text-danger transition-colors p-1"
                                        title="Excluir"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
