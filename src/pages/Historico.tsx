import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { History, Search, ListFilter, Trash2, Edit2, ChevronUp, ChevronDown, Minus, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { MESES } from '../lib/ciclo';

export default function Historico() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageLimit, setPageLimit] = useState(200);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const [sortConfig, setSortConfig] = useState<{ key: 'data' | 'valor' | 'created_at', direction: 'asc' | 'desc' } | null>({ key: 'created_at', direction: 'desc' });
  const [filterApelido, setFilterApelido] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [isApelidoFilterOpen, setIsApelidoFilterOpen] = useState(false);
  const [isCategoriaFilterOpen, setIsCategoriaFilterOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});
  const [cicloDia, setCicloDia] = useState<number>(5);

  const handleSort = (key: 'data' | 'valor' | 'created_at') => {
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
    fetchCategories();
    fetchCiclo();
  }, []);

  useEffect(() => {
    fetchTransactions(pageLimit > 200);
  }, [pageLimit]);

  const fetchCiclo = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const { data, error } = await supabase.from('memory').select('ciclo_dia').eq('user_id', user.id).single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data && data.ciclo_dia) setCicloDia(data.ciclo_dia);
    } catch (err) {
      console.error(err);
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

  const fetchTransactions = async (isLoadMore = false) => {
    if (!isLoadMore) setLoading(true);
    else setIsLoadingMore(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('transactions')
        .select('*, categories(nome, cor)')
        .eq('user_id', user.id)
        .eq('pendente', false)
        .order('created_at', { ascending: false })
        .limit(pageLimit);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
    } finally {
      if (!isLoadMore) setLoading(false);
      else setIsLoadingMore(false);
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
      parcela_total: t.parcela_total || '',
      comentario: t.comentario || ''
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
        parcela_total: editForm.parcela_total ? parseInt(editForm.parcela_total) : null,
        comentario: editForm.comentario?.trim() ? editForm.comentario.trim() : null
      };

      const { error } = await supabase.from('transactions').update(updates).eq('id', id);
      if (error) throw error;

      const selectedCategory = categories.find(c => c.id === updates.categoria_id);
      setTransactions(prev => prev.map(t => {
        if (t.id === id) {
          return { ...t, ...updates, categories: selectedCategory ? { nome: selectedCategory.nome } : null };
        }
        return t;
      }));
      cancelEditing();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar alterações.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <p className="mt-4 text-text-light font-medium">Buscando histórico...</p>
        </div>
      </div>
    );
  }

  let filtered = transactions.filter(t => {
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
      } else if (sortConfig.key === 'created_at') {
        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return sortConfig.direction === 'asc' ? da - db : db - da;
      }
      return 0;
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {confirmModal.isOpen && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        />
      )}
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-text flex items-center gap-3">
          <History className="text-primary" size={32} />
          Histórico
        </h2>
        <p className="text-text-light mt-2">
          Suas últimas transações registradas, da mais recente para a mais antiga.
        </p>
      </header>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-border/50 text-text-light text-sm uppercase">
                <th className="pb-2 font-medium w-[18%]">
                  <div className="flex items-center gap-1 cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('created_at')} title="Ordenar por Data de Criação">
                    Data de Criação
                    {sortConfig?.key === 'created_at' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <Minus size={14} />}
                  </div>
                </th>
                <th className="pb-2 font-medium w-[18%]">
                  <div className="flex items-center gap-1 cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('data')} title="Ordenar por Data">
                    Data da Compra
                    {sortConfig?.key === 'data' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <Minus size={14} />}
                  </div>
                </th>
                <th className="pb-2 font-medium w-[22%] relative">
                  <div className="flex items-center gap-1">
                    <span>Item</span>
                    <button onClick={() => setIsApelidoFilterOpen(!isApelidoFilterOpen)} className={`p-1 rounded hover:bg-black/5 transition-colors ${filterApelido ? 'text-primary' : ''}`} title="Pesquisar Apelido">
                      <Search size={14} />
                    </button>
                    {isApelidoFilterOpen && (
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={filterApelido}
                        onChange={e => setFilterApelido(e.target.value)}
                        className="glass-input text-xs py-0.5 px-2 ml-1 w-24 font-normal"
                        autoFocus
                      />
                    )}
                  </div>
                </th>
                <th className="pb-2 font-medium w-[17%] text-center">
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
                <th className="pb-2 font-medium w-[13%] text-center">
                  <div className="flex items-center justify-center gap-1 cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('valor')} title="Ordenar por Valor">
                    Valor
                    {sortConfig?.key === 'valor' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <Minus size={14} />}
                  </div>
                </th>
                <th className="pb-2 font-medium w-[12%] text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-light text-sm bg-white/10">
                    Nenhuma transação encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map(t => {
                  const isEditing = editingId === t.id;

                  if (isEditing) {
                    return (
                      <tr key={t.id} className="border-b border-border/50 bg-primary/5">
                        <td className="py-2 px-1 text-sm text-text-light">
                          {new Date(t.created_at).toLocaleDateString('pt-BR')}
                          <div className="text-[10px] mt-0.5">
                            {new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
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
                          <input
                            type="text"
                            value={editForm.comentario || ''}
                            onChange={e => setEditForm({ ...editForm, comentario: e.target.value })}
                            placeholder="Comentário..."
                            title="Comentário livre sobre esta transação"
                            className="glass-input w-full p-1 mt-1 text-xs bg-white text-text-light"
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
                            <button onClick={() => saveEditing(t.id)} className="text-primary hover:text-primary-hover p-1" title="Salvar">
                              <CheckCircle size={18} />
                            </button>
                            <button onClick={cancelEditing} className="text-text-light hover:text-danger p-1" title="Cancelar">
                              <XCircle size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-white/40 transition-colors">
                      <td className="py-3 text-sm text-text-light">
                        {new Date(t.created_at).toLocaleDateString('pt-BR')}
                        <div className="text-[10px] mt-0.5 font-medium">
                          {new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
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
                        {t.comentario && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-text-light" title={t.comentario}>
                            <MessageSquare size={11} className="text-primary shrink-0" />
                            <span className="truncate">{t.comentario}</span>
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
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => startEditing(t)} className="text-text-light hover:text-primary p-2 transition-colors" title="Editar">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => deleteTransaction(t.id)} className="text-text-light hover:text-danger p-2 transition-colors" title="Excluir">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {filtered.length > 0 && filtered.length >= pageLimit && (
            <div className="flex justify-center p-4 border-t border-border/50">
              <button
                onClick={() => setPageLimit(prev => prev + 100)}
                disabled={isLoadingMore}
                className="bg-primary/10 hover:bg-primary text-primary hover:text-white px-6 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingMore ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></div>
                    Carregando...
                  </>
                ) : (
                  'Buscar +'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
