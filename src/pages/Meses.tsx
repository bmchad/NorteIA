import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, Trash2, Edit2, CheckCircle, XCircle } from 'lucide-react';

export default function Meses() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    fetchTransactions();
    fetchCategories();
  }, []);

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
        .select('*, categories(nome)')
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
    if (!confirm('Tem certeza que deseja excluir esta transação?')) return;

    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error("Erro ao excluir:", error);
      alert("Erro ao excluir transação.");
    }
  };

  const startEditing = (t: any) => {
    setEditingId(t.id);
    setEditForm({
      data: t.data,
      apelido: t.apelido || t.nome,
      categoria_id: t.categoria_id || '',
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
      const date = new Date(t.data);
      const day = date.getDate();
      let cycleMonth = date.getMonth();
      let cycleYear = date.getFullYear();

      if (day >= 5) {
        cycleMonth += 1;
        if (cycleMonth > 11) {
          cycleMonth = 0;
          cycleYear += 1;
        }
      }

      const cycleKey = `${cycleYear}-${String(cycleMonth + 1).padStart(2, '0')}`;

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
      <header>
        <h2 className="text-3xl font-bold text-text flex items-center gap-3">
          <CalendarIcon size={32} className="text-primary" /> Balanços Mensais
        </h2>
        <p className="text-text-light mt-1">Transações agrupadas do dia 05 ao dia 05 do mês seguinte.</p>
      </header>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : sortedCycleKeys.length === 0 ? (
        <div className="glass-panel p-12 text-center text-text-light">
          Nenhuma transação concluída encontrada. Aprove prints na aba Pendentes!
        </div>
      ) : (
        <div className="space-y-4">
          {sortedCycleKeys.map(key => {
            const cycleTransactions = cycles[key];
            const isExpanded = expandedMonths.includes(key);

            const [year, month] = key.split('-');
            const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            const cycleName = `Balanço de ${monthNames[parseInt(month) - 1]} ${year}`;

            const entradas = cycleTransactions.reduce((acc, curr) => curr.valor > 0 ? acc + Number(curr.valor) : acc, 0);
            const saidas = cycleTransactions.reduce((acc, curr) => curr.valor < 0 ? acc + Math.abs(Number(curr.valor)) : acc, 0);
            const saldoMes = entradas - saidas;

            // Agrupar transações por categoria para exibir acima das transações
            const categoriesMap: Record<string, { totalSpent: number; totalReceived: number }> = {};
            cycleTransactions.forEach(t => {
              const catName = t.categories?.nome || 'Sem categoria';
              if (!categoriesMap[catName]) {
                categoriesMap[catName] = { totalSpent: 0, totalReceived: 0 };
              }
              const valorNum = Number(t.valor);
              if (valorNum < 0) {
                categoriesMap[catName].totalSpent += Math.abs(valorNum);
              } else {
                categoriesMap[catName].totalReceived += valorNum;
              }
            });

            const sortedCategories = Object.entries(categoriesMap)
              .filter(([_, data]) => data.totalSpent > 0 || data.totalReceived > 0)
              .sort((a, b) => b[1].totalSpent - a[1].totalSpent || b[1].totalReceived - a[1].totalReceived);

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
                  <div className="flex items-center gap-4 text-sm font-bold">
                    {entradas > 0 && <span className="text-[#10b981]">+R$ {entradas.toFixed(2).replace('.', ',')}</span>}
                    {saidas > 0 && <span className="text-black">-R$ {saidas.toFixed(2).replace('.', ',')}</span>}
                    <span className={`text-lg ml-2 ${saldoMes >= 0 ? 'text-primary' : 'text-danger'}`}>
                      R$ {saldoMes.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-4 border-t border-border bg-white/20">
                    {/* Resumo por Categoria em Duas Colunas */}
                    {sortedCategories.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-xs font-bold text-text-light uppercase tracking-wider mb-3">
                          Gasto por Categoria
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {sortedCategories.map(([catName, data]) => {
                            const hasSpent = data.totalSpent > 0;
                            const hasReceived = data.totalReceived > 0;

                            return (
                              <div
                                key={catName}
                                className="bg-white/45 border border-border/40 rounded-xl p-3 flex flex-col gap-1.5 hover:bg-white/60 transition-colors shadow-sm"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold text-text text-sm">{catName}</span>
                                  <div className="text-right flex flex-col">
                                    {hasSpent && (
                                      <span className="text-sm font-bold text-danger">
                                        - R$ {data.totalSpent.toFixed(2).replace('.', ',')}
                                      </span>
                                    )}
                                    {hasReceived && (
                                      <span className="text-xs font-semibold text-[#10b981]">
                                        + R$ {data.totalReceived.toFixed(2).replace('.', ',')}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {hasSpent && saidas > 0 && (
                                  <div className="w-full bg-black/5 rounded-full h-1 overflow-hidden">
                                    <div
                                      className="bg-danger/60 h-1 rounded-full"
                                      style={{ width: `${Math.min(100, (data.totalSpent / saidas) * 100)}%` }}
                                    ></div>
                                  </div>
                                )}

                                {!hasSpent && hasReceived && entradas > 0 && (
                                  <div className="w-full bg-black/5 rounded-full h-1 overflow-hidden">
                                    <div
                                      className="bg-[#10b981]/60 h-1 rounded-full"
                                      style={{ width: `${Math.min(100, (data.totalReceived / entradas) * 100)}%` }}
                                    ></div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border text-sm text-text-light">
                            <th className="pb-2 font-medium w-[15%]">Data (Y/M/D)</th>
                            <th className="pb-2 font-medium w-[35%]">Apelido</th>
                            <th className="pb-2 font-medium w-[20%] text-center">Categoria</th>
                            <th className="pb-2 font-medium w-[15%] text-center">Valor</th>
                            <th className="pb-2 font-medium w-[15%] text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cycleTransactions.map(t => {
                            const isEditing = editingId === t.id;

                            if (isEditing) {
                              return (
                                <tr key={t.id} className="border-b border-border/50 bg-primary/5">
                                  <td className="py-2 px-1">
                                    <input
                                      type="date"
                                      value={editForm.data}
                                      onChange={e => setEditForm({ ...editForm, data: e.target.value })}
                                      className="glass-input w-full p-1 text-sm bg-white"
                                    />
                                  </td>
                                  <td className="py-2 px-1">
                                    <input
                                      type="text"
                                      value={editForm.apelido}
                                      onChange={e => setEditForm({ ...editForm, apelido: e.target.value })}
                                      className="glass-input w-full p-1 text-sm bg-white"
                                    />
                                    <div className="mt-1 text-[10px] text-text-light/70 break-words whitespace-normal" title={t.nome}>
                                      Original: {t.nome}
                                    </div>
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
                                <td className="py-3 text-sm">{t.data}</td>
                                <td className="py-3">
                                  <div className="font-medium text-text">{t.apelido || t.nome}</div>
                                  <div className="text-[10px] text-text-light/70 break-words whitespace-normal" title={t.nome}>
                                    Original: {t.nome}
                                  </div>
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
                          })}
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
