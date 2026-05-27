import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { UploadCloud, FileText, CheckCircle, XCircle, X, Image as ImageIcon, FileSpreadsheet, PlusCircle, ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export default function Pendentes() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null);
  const [spreadsheetPrompt, setSpreadsheetPrompt] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPrompt, setDocumentPrompt] = useState('');
  const [activeMode, setActiveMode] = useState<'selection' | 'image' | 'spreadsheet' | 'document'>('selection');

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

  const processSpreadsheet = async () => {
    if (!spreadsheetFile) return;
    setLoading(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      // Ler o arquivo como array buffer
      const data = await spreadsheetFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      // Converter a primeira planilha em texto legível para a IA
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const csvContent = XLSX.utils.sheet_to_csv(worksheet);

      const listadeCategorias = categories.map(c => c.nome).join(', ');

      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      let prompt = `Você é um assistente financeiro de elite. Analise o conteúdo em formato CSV de uma planilha financeira fornecido abaixo e extraia TODAS as transações válidas. 
      Retorne APENAS um JSON válido contendo um array de objetos com a seguinte estrutura para cada transação:
      - "data": Data no formato YYYY-MM-DD.
      - "nome": Nome do estabelecimento, descrição ou transferência na íntegra.
      - "apelido": Um nome limpo e resumido, deduzido a partir do nome na íntegra.
      - "valor": Valor numérico (positivo para entradas/receitas, negativo para saídas/despesas). Tente inferir a partir das colunas de débito/crédito ou valores positivos/negativos.
      - "banco": Sempre retorne null para planilhas.
      - "hora": Hora no formato HH:MM:SS. Se não houver, use "12:00:00".
      - "parcela_atual": Sempre retorne null para planilhas.
      - "parcela_total": Sempre retorne null para planilhas.
      - "categoria_sugerida": Se o "valor" for negativo (saída), tente deduzir a categoria mais provável de acordo com o nome, apelido ou qualquer coluna de categoria da planilha, e selecione obrigatoriamente um dos seguintes valores exatos da nossa lista: [ ${listadeCategorias} ]. Se o "valor" for positivo (entrada/receita), ou se nenhuma categoria da lista fizer sentido, retorne null.

      REGRAS CRÍTICAS DE PREENCHIMENTO E FORMATAÇÃO (SIGA À RISCA):
      1. REGRAS DE NOME E APELIDO: Se o nome da transação na planilha estiver ausente, em branco, for nulo ou não puder ser extraído, coloque o NOME DA CATEGORIA SUGERIDA tanto no campo "nome" quanto no campo "apelido". Se a categoria sugerida também for nula, use "Outros".
      2. REGRAS DE DATA: 
         - Se houver data completa, retorne no formato YYYY-MM-DD.
         - Se NÃO houver data exata (ex: a planilha só tem o mês e o ano, ou o dia está ausente), padronize o DIA como dia 5. Ex: se for Maio/2026, a data será "2026-05-05".
         - Se até o mês estiver ausente (ex: apenas o ano), padronize o DIA como dia 5 e o MÊS como Janeiro (01). Ex: se for 2026, a data será "2026-01-05".
         - Se não houver nenhuma informação de data/ano/mês na linha, use a data de hoje ou o padrão "2026-01-05".
      3. REGRAS DE BANCO E PARCELAS:
         - O campo "banco" DEVE ser obrigatoriamente null para TODAS as transações da planilha.
         - Os campos "parcela_atual" e "parcela_total" DEVEM ser obrigatoriamente null para TODAS as transações da planilha. NUNCA tente configurar parcelas para planilhas.
      4. Não use blocos de código (markdown), retorne APENAS o JSON puro. A "categoria_sugerida" DEVE ser idêntica a uma da lista ou null.`;

      if (spreadsheetPrompt.trim()) {
        prompt += `\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO SOBRE A ESTRUTURA DA PLANILHA:\n${spreadsheetPrompt.trim()}`;
      }

      prompt += `\n\nCONTEÚDO DA PLANILHA EM FORMATO CSV:\n${csvContent}`;

      const result = await model.generateContent([prompt]);

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
        // Tenta encontrar a categoria correspondente de forma case-insensitive
        const matchedCategory = item.categoria_sugerida
          ? categories.find(c => c.nome.toLowerCase() === item.categoria_sugerida.toLowerCase())
          : null;

        // Garantir regras de negócio finais
        const finalNome = item.nome && item.nome.toString().trim() ? item.nome : (matchedCategory ? matchedCategory.nome : 'Outros');
        const finalApelido = item.apelido && item.apelido.toString().trim() ? item.apelido : (matchedCategory ? matchedCategory.nome : 'Outros');

        return {
          user_id: user.id,
          data: item.data,
          nome: finalNome,
          apelido: finalApelido,
          valor: item.valor,
          banco: null, // Forçar null
          categoria_id: matchedCategory ? matchedCategory.id : null,
          hora: item.hora || '12:00:00',
          parcela_atual: null, // Forçar null
          parcela_total: null, // Forçar null
          pendente: true
        };
      });

      const { error } = await supabase.from('transactions').insert(transactionsToInsert);
      if (error) throw error;

      await fetchPendentes();
      setSpreadsheetFile(null);
      setSpreadsheetPrompt('');
      setActiveMode('selection');

    } catch (error: any) {
      console.error("Erro detalhado:", error);
      alert(`Falha na IA ou Leitura da Planilha: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  const processDocument = async () => {
    if (!documentFile) return;
    setLoading(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(documentFile);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = (error) => reject(error);
      });
      const inlineData = { inlineData: { data: base64Data, mimeType: documentFile.type || 'application/pdf' } };

      const listadeCategorias = categories.map(c => c.nome).join(', ');

      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      let prompt = `Você é um assistente financeiro de elite. Analise o documento PDF fornecido, que é um extrato bancário ou fatura. Extraia TODAS as transações válidas visíveis no extrato.
      Retorne APENAS um JSON válido contendo um array de objetos com a seguinte estrutura para cada transação:
      - "data": Data no formato YYYY-MM-DD.
      - "nome": Nome exato do estabelecimento ou transferência na íntegra.
      - "apelido": Um nome limpo e resumido, deduzido a partir do nome na íntegra.
      - "valor": Valor numérico (positivo para entradas/receitas, negativo para saídas/despesas).
      - "banco": Nome do banco deduzido pelo documento.
      - "hora": Hora no formato HH:MM:SS. Se não visível, use "12:00:00".
      - "parcela_atual": Número da parcela atual. Se não houver, retorne null.
      - "parcela_total": Total de parcelas. Se não houver, retorne null.
      - "categoria_sugerida": Se o "valor" for negativo (saída), tente deduzir a categoria mais provável de acordo com o nome e apelido da transação, e selecione obrigatoriamente um dos seguintes valores exatos da nossa lista: [ ${listadeCategorias} ]. Se o "valor" for positivo (entrada/receita), ou se nenhuma categoria da lista fizer sentido, retorne null.

      REGRAS CRÍTICAS:
      1. Se uma transação NÃO tiver data, OU NÃO tiver nome, OU NÃO tiver valor claro, IGNORE-A COMPLETAMENTE.
      2. Não use blocos de código (markdown), retorne APENAS o JSON puro. A "categoria_sugerida" DEVE ser textualmente idêntica a uma das opções da lista de categorias ou null.`;

      if (documentPrompt.trim()) {
        prompt += `\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${documentPrompt.trim()}`;
      }

      const result = await model.generateContent([
        prompt,
        inlineData
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
      setDocumentFile(null);
      setDocumentPrompt('');
      setActiveMode('selection');

    } catch (error: any) {
      console.error("Erro detalhado:", error);
      alert(`Falha na IA ou Leitura do Documento: ${error.message || error}`);
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
        <h2 className="text-3xl font-bold text-text text-center"><br />Transações Pendentes</h2>
        <p className="text-text-light mt-1"><br />Nossa IA interpreta prints e planilhas! <br />Você também pode dar instruções extras para ela. Mande aqui seus arquivos, e confira ou edite a leitura abaixo. <br /> O progresso é salvo automaticamente! <br /> Crie categorias na aba "perfil", nossa IA usará somente elas. <br />  Depois, é só clicar em "aprovar" para que a transação apareça no seu balanço.</p>
      </header>

      <div
        className={`glass-panel flex flex-col items-center justify-center text-center border-dashed border-2 border-primary/30 transition-colors relative ${extractedData.length > 0 ? 'p-6 min-h-[200px]' : 'p-8 min-h-[400px]'} ${activeMode === 'selection' ? '' : 'hover:bg-primary/5'}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={activeMode === 'image' ? handleDrop : undefined}
      >
        {activeMode === 'selection' && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <h3 className={`${extractedData.length > 0 ? 'text-xl' : 'text-2xl'} font-bold text-text mb-8`}>
              {extractedData.length > 0 ? 'Adicionar mais transações via:' : 'O que você quer selecionar?'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl justify-center">
              <button
                onClick={() => setActiveMode('image')}
                className="flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm border-2 border-primary/10 hover:border-primary/60 hover:bg-primary/5 rounded-2xl transition-all shadow-sm group"
              >
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <ImageIcon size={28} />
                </div>
                <span className="font-bold text-text text-lg">Imagem</span>
              </button>

              <button
                onClick={() => setActiveMode('spreadsheet')}
                className="flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm border-2 border-primary/10 hover:border-primary/60 hover:bg-primary/5 rounded-2xl transition-all shadow-sm group"
              >
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet size={28} />
                </div>
                <span className="font-bold text-text text-lg">Planilha</span>
              </button>

              <button
                onClick={() => setActiveMode('document')}
                className="flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm border-2 border-primary/10 hover:border-primary/60 hover:bg-primary/5 rounded-2xl transition-all shadow-sm group"
              >
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileText size={28} />
                </div>
                <span className="font-bold text-text text-lg">Documentos</span>
              </button>

              <button
                onClick={addManualPendente}
                className="flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm border-2 border-primary/10 hover:border-primary/60 hover:bg-primary/5 rounded-2xl transition-all shadow-sm group"
              >
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <PlusCircle size={28} />
                </div>
                <span className="font-bold text-text text-lg">Manualmente</span>
              </button>
            </div>
          </div>
        )}

        {activeMode === 'image' && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <button
              onClick={() => setActiveMode('selection')}
              className="absolute top-4 left-4 flex items-center gap-2 text-sm text-text-light hover:text-primary transition-colors font-medium bg-transparent border-none cursor-pointer"
            >
              <ArrowLeft size={16} /> Voltar
            </button>

            <div className={`${extractedData.length > 0 ? 'w-10 h-10 mb-2' : 'w-16 h-16 mb-4'} bg-primary/10 text-primary rounded-full flex items-center justify-center shadow-inner mt-4`}>
              <UploadCloud size={extractedData.length > 0 ? 20 : 32} />
            </div>
            <h3 className={`${extractedData.length > 0 ? 'text-lg' : 'text-xl'} font-bold text-text mb-2`}>
              Adicionar via Imagem
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
                const selectedFiles = e.target.files;
                if (selectedFiles) {
                  setFiles(prev => [...prev, ...Array.from(selectedFiles)]);
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
                        className={`flex items-center gap-1.5 border rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold ${files.length > 5
                          ? 'bg-danger/10 border-danger/20 text-danger'
                          : 'bg-primary/10 border-primary/20 text-primary'
                          }`}
                      >
                        <span className="max-w-[150px] truncate" title={file.name}>
                          {file.name}
                        </span>
                        <button
                          onClick={() => removeFile(index)}
                          className={`rounded-full p-0.5 transition-colors cursor-pointer flex items-center justify-center ${files.length > 5
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
                  className={`py-2 px-6 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${files.length > 5
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
        )}

        {activeMode === 'spreadsheet' && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <button
              onClick={() => setActiveMode('selection')}
              className="absolute top-4 left-4 flex items-center gap-2 text-sm text-text-light hover:text-primary transition-colors font-medium bg-transparent border-none cursor-pointer"
            >
              <ArrowLeft size={16} /> Voltar
            </button>

            <div className={`${extractedData.length > 0 ? 'w-10 h-10 mb-2' : 'w-16 h-16 mb-4'} bg-primary/10 text-primary rounded-full flex items-center justify-center shadow-inner mt-4`}>
              <FileSpreadsheet size={extractedData.length > 0 ? 20 : 32} />
            </div>
            <h3 className={`${extractedData.length > 0 ? 'text-lg' : 'text-xl'} font-bold text-text mb-2`}>
              Adicionar via Planilha
            </h3>

            {!extractedData.length && (
              <p className="text-text-light max-w-md mb-6">Selecione seu arquivo (.xlsx, .xls, .csv) para que a IA realize o mapeamento inteligente dos dados.</p>
            )}

            <div className="w-full max-w-md mb-6 text-left">
              <label className="text-xs text-text-light uppercase font-bold mb-2 block">Instruções para a IA (Opcional)</label>
              <textarea
                className="glass-input w-full p-3 text-sm h-20 resize-none"
                placeholder="Descreva como sua planilha funciona para que a IA a interprete adequadamente.
Ex: as saídas estão de A2 até H7 e as entrada de J2 até K7, ignore A8 até L9, os dados de categoria podem ser obtidos na coluna A, etc."
                value={spreadsheetPrompt}
                onChange={(e) => setSpreadsheetPrompt(e.target.value)}
              />
            </div>

            <input
              type="file"
              id="spreadsheetInput"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) setSpreadsheetFile(selectedFile);
              }}
            />

            {!spreadsheetFile ? (
              <div className="flex gap-4">
                <label
                  htmlFor="spreadsheetInput"
                  className="cursor-pointer bg-primary hover:bg-primary-hover text-white font-medium py-2.5 px-6 rounded-xl shadow-lg shadow-primary/30 transition-all text-sm flex items-center justify-center"
                >
                  Selecionar Planilha
                </label>
              </div>
            ) : (
              <div className="mt-2 flex flex-col items-center w-full">
                <div className="font-medium mb-3 flex flex-col items-center gap-1 text-sm text-center w-full text-primary">
                  <span className="flex items-center gap-2">
                    <FileText size={16} /> Planilha Selecionada
                  </span>
                  <div className="flex items-center gap-1.5 border rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold bg-primary/10 border-primary/20 text-primary mt-2 mb-1">
                    <span className="max-w-[200px] truncate" title={spreadsheetFile.name}>
                      {spreadsheetFile.name}
                    </span>
                    <button
                      onClick={() => setSpreadsheetFile(null)}
                      className="rounded-full p-0.5 transition-colors cursor-pointer flex items-center justify-center hover:bg-primary/20 hover:text-danger text-primary"
                      title="Remover planilha"
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={processSpreadsheet}
                  disabled={loading}
                  className="py-2 px-6 rounded-lg font-medium transition-all flex items-center gap-2 text-sm bg-text text-white hover:bg-black cursor-pointer"
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processando com IA...</>
                  ) : 'Iniciar Leitura'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeMode === 'document' && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <button
              onClick={() => setActiveMode('selection')}
              className="absolute top-4 left-4 flex items-center gap-2 text-sm text-text-light hover:text-primary transition-colors font-medium bg-transparent border-none cursor-pointer"
            >
              <ArrowLeft size={16} /> Voltar
            </button>

            <div className={`${extractedData.length > 0 ? 'w-10 h-10 mb-2' : 'w-16 h-16 mb-4'} bg-primary/10 text-primary rounded-full flex items-center justify-center shadow-inner mt-4`}>
              <FileText size={extractedData.length > 0 ? 20 : 32} />
            </div>
            <h3 className={`${extractedData.length > 0 ? 'text-lg' : 'text-xl'} font-bold text-text mb-2`}>
              Adicionar via Documento
            </h3>

            {!extractedData.length && (
              <p className="text-text-light max-w-md mb-6">Selecione seu arquivo (.pdf) do extrato bancário do seu banco para que a IA leia as transações.</p>
            )}

            <div className="w-full max-w-md mb-6 text-left">
              <label className="text-xs text-text-light uppercase font-bold mb-2 block">Instruções para a IA (Opcional)</label>
              <textarea
                className="glass-input w-full p-3 text-sm h-20 resize-none"
                placeholder="Ex: Ignorar a fatura do cartão de crédito. Despreza as entradas maiores que R$ 2.000,00, etc."
                value={documentPrompt}
                onChange={(e) => setDocumentPrompt(e.target.value)}
              />
            </div>

            <input
              type="file"
              id="documentInput"
              className="hidden"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) setDocumentFile(selectedFile);
              }}
            />

            {!documentFile ? (
              <div className="flex gap-4">
                <label
                  htmlFor="documentInput"
                  className="cursor-pointer bg-primary hover:bg-primary-hover text-white font-medium py-2.5 px-6 rounded-xl shadow-lg shadow-primary/30 transition-all text-sm flex items-center justify-center"
                >
                  Selecionar Documento
                </label>
              </div>
            ) : (
              <div className="mt-2 flex flex-col items-center w-full">
                <div className="font-medium mb-3 flex flex-col items-center gap-1 text-sm text-center w-full text-primary">
                  <span className="flex items-center gap-2">
                    <FileText size={16} /> Documento Selecionado
                  </span>
                  <div className="flex items-center gap-1.5 border rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold bg-primary/10 border-primary/20 text-primary mt-2 mb-1">
                    <span className="max-w-[200px] truncate" title={documentFile.name}>
                      {documentFile.name}
                    </span>
                    <button
                      onClick={() => setDocumentFile(null)}
                      className="rounded-full p-0.5 transition-colors cursor-pointer flex items-center justify-center hover:bg-primary/20 hover:text-danger text-primary"
                      title="Remover documento"
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={processDocument}
                  disabled={loading}
                  className="py-2 px-6 rounded-lg font-medium transition-all flex items-center gap-2 text-sm bg-text text-white hover:bg-black cursor-pointer"
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processando com IA...</>
                  ) : 'Iniciar Leitura'}
                </button>
              </div>
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
