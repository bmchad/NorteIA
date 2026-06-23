import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Anchor, PlusCircle, Trash2, DollarSign, Edit2, CheckCircle, XCircle, ListFilter, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

export default function Fixos() {
    const [fixos, setFixos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [nome, setNome] = useState('');
    const [valor, setValor] = useState('');
    const [dia, setDia] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAdding, setIsAdding] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ nome: '', valor: '', dia: '' });

    const [filterTipo, setFilterTipo] = useState<'todos' | 'recorrente' | 'flexivel'>('todos');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: 'valor' | 'nome', direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: 'valor' | 'nome') => {
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
        fetchFixos();
    }, []);

    const fetchFixos = async () => {
        setLoading(true);
        try {
            const user = (await supabase.auth.getUser()).data.user;
            if (!user) return;

            const { data, error } = await supabase
                .from('fixos')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setFixos(data || []);
        } catch (err) {
            console.error("Erro ao buscar gastos fixos:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddFixo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nome.trim() || !valor.trim()) return;

        setIsSubmitting(true);
        try {
            const user = (await supabase.auth.getUser()).data.user;
            if (!user) return;

            const valorNumerico = parseFloat(valor.replace(',', '.'));

            const { error } = await supabase
                .from('fixos')
                .insert({
                    user_id: user.id,
                    nome: nome.trim(),
                    valor: valorNumerico,
                    dia: dia.trim() ? parseInt(dia) : null
                });

            if (error) throw error;

            setNome('');
            setValor('');
            setDia('');
            await fetchFixos();
        } catch (err) {
            console.error("Erro ao adicionar gasto fixo:", err);
            alert("Erro ao adicionar gasto fixo.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteFixo = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este gasto fixo?')) return;

        try {
            const { error } = await supabase
                .from('fixos')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setFixos(prev => prev.filter(f => f.id !== id));
        } catch (err) {
            console.error("Erro ao excluir gasto fixo:", err);
            alert("Erro ao excluir.");
        }
    };

    const startEditing = (fixo: any) => {
        setEditingId(fixo.id);
        setEditForm({ nome: fixo.nome, valor: fixo.valor.toString(), dia: fixo.dia ? fixo.dia.toString() : '' });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditForm({ nome: '', valor: '', dia: '' });
    };

    const saveEditing = async (id: string) => {
        if (!editForm.nome.trim() || !editForm.valor.trim()) return;

        try {
            const valorNumerico = parseFloat(editForm.valor.replace(',', '.'));
            
            const { error } = await supabase
                .from('fixos')
                .update({
                    nome: editForm.nome.trim(),
                    valor: valorNumerico,
                    dia: editForm.dia.trim() ? parseInt(editForm.dia) : null
                })
                .eq('id', id);

            if (error) throw error;

            setFixos(prev => prev.map(f => f.id === id ? { ...f, nome: editForm.nome.trim(), valor: valorNumerico, dia: editForm.dia.trim() ? parseInt(editForm.dia) : null } : f));
            setEditingId(null);
        } catch (err) {
            console.error("Erro ao salvar gasto fixo:", err);
            alert("Erro ao salvar alterações.");
        }
    };

    const totalFixo = fixos.reduce((acc, curr) => acc + Number(curr.valor), 0);

    let filteredFixos = fixos;
    if (filterTipo === 'recorrente') {
        filteredFixos = filteredFixos.filter(f => f.dia !== null && f.dia !== undefined);
    } else if (filterTipo === 'flexivel') {
        filteredFixos = filteredFixos.filter(f => f.dia === null || f.dia === undefined);
    }

    if (sortConfig) {
        filteredFixos.sort((a, b) => {
            if (sortConfig.key === 'nome') {
                return sortConfig.direction === 'asc' ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
            } else if (sortConfig.key === 'valor') {
                return sortConfig.direction === 'asc' ? a.valor - b.valor : b.valor - a.valor;
            }
            return 0;
        });
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-text flex items-center gap-3">
                        <Anchor size={32} className="text-primary" /> Gastos Fixos
                    </h2>
                    <p className="text-text-light mt-1">Gerencie suas despesas mensais recorrentes. Esta página é consultativa.</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="bg-primary hover:bg-primary-hover text-white font-bold py-2.5 px-5 rounded-xl shadow-lg shadow-primary/30 transition-all flex items-center gap-2 whitespace-nowrap self-start"
                >
                    <PlusCircle size={20} />
                    {isAdding ? 'Ocultar' : 'Novo Gasto'}
                </button>
            </header>

            {/* Resumo Total */}
            <div className="glass-panel p-6 flex flex-col items-center justify-center text-center">
                <h3 className="text-sm font-bold text-text-light uppercase tracking-widest mb-2">Total Fixo Mensal</h3>
                <div className="text-5xl font-extrabold text-danger flex items-center gap-2">
                    R$ {totalFixo.toFixed(2).replace('.', ',')}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Formulário de Adição */}
                <div className={`transition-all duration-300 ease-in-out transform origin-right ${isAdding ? 'lg:w-1/3 opacity-100 scale-100' : 'lg:w-0 lg:opacity-0 lg:scale-95 overflow-hidden h-0 lg:h-auto'}`}>
                    <div className="glass-panel p-6 sticky top-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-text flex items-center gap-2">
                                <PlusCircle className="text-primary" size={24} /> Novo Gasto
                            </h3>
                            <button 
                                onClick={() => setIsAdding(false)} 
                                className="text-text-light hover:text-danger transition-colors p-1"
                                title="Fechar"
                            >
                                <XCircle size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleAddFixo} className="space-y-4">
                            <div>
                                <label className="text-xs text-text-light font-bold uppercase mb-1 block">Nome</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Aluguel"
                                    value={nome}
                                    onChange={e => setNome(e.target.value)}
                                    className="glass-input w-full p-3 text-sm font-medium"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs text-text-light font-bold uppercase mb-1 block">Valor</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Ex: 150.00"
                                        value={valor}
                                        onChange={e => setValor(e.target.value)}
                                        className="glass-input w-full p-3 text-sm font-bold text-danger [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-text-light font-bold uppercase mb-1 block">Dia de Vencimento (Opcional)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    placeholder="Ex: 5"
                                    value={dia}
                                    onChange={e => setDia(e.target.value)}
                                    className="glass-input w-full p-3 text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <p className="text-[10px] text-text-light mt-1">Deixe em branco se for um gasto Flexível.</p>
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting || !nome || !valor}
                                className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-primary/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    <>Adicionar</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Lista de Gastos */}
                <div className={`transition-all duration-300 ease-in-out space-y-3 ${isAdding ? 'lg:w-2/3' : 'w-full'}`}>
                    
                    {/* Controls Row */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/40 p-3 rounded-xl border border-border/50">
                        <div className="flex items-center gap-2 relative">
                            <span className="text-sm font-bold text-text-light">Exibir:</span>
                            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="p-1.5 rounded-lg hover:bg-white/60 transition-colors flex items-center gap-1 text-primary">
                                <ListFilter size={18} />
                                <span className="text-sm font-semibold capitalize">{filterTipo}</span>
                            </button>
                            {isFilterOpen && (
                                <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-border/50 overflow-hidden z-10 w-40">
                                    <button onClick={() => { setFilterTipo('todos'); setIsFilterOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-primary/5 ${filterTipo === 'todos' ? 'font-bold text-primary' : 'text-text'}`}>Todos</button>
                                    <button onClick={() => { setFilterTipo('recorrente'); setIsFilterOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-primary/5 ${filterTipo === 'recorrente' ? 'font-bold text-primary' : 'text-text'}`}>Recorrente</button>
                                    <button onClick={() => { setFilterTipo('flexivel'); setIsFilterOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-primary/5 ${filterTipo === 'flexivel' ? 'font-bold text-primary' : 'text-text'}`}>Flexível</button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-text-light hidden sm:inline">Ordenar:</span>
                            <button onClick={() => handleSort('nome')} className={`flex items-center gap-1 text-sm font-semibold p-1.5 rounded-lg transition-colors ${sortConfig?.key === 'nome' ? 'text-primary bg-primary/10' : 'text-text-light hover:bg-white/60'}`}>
                                A-Z
                                {sortConfig?.key === 'nome' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={14} />}
                            </button>
                            <button onClick={() => handleSort('valor')} className={`flex items-center gap-1 text-sm font-semibold p-1.5 rounded-lg transition-colors ${sortConfig?.key === 'valor' ? 'text-primary bg-primary/10' : 'text-text-light hover:bg-white/60'}`}>
                                R$
                                {sortConfig?.key === 'valor' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={14} />}
                            </button>
                        </div>
                    </div>
                    {loading ? (
                        <div className="flex justify-center p-12">
                            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : filteredFixos.length === 0 ? (
                        <div className="glass-panel p-12 text-center text-text-light border-dashed border-2 border-border/50">
                            Nenhum gasto fixo corresponde aos filtros atuais.
                        </div>
                    ) : (
                        filteredFixos.map(fixo => {
                            const isEditing = editingId === fixo.id;

                            if (isEditing) {
                                return (
                                    <div key={fixo.id} className="glass-panel p-4 flex flex-col md:flex-row items-center justify-between gap-4 bg-primary/5">
                                        <div className="flex-1 w-full">
                                            <input
                                                type="text"
                                                value={editForm.nome}
                                                onChange={e => setEditForm({ ...editForm, nome: e.target.value })}
                                                className="glass-input w-full p-2 text-sm font-bold bg-white"
                                                placeholder="Nome do gasto"
                                            />
                                        </div>
                                        <div className="flex-1 w-full flex items-center gap-2">
                                            <div className="relative w-full flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={editForm.valor}
                                                    onChange={e => setEditForm({ ...editForm, valor: e.target.value })}
                                                    className="glass-input w-full p-2 text-sm font-bold text-danger bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="Valor"
                                                />
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="31"
                                                    value={editForm.dia}
                                                    onChange={e => setEditForm({ ...editForm, dia: e.target.value })}
                                                    className="glass-input w-16 p-2 text-sm text-center bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="Dia"
                                                    title="Dia de Vencimento"
                                                />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => saveEditing(fixo.id)}
                                                    className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                                                    title="Salvar"
                                                >
                                                    <CheckCircle size={20} />
                                                </button>
                                                <button
                                                    onClick={cancelEditing}
                                                    className="p-2 rounded-lg text-text-light hover:bg-danger/10 hover:text-danger transition-colors"
                                                    title="Cancelar"
                                                >
                                                    <XCircle size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={fixo.id} className="glass-panel p-4 flex items-center justify-between group hover:bg-white/40 transition-colors">
                                    <div className="flex items-center pl-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-text text-xl">{fixo.nome}</span>
                                            {fixo.dia && (
                                                <span className="text-xs text-text-light mt-0.5 font-medium">
                                                    Vence no dia <span className="text-primary font-bold">{fixo.dia}</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xl font-extrabold text-danger bg-danger/10 px-4 py-2 rounded-xl border border-danger/20 shadow-sm">
                                            R$ {Number(fixo.valor).toFixed(2).replace('.', ',')}
                                        </span>
                                        <button
                                            onClick={() => startEditing(fixo)}
                                            className="p-2 rounded-lg text-text-light hover:bg-primary/10 hover:text-primary transition-colors"
                                            title="Editar"
                                        >
                                            <Edit2 size={20} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteFixo(fixo.id)}
                                            className="p-2 rounded-lg text-text-light hover:bg-danger/10 hover:text-danger transition-colors"
                                            title="Excluir"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
