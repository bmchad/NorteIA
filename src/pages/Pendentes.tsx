import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UploadCloud, FileText, CheckCircle, XCircle, X, Image as ImageIcon, FileSpreadsheet, PlusCircle, ArrowLeft, ChevronDown, ChevronUp, Clock, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmModal from '../components/ConfirmModal';

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
  const [cicloDia, setCicloDia] = useState<number>(5);
  const [expandedRascunhos, setExpandedRascunhos] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });
  const [avisoEstorno, setAvisoEstorno] = useState<string | null>(null);

  const toggleRascunho = (id: string) => {
    setExpandedRascunhos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // 1. Buscar transações e categorias ao abrir a página
  useEffect(() => {
    fetchPendentes();
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
      { nome: 'Aluguel', cor: '#4B0082' },
      { nome: 'Farmácia', cor: '#D9FF00' },
      { nome: 'Educação', cor: '#FF007F' },
      { nome: 'Outras Receitas', cor: '#00FF00' },
      { nome: 'Comércio', cor: '#FF00F4' },
      { nome: 'Lavanderia', cor: '#A020F0' },
      { nome: 'Supermercado', cor: '#00FFFF' },
      { nome: 'Bancos', cor: '#FF8C00' },
      { nome: 'Viagem', cor: '#8F00FF' },
      { nome: 'Uber/99', cor: '#FFE900' },
      { nome: 'Carro', cor: '#FF00F4' },
      { nome: 'Táxi', cor: '#FFE900' },
      { nome: 'Vestuário/Beleza', cor: '#FF007F' },
      { nome: 'Entreterimento', cor: '#CF00FF' },
      { nome: 'Academia', cor: '#00BFFF' },
      { nome: 'Outros', cor: '#FF0000' },
      { nome: 'Ônibus/Metrô', cor: '#FF8C00' },
      { nome: 'Casa', cor: '#00FFF9' },
      { nome: 'Eletrônicos', cor: '#00BFFF' },
      { nome: 'Lingua estrangeira', cor: '#ef4444' },
      { nome: 'Assinaturas', cor: '#D9FF00' },
      { nome: 'Streaming', cor: '#D9FF00' },
      { nome: 'Governo', cor: '#BFFF00' },
      { nome: 'Comida', cor: '#001AFF' },
      { nome: 'Salário', cor: '#00FF00' },
      { nome: 'Médicos/Saúde', cor: '#FF00FF' },
      { nome: 'Apostas/Loteria', cor: '#8F00FF' }
    ];

    const insertData = defaultList.map((item) => ({
      user_id: userId,
      nome: item.nome,
      cor: item.cor
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

  /**
   * Erros que a Edge Function devolve com nome, traduzidos para o usuario.
   * Antes toda falha virava `alert(error.message)` com o texto cru da excecao -- inclusive
   * o 503 do Gemini, que e transitorio e nao merece parecer defeito.
   */
  const MENSAGENS_DE_ERRO: Record<string, string> = {
    NAO_AUTENTICADO: 'Sua sessao expirou. Entre novamente.',
    IA_INDISPONIVEL: 'O servidor da IA esta indisponivel no momento. Tente de novo em alguns instantes.',
    COTA_EXCEDIDA: 'A cota da IA foi excedida. Tente mais tarde.',
    RESPOSTA_INVALIDA: 'Nao consegui ler esse arquivo. Tente um print mais nitido ou outro formato.',
    REQUISICAO_INVALIDA: 'Arquivo invalido para este modo de importacao.',
  };

  /** Acima disto o payload em base64 fica grande demais para a Edge Function. */
  const LIMITE_DE_UPLOAD = 8 * 1024 * 1024;

  const lerComoBase64 = (arquivo: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(arquivo);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });

  /**
   * A unica porta de saida para a IA. Nenhuma tela fala com o Gemini: a chave vive como
   * secret da Edge Function `ai-agents`, e o que volta ja vem normalizado e pronto para
   * insert -- faltando so o `user_id`, que e acrescentado aqui para a escrita continuar
   * passando pela RLS da sessao do browser.
   */
  const chamarAgente = async (corpo: Record<string, unknown>) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error(MENSAGENS_DE_ERRO.NAO_AUTENTICADO);

    const { data, error } = await supabase.functions.invoke('ai-agents', {
      body: { agente: 'extrair-transacoes', ...corpo },
    });

    // `invoke` trata status >= 400 como erro e nao entrega o corpo; sem le-lo, o codigo
    // que a funcao classificou se perde e o usuario ve "non-2xx status code".
    if (error) {
      const resposta = (error as any)?.context;
      const detalhe = resposta && typeof resposta.json === 'function' ? await resposta.json().catch(() => null) : null;
      const codigo = detalhe?.erro?.codigo;
      throw new Error(MENSAGENS_DE_ERRO[codigo] || detalhe?.erro?.mensagem || error.message);
    }
    if (data?.erro) {
      throw new Error(MENSAGENS_DE_ERRO[data.erro.codigo] || data.erro.mensagem);
    }

    const transacoes = (data?.transacoes ?? []) as any[];
    const estornos = (data?.estornos ?? []) as any[];

    if (transacoes.length === 0) {
      throw new Error(
        estornos.length > 0
          ? `As ${estornos.length} linhas deste arquivo eram compra e estorno que se anulam. Nada a registrar.`
          : 'Nenhuma transacao foi encontrada neste arquivo.'
      );
    }

    const { error: erroInsert } = await supabase
      .from('transactions')
      .insert(transacoes.map(t => ({ ...t, user_id: user.id })));
    if (erroInsert) throw erroInsert;

    await fetchPendentes();

    // ⚠️ Nada some em silencio: se o lote tinha compra e estorno se anulando, o usuario
    // fica sabendo quantos pares sairam. Ver supabase/functions/ai-agents/lib/estornos.ts.
    if (estornos.length > 0) {
      setAvisoEstorno(
        `${estornos.length / 2} compra(s) estornada(s) foram descartadas: o lancamento e o `
        + `reembolso se anulam. Nao entraram como despesa nem como entrada.`
      );
    }
  };

  const processImage = async () => {
    if (files.length === 0) return;

    const total = files.reduce((acc, f) => acc + f.size, 0);
    if (total > LIMITE_DE_UPLOAD) {
      alert('Esses prints somam mais de 8 MB. Envie em duas levas.');
      return;
    }

    setLoading(true);
    try {
      const arquivos = await Promise.all(
        files.map(async f => ({ mimeType: f.type, base64: await lerComoBase64(f) }))
      );

      await chamarAgente({ modo: 'imagem', arquivos, instrucao: customPrompt });
      setFiles([]);
    } catch (error: any) {
      console.error('Falha ao processar imagens:', error);
      alert(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  const processSpreadsheet = async () => {
    if (!spreadsheetFile) return;
    setLoading(true);

    try {
      // A planilha continua sendo lida aqui: converter xlsx em CSV nao e chamada de
      // agente, e o CSV viaja bem menor que o arquivo binario.
      const buffer = await spreadsheetFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);

      await chamarAgente({ modo: 'planilha', csv, instrucao: spreadsheetPrompt });

      setSpreadsheetFile(null);
      setSpreadsheetPrompt('');
      setActiveMode('selection');
    } catch (error: any) {
      console.error('Falha ao processar planilha:', error);
      alert(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  const processDocument = async () => {
    if (!documentFile) return;

    if (documentFile.size > LIMITE_DE_UPLOAD) {
      alert('Esse PDF passa de 8 MB. Envie um arquivo menor ou separe as paginas.');
      return;
    }

    setLoading(true);
    try {
      const arquivos = [{
        mimeType: documentFile.type || 'application/pdf',
        base64: await lerComoBase64(documentFile),
      }];

      await chamarAgente({ modo: 'pdf', arquivos, instrucao: documentPrompt });

      setDocumentFile(null);
      setDocumentPrompt('');
      setActiveMode('selection');
    } catch (error: any) {
      console.error('Falha ao processar documento:', error);
      alert(error.message || String(error));
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
        nome: 'Registro Manual "${registerNumber}"',
        apelido: '',
        valor: 0,
        banco: null,
        mes_fatura: null,
        categoria_id: null,
        hora: '12:00:00',
        parcela_atual: null,
        parcela_total: null,
        pendente: true,
        // Sem isto a linha cairia no DEFAULT 'extrato' e entraria nas medições por nome
        // como se tivesse vindo de um PDF de banco.
        origem: 'manual'
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
    if (extractedData.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Aprovar Tudo',
      message: `Tem certeza que deseja aprovar TODAS as ${extractedData.length} transações?`,
      onConfirm: async () => {
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
      }
    });
  };

  const reprovarTudo = async () => {
    if (extractedData.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Reprovar Tudo',
      message: `Tem certeza que deseja reprovar e excluir TODAS as ${extractedData.length} transações pendentes?`,
      onConfirm: async () => {
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
      }
    });
  };

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

      {avisoEstorno && (
        <div className="glass-panel p-4 flex items-start gap-3 border-l-4 border-primary">
          <Info size={20} className="text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-text-light flex-1">{avisoEstorno}</p>
          <button
            onClick={() => setAvisoEstorno(null)}
            className="text-text-light hover:text-text p-1"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <header>
        <h2 className="text-3xl font-bold text-text flex items-center gap-3">
          <Clock size={32} className="text-primary" /> Novos Registros
        </h2>
        <p className="text-text-light mt-1">
          <br />
          Nossa IA interpreta prints e planilhas! <br />
          Você também pode dar instruções extras para ela. Mande aqui seus arquivos, e confira ou edite a leitura abaixo. <br />
          O progresso é salvo automaticamente! Crie categorias na aba "perfil", nossa IA usará somente elas. <br />
          Depois, é só clicar em "aprovar" para que a transação apareça no seu balanço.
        </p>
      </header>

      <div
        className={`glass-panel flex flex-col items-center justify-start pt-8 text-center border-dashed border-2 border-primary/30 transition-colors relative ${extractedData.length > 0 ? 'p-6 min-h-[200px]' : 'px-8 pb-8 min-h-[400px]'} ${activeMode === 'selection' ? '' : 'hover:bg-primary/5'}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={activeMode === 'image' ? handleDrop : undefined}
      >
        {activeMode === 'selection' && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <h3 className={`${extractedData.length > 0 ? 'text-xl' : 'text-2xl'} font-bold text-text mb-4`}>
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
                <span className="text-[10px] text-text-light mt-1 font-medium">Formatos: .jpg, .jpeg, .png, .webp</span>
              </button>

              <button
                onClick={() => setActiveMode('spreadsheet')}
                className="flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm border-2 border-primary/10 hover:border-primary/60 hover:bg-primary/5 rounded-2xl transition-all shadow-sm group"
              >
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet size={28} />
                </div>
                <span className="font-bold text-text text-lg">Planilha</span>
                <span className="text-[10px] text-text-light mt-1 font-medium">Formatos: .xlsx, .csv, .xls</span>
              </button>

              <button
                onClick={() => setActiveMode('document')}
                className="flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm border-2 border-primary/10 hover:border-primary/60 hover:bg-primary/5 rounded-2xl transition-all shadow-sm group"
              >
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileText size={28} />
                </div>
                <span className="font-bold text-text text-lg">Documentos</span>
                <span className="text-[10px] text-text-light mt-1 font-medium">Formatos: .pdf, .docx, .txt</span>
              </button>

              <button
                onClick={addManualPendente}
                className="flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm border-2 border-primary/10 hover:border-primary/60 hover:bg-primary/5 rounded-2xl transition-all shadow-sm group"
              >
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <PlusCircle size={28} />
                </div>
                <span className="font-bold text-text text-lg">Registro manual</span>
                <span className="text-[10px] text-text-light mt-1 font-medium">Edite você mesmo!</span>
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
                <div className={`font-medium mb-3 flex flex-col items-center gap-1 text-sm text-center w-full ${files.length > 10 ? 'text-danger font-bold' : 'text-primary'}`}>
                  <span className="flex items-center gap-2">
                    <FileText size={16} />
                    <span>{files.length}/10 {files.length === 1 ? 'imagem selecionada' : 'imagens selecionadas'}</span>
                  </span>
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg mt-2 mb-1">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-1.5 border rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold ${files.length > 10
                          ? 'bg-danger/10 border-danger/20 text-danger'
                          : 'bg-primary/10 border-primary/20 text-primary'
                          }`}
                      >
                        <span className="max-w-[150px] truncate" title={file.name}>
                          {file.name}
                        </span>
                        <button
                          onClick={() => removeFile(index)}
                          className={`rounded-full p-0.5 transition-colors cursor-pointer flex items-center justify-center ${files.length > 10
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
                  disabled={loading || files.length > 10}
                  className={`py-2 px-6 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${files.length > 10
                    ? 'bg-border text-text-light cursor-not-allowed opacity-60'
                    : 'bg-text text-white hover:bg-black cursor-pointer'
                    }`}
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processando com IA... não saia da tela, pode demorar até 2 minutos.</>
                  ) : 'Iniciar Leitura'}
                </button>

                {files.length > 10 && (
                  <p className="text-danger text-xs font-bold mt-2 animate-pulse">
                    Selecione até 10 imagens para iniciar a leitura
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

          {extractedData.map((item) => {
            const isExpanded = expandedRascunhos.has(item.id);
            return (
              <div key={item.id} className="glass-panel flex flex-col border-l-4 border-l-primary/50 overflow-hidden">
                <div className="p-4 flex flex-col xl:flex-row items-center gap-4 justify-between">
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                    {/* Data */}
                    <div>
                      <span className="text-xs text-text-light uppercase">Data</span>
                      <input
                        type="date"
                        defaultValue={item.data}
                        onBlur={(e) => handleUpdateField(item.id, 'data', e.target.value)}
                        className="glass-input w-full p-1 text-sm bg-transparent border-transparent hover:border-border"
                      />
                    </div>
                    {/* Apelido */}
                    <div>
                      <span className="text-xs text-text-light uppercase">Apelido</span>
                      <input
                        type="text"
                        defaultValue={item.apelido || item.nome}
                        onBlur={(e) => handleUpdateField(item.id, 'apelido', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className="glass-input w-full p-1 text-sm font-medium"
                      />
                    </div>
                    {/* Categoria */}
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
                    {/* Valor */}
                    <div>
                      <span className="text-xs text-text-light uppercase">Valor (R$)</span>
                      <div className="flex items-center glass-input w-full p-0 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            const isNeg = item.valor < 0 || Object.is(item.valor, -0);
                            const currentAbs = Math.abs(item.valor);
                            const newSign = isNeg ? 1 : -1;
                            handleUpdateField(item.id, 'valor', currentAbs === 0 ? (newSign === -1 ? -0 : 0) : currentAbs * newSign);
                          }}
                          className={`font-extrabold px-2 py-1 flex items-center justify-center transition-colors hover:bg-black/5 ${item.valor < 0 || Object.is(item.valor, -0) ? 'text-danger' : 'text-primary'}`}
                          title="Alternar Entrada/Saída"
                        >
                          {item.valor < 0 || Object.is(item.valor, -0) ? '-' : '+'}
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={Math.abs(item.valor)}
                          onInput={(e) => {
                            e.currentTarget.value = e.currentTarget.value.replace(/[^0-9.,]/g, '');
                          }}
                          onBlur={(e) => {
                            const isNeg = item.valor < 0 || Object.is(item.valor, -0);
                            const valStr = e.target.value.replace(',', '.');
                            const val = Math.abs(parseFloat(valStr) || 0);
                            handleUpdateField(item.id, 'valor', isNeg ? -val : val);
                            e.target.value = val.toString();
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          className={`w-full bg-transparent border-none outline-none py-1 pr-1 text-sm font-bold ${item.valor < 0 || Object.is(item.valor, -0) ? 'text-danger' : 'text-primary'}`}
                        />
                      </div>
                    </div>
                  </div>
                  {/* Botões */}
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

                {/* Toggle and Advanced Options */}
                <div className="border-t border-border">
                  <button
                    onClick={() => toggleRascunho(item.id)}
                    className="w-full flex items-center justify-start px-4 gap-2 py-2 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
                  >
                    Opções Avançadas
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {isExpanded && (
                    <div className="p-4 bg-transparent animate-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* Nome Original */}
                        <div className="col-span-1 md:col-span-4">
                          <span className="text-[10px] text-text-light uppercase font-bold block mb-1">Nome Original</span>
                          <input
                            type="text"
                            defaultValue={item.nome || ''}
                            onBlur={(e) => handleUpdateField(item.id, 'nome', e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            className="glass-input w-full p-2 text-sm bg-transparent border-transparent hover:border-border text-text-light"
                            title="Nome Original"
                          />
                        </div>
                        {/* Balanço de */}
                        <div className="col-span-1 md:col-span-3">
                          <span className="text-[10px] text-text-light uppercase font-bold block mb-1">Balanço de</span>
                          <select
                            value={item.mes_fatura || ''}
                            onChange={(e) => handleUpdateField(item.id, 'mes_fatura', e.target.value || null)}
                            className="glass-input w-full p-2 bg-transparent border-transparent hover:border-border text-xs appearance-none cursor-pointer"
                          >
                            <option value="">Ciclo do dia {cicloDia}</option>
                            {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map(mes => (
                              <option key={mes} value={mes} className="text-black">{mes}</option>
                            ))}
                          </select>
                        </div>
                        {/* Banco */}
                        <div className="col-span-1 md:col-span-2">
                          <span className="text-[10px] text-text-light uppercase font-bold block mb-1">Banco</span>
                          <input
                            type="text"
                            placeholder="Banco"
                            defaultValue={item.banco || ''}
                            onBlur={(e) => handleUpdateField(item.id, 'banco', e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            className="glass-input w-full p-2 bg-transparent border-transparent hover:border-border text-xs"
                            title="Banco"
                          />
                        </div>
                        {/* Parcelas */}
                        <div className="col-span-1 md:col-span-3">
                          <span className="text-[10px] text-text-light uppercase font-bold block mb-1">Parcelas</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="Atual"
                              defaultValue={item.parcela_atual || ''}
                              onBlur={(e) => handleUpdateField(item.id, 'parcela_atual', e.target.value ? parseInt(e.target.value) : null)}
                              className="glass-input w-full p-2 bg-transparent border-transparent hover:border-border text-xs text-center"
                              title="Parcela Atual"
                            />
                            <span className="text-text-light font-bold">/</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="Total"
                              defaultValue={item.parcela_total || ''}
                              onBlur={(e) => handleUpdateField(item.id, 'parcela_total', e.target.value ? parseInt(e.target.value) : null)}
                              className="glass-input w-full p-2 bg-transparent border-transparent hover:border-border text-xs text-center"
                              title="Total de Parcelas"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
