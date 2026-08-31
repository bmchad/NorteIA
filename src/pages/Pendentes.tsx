import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, CheckCircle, XCircle, X, Image as ImageIcon, PlusCircle, ArrowLeft, ChevronDown, ChevronUp, Clock, Info, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmModal from '../components/ConfirmModal';
import { grupoDoModo, modoDoArquivo, ROTULO_MODO } from '../lib/arquivos';
import { baixarDemonstracao } from '../lib/demo';

export default function Pendentes() {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [instrucao, setInstrucao] = useState('');
  const [activeMode, setActiveMode] = useState<'selection' | 'arquivo' | 'manual'>('selection');
  const [formManual, setFormManual] = useState({ nome: '', valor: '', data: '', categoria_id: '' });
  // ⚠️ Valor do PRIMEIRO render, antes de a consulta voltar -- nao e so um
  // placeholder: com um numero diferente do que esta no banco, a primeira pintura
  // agrupa por uma fronteira de ciclo e a segunda por outra. Padrao 1.
  const [cicloDia, setCicloDia] = useState<number>(1);
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

  const removerArquivo = (indexToRemove: number) => {
    setArquivos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // 1. Buscar transações e categorias ao abrir a página
  useEffect(() => {
    fetchPendentes();
    fetchCategories();
    fetchTiposDeCompromisso();
    fetchCiclo();
  }, []);

  /**
   * Os tipos de compromisso que a revisão oferece.
   *
   * ⛔ **Não semeia**, ao contrário do que esta tela faz com as categorias: a semente dos
   * tipos é do `/perfil`, dono da configuração (D-029). Duas telas semeando a mesma tabela
   * é a corrida que duplicou os gastos fixos (L-008).
   */
  const fetchTiposDeCompromisso = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('compromissos')
        .select('slug, titulo')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .order('titulo');

      if (error) throw error;
      setTipos(data ?? []);
    } catch (err) {
      console.error("Erro ao buscar tipos de compromisso:", err);
    }
  };

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

  /**
   * As categorias do primeiro acesso.
   *
   * ⭐ **Três delas carregam uma decisão, e não só um nome.** `Salário` e `Outras Receitas`
   * nascem marcadas como renda, porque sem nenhuma marcada o card Renda e o "o que sobra"
   * do Dashboard aparecem vazios até alguém descobrir o interruptor no `/perfil`.
   *
   * ⭐⭐ **`Reembolsos` é o que torna `Outras Receitas` segura como renda.** Sem um destino
   * para o positivo que não é renda, devolução e rateio caem no mesmo balde e inflam o
   * divisor de "% da renda" com dinheiro que apenas voltou para a conta. → D-025
   *
   * ⚠️ **Só roda com `categories` vazia**, isto é, no primeiro acesso. Quem já usa o app não
   * ganha `Reembolsos` nem as marcas de renda — marcar `e_renda` numa conta em uso mudaria o
   * divisor do Dashboard sem aviso, e quem configurou à mão pode ter escolhido diferente.
   */
  const seedDefaultCategories = async (userId: string) => {
    const defaultList: { nome: string; cor: string; e_renda?: boolean }[] = [
      { nome: 'Aluguel', cor: '#4B0082' },
      { nome: 'Farmácia', cor: '#D9FF00' },
      { nome: 'Educação', cor: '#FF007F' },
      { nome: 'Outras Receitas', cor: '#00FF00', e_renda: true },
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
      { nome: 'Salário', cor: '#00FF00', e_renda: true },
      { nome: 'Médicos/Saúde', cor: '#FF00FF' },
      { nome: 'Apostas/Loteria', cor: '#8F00FF' },
      { nome: 'Reembolsos', cor: '#22c55e' }
    ];

    const insertData = defaultList.map((item) => ({
      user_id: userId,
      nome: item.nome,
      cor: item.cor,
      e_renda: item.e_renda ?? false
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

  /**
   * ⚠️ O `accept` do input é só filtro do diálogo do sistema, e o arrastar-e-soltar nem o
   * consulta. A validação de verdade tem de estar aqui e no seletor, não no atributo.
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const soltos = Array.from(e.dataTransfer.files).filter(f => modoDoArquivo(f) !== null);
    if (soltos.length > 0) setArquivos(prev => [...prev, ...soltos]);
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

  /**
   * Lê os arquivos escolhidos e manda para a IA.
   *
   * ⭐⭐ Uma função no lugar de três. As antigas `processImage`, `processSpreadsheet` e
   * `processDocument` diferiam em quatro coisas: o valor de `modo`, `arquivos` (base64) contra
   * `csv` (texto), qual estado de instrução liam, e singular contra plural. O resto era cópia.
   *
   * ⚠️ **Um envio carrega um `modo`, e o `modo` escolhe um prompt** — daí a exigência de que
   * os arquivos sejam do mesmo grupo. Não é limite do modelo: o Gemini aceita mime types
   * diferentes na mesma chamada, e hoje um PDF enviado como imagem funciona por acidente, com
   * o prompt errado.
   */
  const processarArquivos = async () => {
    if (arquivos.length === 0) return;

    const modos = arquivos.map(modoDoArquivo);
    const desconhecido = arquivos.find((_, i) => modos[i] === null);
    if (desconhecido) {
      alert(`Não sei ler "${desconhecido.name}". Envie imagem, PDF ou planilha.`);
      return;
    }

    const grupos = new Set(modos.map(m => grupoDoModo(m!)));
    if (grupos.size > 1) {
      alert('Envie um tipo de arquivo por vez: planilha separada de imagem e PDF.');
      return;
    }

    // ⚠️ O limite agora vale para os três. Antes a planilha não checava nada, e um .xlsx
    // grande virava um CSV que estourava no prompt sem aviso nenhum.
    const total = arquivos.reduce((acc, f) => acc + f.size, 0);
    if (total > LIMITE_DE_UPLOAD) {
      alert('Esses arquivos somam mais de 8 MB. Envie em duas levas.');
      return;
    }

    setLoading(true);
    try {
      if (modos[0] === 'planilha') {
        // ⚠️ Só a primeira aba. Converter no browser não é chamada de agente, e o CSV viaja
        // muito menor que o binário.
        const buffer = await arquivos[0].arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
        await chamarAgente({ modo: 'planilha', csv, instrucao });
      } else {
        const anexos = await Promise.all(arquivos.map(async f => ({
          mimeType: f.type || (modoDoArquivo(f) === 'pdf' ? 'application/pdf' : 'image/png'),
          base64: await lerComoBase64(f),
        })));
        await chamarAgente({ modo: modos[0], arquivos: anexos, instrucao });
      }
      limparEnvio();
    } catch (error: any) {
      console.error(error);
      alert(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  /** ⚠️ Antes, "Voltar" no modo imagem não limpava nada: os arquivos ficavam presos no estado, invisíveis, e reapareciam. */
  const limparEnvio = () => {
    setArquivos([]);
    setInstrucao('');
    setActiveMode('selection');
  };

  /**
   * Registro manual.
   *
   * ⭐ Era um card que inseria uma linha em branco com valor 0 para você preencher na revisão.
   * Sendo metade da tela agora, pede os campos antes.
   *
   * ⚠️ `origem: 'manual'` tem de sobreviver: sem ele a linha cai no `DEFAULT 'extrato'` e
   * entra nas medições por origem como se tivesse vindo de um PDF de banco.
   */
  const criarManual = async () => {
    const nome = formManual.nome.trim();
    const valor = parseFloat(formManual.valor.replace(',', '.'));
    if (!nome || isNaN(valor)) return;

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { error } = await supabase.from('transactions').insert([{
        user_id: user.id,
        data: formManual.data || new Date().toISOString().split('T')[0],
        nome,
        apelido: nome,
        valor,
        banco: null,
        mes_fatura: null,
        categoria_id: formManual.categoria_id || null,
        hora: '12:00:00',
        parcela_atual: null,
        parcela_total: null,
        pendente: true,
        origem: 'manual',
      }]);
      if (error) throw error;

      setFormManual({ nome: '', valor: '', data: '', categoria_id: '' });
      setActiveMode('selection');
      await fetchPendentes();
    } catch (error: any) {
      console.error(error);
      alert(error.message || String(error));
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

  /**
   * O compromisso escolhido à mão no rascunho.
   *
   * ⚠️ **Não basta gravar `compromisso`.** Vai junto `compromisso_manual = true`, que é o
   * passo 0 da cascata (D-033): sem ele, a próxima importação, um gasto fixo aceito ou o
   * agente 2 sobrescrevem a escolha, e ela some sem aviso nenhum. Por isso isto não passa
   * pelo `handleUpdateField` genérico, que gravaria um campo só.
   *
   * ⭐ **Limpar também é uma declaração.** "Nenhum" grava `null` COM `compromisso_manual`,
   * mesma regra do `removerDoCompromisso` em `/compromissos`: a detecção não pode devolver
   * o que o usuário tirou.
   *
   * ⚠️ Escolher aqui **não** cria um exemplo em `compromisso_exemplos`. Exemplo implica
   * rótulo; rótulo não implica exemplo. Quem quiser ensinar o agente faz isso no `/perfil`.
   */
  const handleCompromissoChange = async (id: string, slug: string) => {
    const compromisso = slug || null;
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ compromisso, compromisso_manual: true })
        .eq('id', id);

      if (error) throw error;
      setExtractedData(prev => prev.map(t => (
        t.id === id ? { ...t, compromisso, compromisso_manual: true } : t
      )));
    } catch (error) {
      console.error("Erro ao gravar o compromisso:", error);
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
        <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
          <Clock size={32} className="text-primary" /> Novos Registros
        </h2>
        <p className="text-text-light mt-1">
          Envie um print, um PDF ou uma planilha — cada transação entra como rascunho, para você conferir e editar. <br />
          Nada vai para o balanço antes de você aprovar, e o que você edita salva sozinho.
        </p>
      </header>

      <div
        className={`glass-panel flex flex-col items-center justify-start pt-8 text-center border-dashed border-2 border-primary/30 transition-colors relative ${extractedData.length > 0 ? 'p-6 min-h-[200px]' : 'px-8 pb-8 min-h-[400px]'} ${activeMode === 'selection' ? '' : 'hover:bg-primary/5'}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={activeMode === 'arquivo' ? handleDrop : undefined}
      >
        {activeMode === 'selection' && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <h3 className={`${extractedData.length > 0 ? 'text-xl' : 'text-2xl'} font-bold text-text mb-4`}>
              {extractedData.length > 0 ? 'Adicionar mais transações via:' : 'Como você quer registrar?'}
            </h3>

            {/* ⭐ Duas portas. Eram quatro, e três delas perguntavam o que o próprio arquivo
                já responde — o tipo dele. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
              <button
                onClick={() => setActiveMode('arquivo')}
                className="flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm border-2 border-primary/10 hover:border-primary/60 hover:bg-primary/5 rounded-2xl transition-all shadow-sm group"
              >
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <ImageIcon size={28} />
                </div>
                <span className="font-bold text-text text-lg">Arquivo</span>
                <span className="text-[10px] text-text-light mt-1 font-medium">Print, PDF ou planilha — a IA lê</span>
              </button>

              <button
                onClick={() => setActiveMode('manual')}
                className="flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm border-2 border-primary/10 hover:border-primary/60 hover:bg-primary/5 rounded-2xl transition-all shadow-sm group"
              >
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <PlusCircle size={28} />
                </div>
                <span className="font-bold text-text text-lg">Registro manual</span>
                <span className="text-[10px] text-text-light mt-1 font-medium">Você digita, sem IA</span>
              </button>
            </div>

            {/* ⭐ Mora na tela de escolha, e não dentro de "Arquivo": quem não tem o que
                importar está aqui, e é aqui que ele precisa de um arquivo para experimentar.
                ⭐ O `.csv` é montado na hora, com datas relativas a hoje — um arquivo fixo no
                repositório envelheceria e mostraria histórico morto. Ver src/lib/demo.ts. */}
            <button
              type="button"
              onClick={() => baixarDemonstracao()}
              className="mt-5 flex items-center gap-2 text-xs font-medium text-text-light hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
              title="Um .csv com seis meses de transações fictícias, para experimentar a plataforma"
            >
              <Download size={14} /> Não tem um arquivo à mão? Baixe uma planilha de exemplo
            </button>
          </div>
        )}

        {activeMode === 'arquivo' && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <button
              onClick={limparEnvio}
              className="absolute top-4 left-4 flex items-center gap-2 text-sm text-text-light hover:text-primary transition-colors font-medium bg-transparent border-none cursor-pointer"
            >
              <ArrowLeft size={16} /> Voltar
            </button>

            <div className={`${extractedData.length > 0 ? 'w-10 h-10 mb-2' : 'w-16 h-16 mb-4'} bg-primary/10 text-primary rounded-full flex items-center justify-center`}>
              <ImageIcon size={extractedData.length > 0 ? 20 : 32} />
            </div>
            <h3 className={`${extractedData.length > 0 ? 'text-lg' : 'text-xl'} font-bold text-text mb-1`}>
              Envie seus arquivos
            </h3>
            <p className="text-text-light text-sm mb-4 max-w-md">
              Print de extrato, fatura em PDF ou planilha. ⚠️ Um tipo por vez.
            </p>

            <textarea
              value={instrucao}
              onChange={e => setInstrucao(e.target.value)}
              placeholder="Instruções para a IA (opcional). Ex: ignore as linhas de pagamento de fatura."
              className="glass-input w-full max-w-lg p-3 text-sm mb-4 resize-none"
              rows={2}
            />

            <input
              type="file"
              id="fileInput"
              className="hidden"
              multiple
              accept="image/*,application/pdf,.pdf,.xlsx,.xls,.csv"
              onChange={(e) => {
                const escolhidos = Array.from(e.target.files ?? []).filter(f => modoDoArquivo(f) !== null);
                if (escolhidos.length > 0) setArquivos(prev => [...prev, ...escolhidos]);
                e.target.value = '';
              }}
            />

            <label
              htmlFor="fileInput"
              className="cursor-pointer bg-primary hover:bg-primary-hover text-white font-medium py-2.5 px-6 rounded-xl shadow-lg shadow-primary/30 transition-all text-sm flex items-center justify-center"
            >
              Selecionar arquivo
            </label>

            {arquivos.length > 0 && (
              <div className="mt-4 flex flex-col items-center w-full">
                <div className={`font-medium mb-3 flex flex-col items-center gap-1 text-sm text-center w-full ${arquivos.length > 10 ? 'text-danger font-bold' : 'text-azul'}`}>
                  <span className="flex items-center gap-2">
                    <FileText size={16} />
                    <span>
                      {arquivos.length}/10{' '}
                      {(() => {
                        const grupos = new Set(arquivos.map(f => modoDoArquivo(f)).map(m => m && ROTULO_MODO[m]));
                        return grupos.size === 1 ? [...grupos][0] : 'arquivos';
                      })()}
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg mt-2 mb-1">
                    {arquivos.map((file, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-1.5 border rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold ${arquivos.length > 10
                          ? 'bg-danger/10 border-danger/20 text-danger'
                          : 'bg-primary/10 border-primary/20 text-azul'
                          }`}
                      >
                        <span className="max-w-[150px] truncate" title={file.name}>{file.name}</span>
                        <button
                          onClick={() => removerArquivo(index)}
                          className="rounded-full p-0.5 transition-colors cursor-pointer flex items-center justify-center hover:bg-primary/20 hover:text-danger text-primary"
                          title="Remover arquivo"
                          type="button"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={processarArquivos}
                  disabled={loading || arquivos.length > 10}
                  className={`py-2 px-6 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${arquivos.length > 10
                    ? 'bg-border text-text-light cursor-not-allowed opacity-60'
                    : 'bg-text text-white hover:bg-black cursor-pointer'
                    }`}
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processando com IA... não saia da tela, pode demorar até 2 minutos.</>
                  ) : 'Iniciar Leitura'}
                </button>

                {arquivos.length > 10 && (
                  <p className="text-danger text-xs font-bold mt-2 animate-pulse">
                    Selecione até 10 arquivos para iniciar a leitura
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeMode === 'manual' && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <button
              onClick={() => { setActiveMode('selection'); setFormManual({ nome: '', valor: '', data: '', categoria_id: '' }); }}
              className="absolute top-4 left-4 flex items-center gap-2 text-sm text-text-light hover:text-primary transition-colors font-medium bg-transparent border-none cursor-pointer"
            >
              <ArrowLeft size={16} /> Voltar
            </button>

            <div className={`${extractedData.length > 0 ? 'w-10 h-10 mb-2' : 'w-16 h-16 mb-4'} bg-primary/10 text-primary rounded-full flex items-center justify-center`}>
              <PlusCircle size={extractedData.length > 0 ? 20 : 32} />
            </div>
            <h3 className={`${extractedData.length > 0 ? 'text-lg' : 'text-xl'} font-bold text-text mb-1`}>
              Registro manual
            </h3>
            <p className="text-text-light text-sm mb-4 max-w-md">
              ⚠️ Valor negativo é saída; positivo é entrada.
            </p>

            <div className="w-full max-w-lg space-y-2 text-left">
              <input
                value={formManual.nome}
                onChange={e => setFormManual({ ...formManual, nome: e.target.value })}
                placeholder="Nome da transação"
                className="glass-input w-full p-2 text-sm bg-white"
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                <input
                  value={formManual.valor}
                  onChange={e => setFormManual({ ...formManual, valor: e.target.value })}
                  placeholder="Valor (ex: -49,90)"
                  inputMode="decimal"
                  className="glass-input p-2 text-sm bg-white flex-1 min-w-[140px]"
                />
                <input
                  type="date"
                  value={formManual.data}
                  onChange={e => setFormManual({ ...formManual, data: e.target.value })}
                  className="glass-input p-2 text-sm bg-white flex-1 min-w-[140px]"
                  title="Em branco, usa hoje"
                />
                <select
                  value={formManual.categoria_id}
                  onChange={e => setFormManual({ ...formManual, categoria_id: e.target.value })}
                  className="glass-input p-2 text-sm bg-white flex-1 min-w-[140px] cursor-pointer"
                >
                  <option value="">Sem categoria</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={criarManual}
              disabled={!formManual.nome.trim() || formManual.valor.trim() === ''}
              className="mt-4 py-2 px-6 rounded-lg font-medium bg-text text-white hover:bg-black transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Criar rascunho
            </button>
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
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 w-full">
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
                    {/* Compromisso — ao lado de Categoria porque os dois são classificação.
                        ⛔ Sem "+ Adicionar" aqui, ao contrário de Categoria: criar um tipo pede
                        periodicidade, valor e exemplos, e isso mora no `/perfil` (D-029). Um
                        prompt() de nome solto criaria tipos vazios. */}
                    <div>
                      <span className="text-xs text-text-light uppercase">Compromisso</span>
                      <select
                        value={item.compromisso || ''}
                        onChange={(e) => handleCompromissoChange(item.id, e.target.value)}
                        className="glass-input w-full p-1 bg-transparent border-transparent hover:border-border text-sm appearance-none cursor-pointer"
                        title={tipos.length === 0 ? 'Nenhum tipo cadastrado. Crie em Perfil.' : 'Compromisso'}
                      >
                        <option value="">Nenhum</option>
                        {tipos.map(t => (
                          <option key={t.slug} value={t.slug} className="text-black">{t.titulo}</option>
                        ))}
                        {/* ⚠️ Rótulo de um tipo desativado depois da importação: sem esta
                            opção o select cairia em "Nenhum" e mentiria sobre o dado. */}
                        {item.compromisso && !tipos.some(t => t.slug === item.compromisso) && (
                          <option value={item.compromisso} className="text-black">{item.compromisso}</option>
                        )}
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
