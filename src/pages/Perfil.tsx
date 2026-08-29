import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PlusCircle, Edit2, Trash2, Check, X, AlertCircle, Search, ListFilter, ArrowLeftRight, Layers } from 'lucide-react';
import { TETO_TIPOS_ATIVOS, TIPOS_SEMENTE } from '../lib/compromissos';
import ConfirmModal from '../components/ConfirmModal';

export default function Perfil() {
  const [categories, setCategories] = useState<any[]>([]);

  const [tiposCompromisso, setTiposCompromisso] = useState<any[]>([]);
  const [novoTipo, setNovoTipo] = useState('');
  const [novaEhRenda, setNovaEhRenda] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvoRenda, setAlvoRenda] = useState<boolean | null>(null);
  const [editandoTipo, setEditandoTipo] = useState<string | null>(null);
  const [formTipo, setFormTipo] = useState<any>({});
  const [coresList, setCoresList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAdding, setIsAdding] = useState(false);
  const [isAddColorOpen, setIsAddColorOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCor, setSelectedCor] = useState<string>('#00FF7F');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState<string>('');
  const [isEditingColorOpen, setIsEditingColorOpen] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [sortType, setSortType] = useState<'recentes' | 'antigas' | 'az'>('recentes');
  const [isSortOpen, setIsSortOpen] = useState(false);

  const [cicloDia, setCicloDia] = useState<number>(5);
  const [isSavingCiclo, setIsSavingCiclo] = useState(false);

  useEffect(() => {
    fetchCores();
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

  const handleSaveCiclo = async (val: number) => {
    const newVal = Math.max(1, Math.min(27, val));
    setCicloDia(newVal);
    setIsSavingCiclo(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const { data: existing } = await supabase.from('memory').select('id').eq('user_id', user.id).single();
      if (existing) {
        await supabase.from('memory').update({ ciclo_dia: newVal, updated_at: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await supabase.from('memory').insert([{ user_id: user.id, ciclo_dia: newVal }]);
      }
    } catch (err) {
      console.error("Erro ao salvar ciclo:", err);
    } finally {
      setIsSavingCiclo(false);
    }
  };

  const fetchCores = async () => {
    try {
      const { data, error } = await supabase.from('cores').select('*').order('id');
      if (error) throw error;
      if (data && data.length > 0) {
        setCoresList(data);
        // Não sobrescreve a cor selecionada (mantém o default do useState)
      }
    } catch (error) {
      console.error('Erro ao buscar cores:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .order('nome');

      if (error) throw error;
      if (data) setCategories(data);
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { error } = await supabase.from('categories').insert([{
        user_id: user.id,
        nome: newCategoryName.trim(),
        cor: selectedCor,
        e_renda: novaEhRenda,
      }]);

      if (error) throw error;

      setNewCategoryName('');
      setNovaEhRenda(false);
      setIsAdding(false);
      setIsAddColorOpen(false);
      await fetchCategories();
    } catch (error) {
      console.error('Erro ao adicionar categoria:', error);
      alert('Erro ao adicionar categoria.');
    }
  };

  /**
   * Marca ou desmarca a categoria como renda.
   *
   * Nem toda transação positiva é renda: estorno e reembolso entram com valor positivo e
   * não são dinheiro ganho. A marca é o que separa os dois no cálculo de proporção.
   */
  const moverPara = async (category: any, novo: boolean) => {
    if (category.e_renda === novo) return;
    setCategories(prev => prev.map(c => c.id === category.id ? { ...c, e_renda: novo } : c));

    const { error } = await supabase
      .from('categories')
      .update({ e_renda: novo })
      .eq('id', category.id);

    if (error) {
      console.error('Erro ao marcar categoria como renda:', error);
      setCategories(prev => prev.map(c => c.id === category.id ? { ...c, e_renda: !novo } : c));
    }
  };

  useEffect(() => { carregarTipos(); }, []);

  /**
   * Carrega os tipos de compromisso e semeia os padrão no primeiro acesso.
   *
   * ⚠️ **Semente, não fonte da verdade.** Depois disto a lista é do usuário: acrescentar um
   * tipo em `TIPOS_SEMENTE` NÃO alcança quem já usa o app — igual às 27 categorias padrão.
   */
  const carregarTipos = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { data } = await supabase.from('compromissos').select('*').order('titulo');
    if (data && data.length > 0) { setTiposCompromisso(data); return; }

    const semente = TIPOS_SEMENTE.map(t => ({ user_id: user.id, slug: t.slug, titulo: t.titulo }));
    const { error } = await supabase.from('compromissos').insert(semente);
    if (error) { console.error('Erro ao semear tipos de compromisso:', error); return; }

    const { data: novos } = await supabase.from('compromissos').select('*').order('titulo');
    setTiposCompromisso(novos ?? []);
  };

  const salvarTipo = async (id: string) => {
    const patch = {
      titulo: formTipo.titulo?.trim() || undefined,
      periodicidade: formTipo.periodicidade?.trim() || null,
      valor_mensal: formTipo.valor_mensal ? parseFloat(formTipo.valor_mensal) : null,
    };
    setTiposCompromisso(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    setEditandoTipo(null);
    await supabase.from('compromissos').update(patch).eq('id', id);
  };

  const excluirTipo = async (id: string) => {
    setTiposCompromisso(prev => prev.filter(t => t.id !== id));
    await supabase.from('compromissos').delete().eq('id', id);
  };

  const criarTipo = async () => {
    const titulo = novoTipo.trim();
    if (!titulo) return;
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const slug = titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    if (tiposCompromisso.length >= TETO_TIPOS_ATIVOS) {
      alert(`O limite é ${TETO_TIPOS_ATIVOS} compromissos. Exclua um para abrir espaço.`);
      return;
    }

    const { data, error } = await supabase.from('compromissos')
      .insert([{ user_id: user.id, slug, titulo, origem: 'usuario' }]).select().single();
    if (error) { alert('Já existe um compromisso com esse nome.'); return; }

    setTiposCompromisso(prev => [...prev, data].sort((a, b) => a.titulo.localeCompare(b.titulo)));
    setNovoTipo('');
  };

  const startEditing = (category: any) => {
    setEditingId(category.id);
    setEditingName(category.nome);
    setEditingColor(category.cor || '#ccc');
    setErrorMsg(null);
    setIsEditingColorOpen(false);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
    setEditingColor('');
    setIsEditingColorOpen(false);
  };

  const saveCategory = async (id: string) => {
    if (!editingName.trim()) return;

    try {
      const { error } = await supabase
        .from('categories')
        .update({ nome: editingName.trim(), cor: editingColor })
        .eq('id', id);

      if (error) throw error;

      setEditingId(null);
      await fetchCategories();
    } catch (error) {
      console.error('Erro ao atualizar categoria:', error);
      alert('Erro ao atualizar categoria.');
    }
  };

  const deleteCategory = async (id: string, nome: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Categoria',
      message: `Tem certeza que deseja excluir a categoria "${nome}"?`,
      onConfirm: async () => {
        try {
          setErrorMsg(null);
          const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', id);

          if (error) {
            if (error.code === '23503') {
              setErrorMsg(`Não foi possível excluir "${nome}" porque existem transações vinculadas a ela.`);
            } else {
              throw error;
            }
          } else {
            await fetchCategories();
          }
        } catch (error) {
          console.error('Erro ao excluir categoria:', error);
          alert('Erro ao excluir categoria.');
        }
      }
    });
  };

  let displayedCategories = [...categories];

  if (searchTerm.trim()) {
    const term = searchTerm.toLowerCase();
    displayedCategories = displayedCategories.filter(c => c.nome.toLowerCase().includes(term));
  }

  displayedCategories.sort((a, b) => {
    if (sortType === 'recentes') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else if (sortType === 'antigas') {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else if (sortType === 'az') {
      return a.nome.localeCompare(b.nome);
    }
    return 0;
  });

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
        <h2 className="text-3xl font-bold text-text">Seu Perfil</h2>
        <p className="text-text-light mt-1">
            Aqui você define <strong>o que existe</strong>: as categorias que classificam suas
            transações, os compromissos que a IA reconhece e o dia em que seu mês começa.
          </p>
      </header>

      <div className="glass-panel p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-border pb-4 gap-4">
          <h3 className="text-xl font-bold text-text">Suas Categorias</h3>

          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 rounded-xl transition-all duration-300 ${isSearchExpanded ? 'bg-white/60 p-1.5 px-3 border border-border/50' : ''}`}>
              <button
                onClick={() => setIsSearchExpanded(true)}
                className={`p-2 flex items-center justify-center rounded-xl transition-colors ${isSearchExpanded ? 'text-primary' : 'bg-white/40 hover:bg-white/60 text-text-light hover:text-primary'}`}
              >
                <Search size={16} />
              </button>
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onBlur={() => { if (!searchTerm) setIsSearchExpanded(false); }}
                className={`bg-transparent border-none outline-none text-sm text-text transition-all duration-300 placeholder:text-text-light/60 ${isSearchExpanded ? 'w-24 sm:w-32 md:w-40 opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}
              />
              {isSearchExpanded && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSearchTerm(''); setIsSearchExpanded(false); }}
                  className="p-1 text-text-light/50 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors shrink-0"
                  title="Fechar busca"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="relative">
              <button onClick={() => setIsSortOpen(!isSortOpen)} className="p-2 rounded-xl bg-white/40 hover:bg-white/60 transition-colors text-text-light hover:text-primary">
                <ListFilter size={18} />
              </button>
              {isSortOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-border/50 overflow-hidden z-10 w-48">
                  <button onClick={() => { setSortType('recentes'); setIsSortOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-primary/5 ${sortType === 'recentes' ? 'font-bold text-primary' : 'text-text'}`}>Mais recentes</button>
                  <button onClick={() => { setSortType('antigas'); setIsSortOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-primary/5 ${sortType === 'antigas' ? 'font-bold text-primary' : 'text-text'}`}>Mais antigas</button>
                  <button onClick={() => { setSortType('az'); setIsSortOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-primary/5 ${sortType === 'az' ? 'font-bold text-primary' : 'text-text'}`}>Ordem Alfabética</button>
                </div>
              )}
            </div>

            <div className={`transition-all duration-500 ease-in-out transform origin-right ${isAdding ? 'w-0 opacity-0 scale-95 overflow-hidden' : 'w-auto opacity-100 scale-100'}`}>
              <button
                onClick={() => setIsAdding(true)}
                className="bg-primary hover:bg-primary-hover text-white px-4 py-1.5 rounded-xl transition-colors font-medium flex items-center gap-2"
              >
                <PlusCircle size={18} />
                <span className="hidden sm:inline">Adicionar</span>
              </button>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-danger shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-danger font-medium">{errorMsg}</p>
          </div>
        )}

        <div className={`transition-all duration-500 ease-in-out origin-top ${isAdding ? 'max-h-[500px] opacity-100 mb-8 z-20 relative overflow-visible' : 'max-h-0 opacity-0 mb-0 overflow-hidden pointer-events-none'}`}>
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-1 items-center gap-2 relative">
                <button
                  type="button"
                  onClick={() => setIsAddColorOpen(!isAddColorOpen)}
                  className="w-8 h-8 rounded-full shrink-0 border-2 border-white/50 hover:scale-110 transition-transform shadow-sm"
                  style={{ backgroundColor: selectedCor }}
                  title="Escolher cor"
                />
                {isAddColorOpen && (
                  <div className="absolute top-full left-0 mt-2 bg-white p-3 rounded-xl shadow-xl border border-border/50 z-30 w-[240px] grid grid-cols-5 gap-2">
                    {coresList.map(cor => (
                      <button
                        key={cor.id}
                        type="button"
                        onClick={() => { setSelectedCor(cor.codigo); setIsAddColorOpen(false); }}
                        className="w-8 h-8 rounded-full hover:scale-110 transition-transform border border-border/50"
                        style={{ backgroundColor: cor.codigo }}
                        title={cor.nome}
                      />
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  placeholder="Nova categoria..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="glass-input flex-1 px-4 py-2"
                />
              </div>

              {/* ⭐ O lado se escolhe na criação: perguntar depois é o que fazia a categoria
                  nascer errada e o Dashboard somar reembolso como renda. */}
              <div className="flex gap-1 p-1 bg-white/40 rounded-xl">
                {([[false, 'Gasto'], [true, 'Renda']] as const).map(([ehRenda, rotulo]) => (
                  <button
                    key={rotulo}
                    type="button"
                    onClick={() => setNovaEhRenda(ehRenda)}
                    className={`flex-1 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      novaEhRenda === ehRenda
                        ? ehRenda ? 'bg-[#10b981] text-white' : 'bg-primary text-white'
                        : 'text-text-light hover:text-text'
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addCategory}
                  disabled={!newCategoryName.trim()}
                  className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-xl transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlusCircle size={18} />
                  Adicionar
                </button>
                <button
                  onClick={() => { setIsAdding(false); setIsAddColorOpen(false); }}
                  className="px-4 py-2 text-text-light hover:bg-danger/10 hover:text-danger rounded-xl transition-colors font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-6">
          {([
            [true, 'Renda', 'O dinheiro que você ganha. Só estas contam como renda no Dashboard'],
            [false, 'Gasto', 'Todo o resto'],
          ] as const).map(([ehRenda, titulo, nota]) => (
          <section
            key={String(ehRenda)}
            onDragOver={(e) => { e.preventDefault(); setAlvoRenda(ehRenda); }}
            onDragLeave={() => setAlvoRenda(null)}
            onDrop={(e) => {
              e.preventDefault();
              const alvo = displayedCategories.find(c => c.id === e.dataTransfer.getData('text/plain'));
              if (alvo) moverPara(alvo, ehRenda);
              setArrastando(null);
              setAlvoRenda(null);
            }}
            className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
              alvoRenda === ehRenda && arrastando
                ? 'border-primary bg-primary/5'
                : 'border-transparent'
            }`}
          >
            <div className="flex items-baseline gap-2 mb-3">
              <h4 className={`font-bold ${ehRenda ? 'text-[#10b981]' : 'text-text'}`}>
                Categorias de {titulo}
              </h4>
              <span className="text-xs text-text-light">
                {displayedCategories.filter(c => !!c.e_renda === ehRenda).length} · {nota}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedCategories.filter(c => !!c.e_renda === ehRenda).map((category) => (
              <div
                key={category.id}
                draggable={editingId !== category.id}
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', category.id); setArrastando(category.id); }}
                onDragEnd={() => { setArrastando(null); setAlvoRenda(null); }}
                className={`flex items-center justify-between p-3 rounded-xl border border-border bg-white/30 backdrop-blur-sm hover:border-primary/30 transition-all group ${editingId === category.id ? 'z-30 relative' : 'z-0 relative cursor-grab active:cursor-grabbing'} ${arrastando === category.id ? 'opacity-40' : ''}`}
              >
                {editingId === category.id ? (
                  <div className="flex flex-col gap-3 w-full">
                    <div className="flex items-center gap-2 w-full">
                      <div className="relative">
                        <button
                          onClick={() => setIsEditingColorOpen(!isEditingColorOpen)}
                          className="w-6 h-6 rounded-full shrink-0 border-2 border-white/50 hover:scale-110 transition-transform shadow-sm"
                          style={{ backgroundColor: editingColor }}
                          title="Alterar cor"
                        />
                        {isEditingColorOpen && (
                          <div className="absolute top-full left-0 mt-2 bg-white p-3 rounded-xl shadow-xl border border-border/50 z-20 w-[240px] grid grid-cols-5 gap-2">
                            {coresList.map(cor => (
                              <button
                                key={cor.id}
                                onClick={() => { setEditingColor(cor.codigo); setIsEditingColorOpen(false); }}
                                className="w-8 h-8 rounded-full hover:scale-110 transition-transform border border-border/50"
                                style={{ backgroundColor: cor.codigo }}
                                title={cor.nome}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="relative flex-1 flex items-center">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="glass-input w-full pl-2 pr-16 py-1.5 text-sm"
                          autoFocus
                        />
                        <div className="absolute right-1 flex items-center gap-0.5">
                          <button
                            onClick={() => saveCategory(category.id)}
                            className="p-1 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Salvar"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="p-1 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                            title="Cancelar"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: category.cor || '#ccc' }}
                      />
                      <span className="font-medium text-text truncate" title={category.nome}>
                        {category.nome}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Fica sempre visível quando ligado: é informação, não ação escondida. */}
                      {/* ⚠️ Arrastar não existe em tela de toque, e o app é usado no celular.
                          Esta seta faz a mesma coisa e é a única via em telefone. */}
                      <button
                        onClick={() => moverPara(category, !category.e_renda)}
                        className="p-1.5 rounded-lg text-text-light/50 opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10 transition-colors"
                        title={category.e_renda ? 'Mover para Gasto' : 'Mover para Renda'}
                      >
                        {category.e_renda ? <ArrowLeftRight size={16} /> : <ArrowLeftRight size={16} />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEditing(category)}
                        className="p-1.5 text-text-light hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => deleteCategory(category.id, category.nome)}
                        className="p-1.5 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {displayedCategories.filter(c => !!c.e_renda === ehRenda).length === 0 && (
              <div className="col-span-full py-6 text-center text-sm text-text-light">
                {ehRenda
                  ? 'Nenhuma ainda. Arraste para cá as categorias em que seu dinheiro entra.'
                  : 'Nenhuma categoria encontrada.'}
              </div>
            )}
            </div>
          </section>
          ))}
          </div>
        )}
      </div>

      {/* ⭐ Compromissos — o /perfil é o dono da configuração (D-029). A tela de operação
          trabalha com o que foi ENCONTRADO; aqui se define o que EXISTE. */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h3 className="text-xl font-bold text-text flex items-center gap-2">
            <Layers size={22} className="text-primary" /> Compromissos
          </h3>
          <span className={`text-xs ${tiposCompromisso.length > TETO_TIPOS_ATIVOS ? 'text-danger font-medium' : 'text-text-light'}`}>
            {tiposCompromisso.length} de {TETO_TIPOS_ATIVOS}
          </span>
        </div>
        <p className="text-sm text-text-light mb-4">
          Os tipos que a IA reconhece nas suas transações. Exclua o que não usa — menos tipos,
          menos chance de o modelo forçar encaixe. <strong>Quando acontece</strong> é texto livre e
          serve só para orientar a IA; <strong>valor</strong> é somado no comprometido.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiposCompromisso.map(tipo => (
            <div
              key={tipo.id}
              className={`flex items-center justify-between p-3 rounded-xl border border-border bg-white/30 backdrop-blur-sm hover:border-primary/30 transition-colors group ${
                editandoTipo === tipo.id ? 'md:col-span-2 lg:col-span-3' : ''
              }`}
            >
              {editandoTipo === tipo.id ? (
                <div className="flex-1 min-w-0 space-y-2">
                  <input
                    value={formTipo.titulo ?? ''}
                    onChange={e => setFormTipo({ ...formTipo, titulo: e.target.value })}
                    className="glass-input p-2 text-sm bg-white w-full"
                    placeholder="Nome"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <label className="flex-1 min-w-[200px]">
                      <span className="block text-[10px] uppercase text-text-light font-bold mb-0.5">
                        Quando acontece · pista para a IA
                      </span>
                      <input
                        value={formTipo.periodicidade ?? ''}
                        onChange={e => setFormTipo({ ...formTipo, periodicidade: e.target.value })}
                        className="glass-input p-2 text-sm bg-white w-full"
                        placeholder="Ex: toda semana; todo mês, dia 10..."
                      />
                    </label>
                    {/* ⚠️ Este não é pista: o painel de /compromissos SOMA este número na
                        camada "Previsível". Por isso o rótulo diz para onde ele vai. */}
                    <label className="flex-1 min-w-[150px]">
                      <span className="block text-[10px] uppercase text-text-light font-bold mb-0.5">
                        Valor · entra no comprometido
                      </span>
                      <input
                        value={formTipo.valor_mensal ?? ''}
                        onChange={e => setFormTipo({ ...formTipo, valor_mensal: e.target.value })}
                        className="glass-input p-2 text-sm bg-white w-full"
                        inputMode="decimal" placeholder="R$ por mês"
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditandoTipo(null)}
                      className="px-3 py-1.5 text-sm text-text-light hover:text-text rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => salvarTipo(tipo.id)}
                      className="flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                    >
                      <Check size={14} /> Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text truncate" title={tipo.titulo}>
                      {tipo.titulo}
                    </div>
                    {(tipo.periodicidade || tipo.valor_mensal) && (
                      <div className="text-xs text-text-light truncate">
                        {[
                          tipo.periodicidade,
                          tipo.valor_mensal ? `R$ ${Number(tipo.valor_mensal).toFixed(2).replace('.', ',')}/mês` : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditandoTipo(tipo.id); setFormTipo({
                        titulo: tipo.titulo,
                        periodicidade: tipo.periodicidade ?? '',
                        valor_mensal: tipo.valor_mensal ?? '',
                      }); }}
                      className="p-1.5 text-text-light hover:text-primary hover:bg-primary/10 rounded-lg"
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => excluirTipo(tipo.id)}
                      className="p-1.5 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          <input
            value={novoTipo}
            onChange={e => setNovoTipo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && criarTipo()}
            placeholder="Novo compromisso..."
            className="glass-input flex-1 px-4 py-2 text-sm"
          />
          <button
            onClick={criarTipo}
            className="bg-primary text-white px-4 rounded-xl hover:bg-primary-hover transition-colors"
          >
            <PlusCircle size={18} />
          </button>
        </div>
      </div>

      {/* Seus Ciclos */}
      <div className="glass-panel p-6">
        <h3 className="text-xl font-bold text-text mb-2">Seus ciclos</h3>
        <p className="text-sm text-text-light mb-4">Selecione onde seu mês começa! Exemplo, se seu mês começa no dia 5, seus balanços serão do dia 5 do mês atual até dia 5 do próximo.</p>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text">Dia de início:</span>
          <input
            type="number"
            min="1"
            max="27"
            value={cicloDia}
            onChange={(e) => handleSaveCiclo(Number(e.target.value))}
            className="glass-input w-20 px-3 py-2 text-center font-bold text-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {isSavingCiclo && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>}
        </div>
      </div>
    </div>
  );
}
