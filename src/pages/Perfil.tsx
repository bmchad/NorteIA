import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PlusCircle, Edit2, Trash2, Check, X, AlertCircle } from 'lucide-react';

export default function Perfil() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

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

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      // Pegando uma cor aleatória, similar ao seedDefaultCategories em Pendentes
      const colors = ['#64748b', '#ef4444', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const { error } = await supabase.from('categories').insert([{
        user_id: user.id,
        nome: newCategoryName.trim(),
        cor: randomColor
      }]);

      if (error) throw error;
      
      setNewCategoryName('');
      await fetchCategories();
    } catch (error) {
      console.error('Erro ao adicionar categoria:', error);
      alert('Erro ao adicionar categoria.');
    }
  };

  const startEditing = (category: any) => {
    setEditingId(category.id);
    setEditingName(category.nome);
    setErrorMsg(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveCategory = async (id: string) => {
    if (!editingName.trim()) return;
    
    try {
      const { error } = await supabase
        .from('categories')
        .update({ nome: editingName.trim() })
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
    if (!window.confirm(`Tem certeza que deseja excluir a categoria "${nome}"?`)) return;

    try {
      setErrorMsg(null);
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) {
        // Se houver erro de foreign key constraint, o supabase retorna o erro
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
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-text">Seu Perfil</h2>
        <p className="text-text-light mt-1">Gerencie suas categorias e preferências da conta.</p>
      </header>

      <div className="glass-panel p-6">
        <h3 className="text-xl font-bold text-text mb-6 border-b border-border pb-2">Suas Categorias</h3>

        {errorMsg && (
          <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-danger shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-danger font-medium">{errorMsg}</p>
          </div>
        )}

        <form onSubmit={addCategory} className="flex gap-3 mb-8">
          <input
            type="text"
            placeholder="Nova categoria..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="glass-input flex-1 px-4 py-2"
          />
          <button
            type="submit"
            disabled={!newCategoryName.trim()}
            className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-xl transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle size={18} />
            Adicionar
          </button>
        </form>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <div 
                key={category.id} 
                className="flex items-center justify-between p-3 rounded-xl border border-border bg-white/30 backdrop-blur-sm hover:border-primary/30 transition-colors group"
              >
                {editingId === category.id ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="glass-input flex-1 px-2 py-1 text-sm"
                      autoFocus
                    />
                    <button 
                      onClick={() => saveCategory(category.id)}
                      className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title="Salvar"
                    >
                      <Check size={18} />
                    </button>
                    <button 
                      onClick={cancelEditing}
                      className="p-1.5 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                      title="Cancelar"
                    >
                      <X size={18} />
                    </button>
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

            {categories.length === 0 && (
              <div className="col-span-full py-8 text-center text-text-light">
                Você ainda não possui categorias.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
