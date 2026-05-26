import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { UploadCloud, FileText, CheckCircle, XCircle, X } from 'lucide-react';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export default function Pendentes() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');

  const removeFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // 1. Buscar transações e categorias ao abrir a página
  useEffect(() => {
    fetchPendentes();
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

      if (data && data.length === 0) {
        await seedDefaultCategories(user.id);
      } else if (data) {
        setCategories(data);
      }
    } catch (err) {
      console.error("Erro ao buscar categorias:", err);
    }
  };

  const seedDefaultCategories = async (userId: string) => {
    const defaultList = [
      'Comida', 'Uber/99', 'Táxi', 'Ônibus/Metrô', 'Supermercado',
      'Academia', 'Vestuário/Beleza', 'Farmácia', 'Eletrônicos', 'Casa',
      'Comércio', 'Governo', 'Educação', 'Viagem', 'Médicos/Saúde',
      'Entreterimento', 'Assinaturas', 'Bancos', 'Carro', 'Aluguel',
      'Paulo', 'Larissa', 'Maria', 'Poker', 'Outros', 'Outras receitas'
    ];

    // Cores aleatórias neutras
    const colors = ['#64748b', '#ef4444', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const insertData = defaultList.map((nome, i) => ({
      user_id: userId,
      nome,
      cor: colors[i % colors.length]
    }));

    const { error } = await supabase.from('categories').insert(insertData);
    if (!error) {
      const { data } = await supabase.from('categories').select('*').eq('user_id', userId).order('nome');
      if (data) setCategories(data);
    }
  };

  const fetchPendentes = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('pendente', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setExtractedData(data);
    } catch (error) {
      console.error("Erro ao buscar pendentes:", error);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (droppedFiles.length > 0) {
      setFiles(prev => [...prev, ...droppedFiles]);
    }
  }, []);

  const processImage = async () => {
    if (files.length === 0) return;
    setLoading(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      const imageParts = await Promise.all(files.map(async (f) => {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(f);
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = (error) => reject(error);
        });
        return { inlineData: { data: base64Data, mimeType: f.type } };
      }));

      const listadeCategorias = categories.map(c => c.nome).join(', ');

      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      let prompt = `Você é um assistente financeiro. Analise a imagem fornecida, que é um print de extrato bancário ou fatura de cartão. Extraia todas as transações e retorne APENAS um JSON válido contendo um array de objetos com a seguinte estrutura para cada transação:
      - "data": Data no formato YYYY-MM-DD
      - "nome": Nome exato do estabelecimento ou transferência na íntegra (ex: "PGTO MERCADOLIVRE *OSASCO").
      - "apelido": Um nome limpo e resumido, deduzido a partir do nome na íntegra (ex: "Mercado Livre").
      - "valor": Valor numérico (positivo para entradas, negativo para saídas).
      - "banco": Nome do banco deduzido pela interface do print.
      - "hora": Hora no formato HH:MM:SS. Se não visível, use "12:00:00".
      - "parcela_atual": Número da parcela atual (se for compra parcelada, ex: "1 de 10" -> 1). Se não houver, retorne null.
      - "parcela_total": Total de parcelas (ex: "1 de 10" -> 10). Se não houver, retorne null.
      - "categoria_sugerida": Se o "valor" for negativo (saída), tente deduzir a categoria mais provável de acordo com o nome e apelido da transação, e selecione obrigatoriamente um dos seguintes valores exatos da nossa lista: [ ${listadeCategorias} ]. Se o "valor" for positivo (entrada/receita), ou se nenhuma categoria da lista fizer sentido, retorne null.
      
      REGRAS CRÍTICAS:
      1. Se uma transação NÃO tiver data, OU NÃO tiver nome, OU NÃO tiver valor claro, IGNORE-A COMPLETAMENTE. Não registre transações parcialmente de forma alguma.
      2. Não use blocos de código (markdown), retorne o JSON puro. A "categoria_sugerida" DEVE ser textualmente idêntica a uma das opções da lista de categorias ou null.`;

      if (customPrompt.trim()) {
        prompt += `\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customPrompt.trim()}`;
      }

      const result = await model.generateContent([
        prompt,
        ...imageParts
      ]);

      let responseText = result.response.text();
      const jsonStartIndex = responseText.indexOf('[');
      const jsonEndIndex = responseText.lastIndexOf(']');

      if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
        responseText = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
      } else {
        throw new Error("A IA não retornou um formato JSON válido.");
      }

      const jsonResponse = JSON.parse(responseText);

      const transactionsToInsert = jsonResponse.map((item: any) => {
        let finalData = item.data;

        // Se for parcela, ajusta o mês: Mês da compra + (parcela_atual - 1)
        if (item.parcela_total && item.parcela_atual && item.data) {
          const [anoStr, mesStr, diaStr] = item.data.split('-');
          if (anoStr && mesStr && diaStr) {
            const dateObj = new Date(parseInt(anoStr), parseInt(mesStr) - 1, parseInt(diaStr));
            dateObj.setMonth(dateObj.getMonth() + parseInt(item.parcela_atual) - 1);

            const newAno = dateObj.getFullYear();
            const newMes = String(dateObj.getMonth() + 1).padStart(2, '0');
            const newDia = String(dateObj.getDate()).padStart(2, '0');
            finalData = `${newAno}-${newMes}-${newDia}`;
          }
        }

        // Tenta encontrar a categoria correspondente de forma case-insensitive
        const matchedCategory = item.categoria_sugerida
          ? categories.find(c => c.nome.toLowerCase() === item.categoria_sugerida.toLowerCase())
          : null;

        return {
          user_id: user.id,
          data: finalData,
          nome: item.nome,
          apelido: item.apelido,
          valor: item.valor,
          banco: item.banco,
          categoria_id: matchedCategory ? matchedCategory.id : null,
          hora: item.hora || '12:00:00',
          parcela_atual: item.parcela_atual,
          parcela_total: item.parcela_total,
          pendente: true
        };
      });

      const { error } = await supabase.from('transactions').insert(transactionsToInsert);
      if (error) throw error;

      await fetchPendentes();
      setFiles([]);

    } catch (error: any) {
      console.error("Erro detalhado:", error);
      alert(`Falha na IA ou Leitura: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  const addManualPendente = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase.from('transactions').insert([{
        user_id: user.id,
        data: today,
        nome: 'Nova Transação',
        apelido: '',
        valor: 0,
        banco: '',
        categoria_id: null,
        hora: '12:00:00',
        parcela_atual: null,
        parcela_total: null,
        pendente: true
      }]);

      if (error) throw error;
      await fetchPendentes();
    } catch (error) {
      console.error("Erro ao adicionar manualmente:", error);
      alert("Erro ao criar transação manual.");
    }
  };

  const handleUpdateField = async (id: string, field: string, value: any) => {
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ [field]: value })
        .eq('id', id);

      if (error) throw error;
      setExtractedData(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    } catch (error) {
      console.error("Erro ao dar auto-save:", error);
    }
  };

  const handleCategoryChange = async (transactionId: string, value: string) => {
    if (value === "ADD_NEW") {
      const newName = prompt("Qual o nome da nova categoria?");
      if (!newName || !newName.trim()) return;

      try {
        const user = (await supabase.auth.getUser()).data.user;
        if (!user) return;

        const { data, error } = await supabase.from('categories').insert({
          user_id: user.id,
          nome: newName.trim(),
          cor: '#ec4899' // Rosa padrão para novas criadas pelo usuário
        }).select().single();

        if (error) throw error;
        if (data) {
          // Adicionar na lista local de categorias ordenando novamente
          setCategories(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
          // Vincular à transação
          await handleUpdateField(transactionId, 'categoria_id', data.id);
        }
      } catch (err) {
        console.error("Erro ao criar categoria", err);
        alert("Erro ao criar a categoria. Tente novamente.");
      }
    } else {
      await handleUpdateField(transactionId, 'categoria_id', value || null);
    }
  };

  const aprovarTransacao = async (id: string) => {
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ pendente: false })
        .eq('id', id);

      if (error) throw error;
      setExtractedData(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error("Erro ao aprovar:", error);
      alert("Erro ao aprovar a transação.");
    }
  };

  const descartarTransacao = async (id: string) => {
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setExtractedData(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error("Erro ao descartar:", error);
      alert("Erro ao excluir transação.");
    }
  };

  const aprovarTudo = async () => {
    if (!confirm(`Tem certeza que deseja aprovar TODAS as ${extractedData.length} transações?`)) return;
    try {
      const ids = extractedData.map(t => t.id);
      const { error } = await supabase
        .from('transactions')
        .update({ pendente: false })
        .in('id', ids);

      if (error) throw error;
      setExtractedData([]);
    } catch (error) {
      console.error("Erro ao aprovar tudo:", error);
      alert("Erro ao aprovar transações.");
    }
  };

  const reprovarTudo = async () => {
    if (!confirm(`Tem certeza que deseja reprovar e excluir TODAS as ${extractedData.length} transações pendentes?`)) return;
    try {
      const ids = extractedData.map(t => t.id);
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', ids);

      if (error) throw error;
      setExtractedData([]);
    } catch (error) {
      console.error("Erro ao reprovar tudo:", error);
      alert("Erro ao excluir transações.");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-text">Transações Pendentes</h2>
        <p className="text-text-light mt-1">Nossa IA lê seus prints. Revise aqui e confirme. O progresso é salvo automaticamente!</p>
      </header>

      <div
        className={`glass-panel flex flex-col items-center justify-center text-center border-dashed border-2 border-primary/30 transition-colors hover:bg-primary/5 ${extractedData.length > 0 ? 'p-6 min-h-[200px]' : 'p-8 min-h-[400px]'}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className={`${extractedData.length > 0 ? 'w-10 h-10 mb-2' : 'w-16 h-16 mb-4'} bg-primary/10 text-primary rounded-full flex items-center justify-center shadow-inner`}>
          <UploadCloud size={extractedData.length > 0 ? 20 : 32} />
        </div>
        <h3 className={`${extractedData.length > 0 ? 'text-lg' : 'text-xl'} font-bold text-text mb-2`}>
          {extractedData.length > 0 ? 'Adicionar mais imagens' : 'Solte seu extrato aqui'}
        </h3>

        {!extractedData.length && (
          <p className="text-text-light max-w-md mb-6">Arraste a imagem (png, jpg) do seu banco para que a Inteligência Artificial processe os dados e salve em rascunho.</p>
        )}

        <div className="w-full max-w-md mb-6 text-left">
          <label className="text-xs text-text-light uppercase font-bold mb-2 block">Instruções Extras para a IA (Opcional)</label>
          <textarea
            className="glass-input w-full p-3 text-sm h-20 resize-none"
            placeholder="Ex: Ignorar transações abaixo de R$ 5,00. Considerar apenas saídas..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
          />
        </div>

        <input
          type="file"
          id="fileInput"
          className="hidden"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files) {
              setFiles(prev => [...prev, ...Array.from(e.target.files)]);
            }
          }}
        />

        <div className="flex gap-4">
          <label
            htmlFor="fileInput"
            className="cursor-pointer bg-primary hover:bg-primary-hover text-white font-medium py-2.5 px-6 rounded-xl shadow-lg shadow-primary/30 transition-all text-sm flex items-center justify-center"
          >
            Selecionar Imagem
          </label>
          <button
            onClick={addManualPendente}
            className="cursor-pointer bg-transparent border-2 border-primary/20 hover:border-primary text-primary font-medium py-2 px-5 rounded-xl transition-all text-sm flex items-center justify-center"
          >
            Adicionar Manualmente
          </button>
        </div>

        {files.length > 0 && (
          <div className="mt-4 flex flex-col items-center w-full">
            <div className={`font-medium mb-3 flex flex-col items-center gap-1 text-sm text-center w-full ${files.length > 5 ? 'text-danger font-bold' : 'text-primary'}`}>
              <span className="flex items-center gap-2">
                <FileText size={16} /> 
                <span>{files.length}/5 {files.length === 1 ? 'imagem selecionada' : 'imagens selecionadas'}</span>
              </span>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg mt-2 mb-1">
                {files.map((file, index) => (
                  <div 
                    key={index} 
                    className={`flex items-center gap-1.5 border rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold ${
                      files.length > 5 
                        ? 'bg-danger/10 border-danger/20 text-danger' 
                        : 'bg-primary/10 border-primary/20 text-primary'
                    }`}
                  >
                    <span className="max-w-[150px] truncate" title={file.name}>
                      {file.name}
                    </span>
                    <button
                      onClick={() => removeFile(index)}
                      className={`rounded-full p-0.5 transition-colors cursor-pointer flex items-center justify-center ${
                        files.length > 5 
                          ? 'hover:bg-danger/20 text-danger hover:text-danger-hover' 
                          : 'hover:bg-primary/20 hover:text-danger text-primary'
                      }`}
                      title="Remover imagem"
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <button
              onClick={processImage}
              disabled={loading || files.length > 5}
              className={`py-2 px-6 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${
                files.length > 5 
                  ? 'bg-border text-text-light cursor-not-allowed opacity-60' 
                  : 'bg-text text-white hover:bg-black cursor-pointer'
              }`}
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processando com IA...</>
              ) : 'Iniciar Leitura'}
            </button>
            
            {files.length > 5 && (
              <p className="text-danger text-xs font-bold mt-2 animate-pulse">
                Selecione até 5 imagens para iniciar a leitura
              </p>
            )}
          </div>
        )}
      </div>

      {extractedData.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-text flex items-center gap-2">
                <CheckCircle className="text-primary" /> Rascunhos Salvos ({extractedData.length})
              </h3>
              <span className="text-sm text-text-light">As edições são salvas automaticamente.</span>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={aprovarTudo}
                className="flex-1 sm:flex-none bg-primary text-white hover:bg-primary-hover px-4 py-2 rounded-xl transition-colors text-sm font-medium flex items-center justify-center gap-2 shadow-sm"
              >
                <CheckCircle size={16} /> Aprovar Tudo
              </button>
              <button
                onClick={reprovarTudo}
                className="flex-1 sm:flex-none bg-danger/10 text-danger hover:bg-danger hover:text-white px-4 py-2 rounded-xl transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <XCircle size={16} /> Reprovar Tudo
              </button>
            </div>
          </div>

          {extractedData.map((item) => (
            <div key={item.id} className="glass-panel p-4 flex flex-col xl:flex-row items-center gap-4 justify-between border-l-4 border-l-primary/50">
              <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
                <div>
                  <span className="text-xs text-text-light uppercase">Data</span>
                  <input
                    type="date"
                    defaultValue={item.data}
                    onBlur={(e) => handleUpdateField(item.id, 'data', e.target.value)}
                    className="glass-input w-full p-1 text-sm bg-transparent border-transparent hover:border-border"
                  />
                </div>
                <div>
                  <span className="text-xs text-text-light uppercase">Apelido</span>
                  <input
                    type="text"
                    defaultValue={item.apelido || item.nome}
                    onBlur={(e) => handleUpdateField(item.id, 'apelido', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="glass-input w-full p-1 text-sm font-medium"
                  />
                  <div className="mt-1 text-[10px] text-text-light/70 break-words whitespace-normal" title={item.nome}>
                    Original: {item.nome}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-text-light uppercase">Categoria</span>
                  <select
                    value={item.categoria_id || ''}
                    onChange={(e) => handleCategoryChange(item.id, e.target.value)}
                    className="glass-input w-full p-1 bg-transparent border-transparent hover:border-border text-sm appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Selecione...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id} className="text-black">{c.nome}</option>
                    ))}
                    <option value="ADD_NEW" className="font-bold text-primary bg-primary/10">+ Adicionar Categoria</option>
                  </select>
                </div>
                <div>
                  <span className="text-xs text-text-light uppercase">Banco</span>
                  <input
                    type="text"
                    defaultValue={item.banco || ''}
                    onBlur={(e) => handleUpdateField(item.id, 'banco', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="glass-input w-full p-1 bg-transparent border-transparent hover:border-border text-sm"
                  />
                </div>
                <div>
                  <span className="text-xs text-text-light uppercase">Valor (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={item.valor}
                    onBlur={(e) => handleUpdateField(item.id, 'valor', parseFloat(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className={`glass-input w-full p-1 text-sm font-bold ${item.valor >= 0 ? 'text-primary' : 'text-danger'}`}
                  />
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] text-text-light uppercase font-semibold">Parc:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      defaultValue={item.parcela_atual || ''}
                      onBlur={(e) => handleUpdateField(item.id, 'parcela_atual', e.target.value ? parseInt(e.target.value) : null)}
                      className="glass-input w-12 px-1 py-0.5 text-[11px] text-center font-medium"
                      title="Parcela Atual"
                    />
                    <span className="text-[10px] text-text-light font-bold">/</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      defaultValue={item.parcela_total || ''}
                      onBlur={(e) => handleUpdateField(item.id, 'parcela_total', e.target.value ? parseInt(e.target.value) : null)}
                      className="glass-input w-12 px-1 py-0.5 text-[11px] text-center font-medium"
                      title="Total de Parcelas"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full xl:w-auto mt-4 xl:mt-0">
                <button
                  onClick={() => aprovarTransacao(item.id)}
                  className="flex-1 xl:flex-none bg-primary/10 hover:bg-primary text-primary hover:text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
                  title="Aprovar"
                >
                  <CheckCircle size={20} /> <span className="xl:hidden">Aprovar</span>
                </button>
                <button
                  onClick={() => descartarTransacao(item.id)}
                  className="flex-1 xl:flex-none bg-danger/10 hover:bg-danger text-danger hover:text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
                  title="Descartar"
                >
                  <XCircle size={20} /> <span className="xl:hidden">Descartar</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
