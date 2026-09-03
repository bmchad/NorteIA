import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, CheckCircle, XCircle, X, Image as ImageIcon, PlusCircle, ArrowLeft, ChevronDown, ChevronUp, Clock, Info, Download, CreditCard, Landmark } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmModal from '../components/ConfirmModal';
import { grupoDoModo, modoDoArquivo, ROTULO_MODO } from '../lib/arquivos';
import { baixarDemonstracao } from '../lib/demo';

type Ordenacao = 'data_desc' | 'data_asc' | 'banco_asc' | 'banco_desc';

export default function Pendentes() {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [instrucao, setInstrucao] = useState('');
  /**
   * O instrumento de pagamento do envio inteiro: cartão de crédito ou débito em conta.
   *
   * ⭐⭐ **Por envio, e isso é o desenho certo — não um atalho.** Um extrato *é* a conta
   * corrente; uma fatura *é* o cartão. O documento inteiro tem um instrumento só, então
   * classificar o lote de uma vez acerta todas as linhas, e quem enviou o arquivo sabe qual
   * dos dois é.
   *
   * ⛔ **O agente 1 não devolve este campo, e não pode passar a devolver.** Seriam dois
   * escritores para a mesma coluna, que é o defeito registrado na D-034 sobre `compromisso`:
   * os dois respondem, o último a escrever vence, e a classificação muda sozinha entre
   * importações. O prompt de extração, aliás, admite não saber distinguir — `ORIGEM` diz
   * "print de extrato bancário **ou** fatura de cartão".
   *
   * ⚠️ Não é a direção do dinheiro. Essa continua sendo o sinal de `valor`.
   */
  const [tipoDoEnvio, setTipoDoEnvio] = useState<'credito' | 'debito'>('debito');
  const [activeMode, setActiveMode] = useState<'selection' | 'arquivo' | 'manual'>('selection');
  const [formManual, setFormManual] = useState({ nome: '', valor: '', data: '', categoria_id: '' });
  // ⚠️ Valor do PRIMEIRO render, antes de a consulta voltar -- nao e so um
  // placeholder: com um numero diferente do que esta no banco, a primeira pintura
  // agrupa por uma fronteira de ciclo e a segunda por outra. Padrao 1.
  const [cicloDia, setCicloDia] = useState<number>(1);
  const [expandedRascunhos, setExpandedRascunhos] = useState<Set<string>>(new Set());
  /**
   * Como a lista de rascunhos é exibida. Padrão `data_desc` porque é o que mais se parece
   * com a ordem de chegada que a página sempre teve — quem já usa a tela não a encontra de
   * cabeça para baixo.
   *
   * ⚠️ Isto é **só apresentação**. A fonte de verdade continua sendo `extractedData`, que é
   * o que todos os handlers de aprovar/descartar/editar leem e escrevem.
   */
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('data_desc');
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });
  const [avisoEstorno, setAvisoEstorno] = useState<string | null>(null);
  /**
   * A conta já tem alguma transação? `null` enquanto não se sabe.
   *
   * ⭐ Decide o **peso** do convite da planilha de exemplo: faixa em destaque na conta
   * vazia, link discreto quando há histórico. Quem precisa da demonstração é quem não tem
   * o que importar — para quem importa extrato toda semana, a caixa laranja é ruído.
   */
  const [temTransacoes, setTemTransacoes] = useState<boolean | null>(null);

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
    fetchTemTransacoes();
    fetchCiclo();
  }, []);

  /**
   * A conta tem alguma transação, de qualquer espécie?
   *
   * ⭐⭐ **Conta TODAS, sem filtrar `pendente`, e é isso que evita um defeito sutil.** Se
   * contasse só as confirmadas, a sequência *importar → aprovar tudo* esvaziaria
   * `extractedData`, a contagem seguiria antiga, e o convite voltaria a dizer "conta vazia"
   * para uma conta com cem transações. Contando tudo, só o **insert** muda o número — e os
   * dois lugares que inserem já recarregam os pendentes, então a contagem vai junto.
   *
   * ⚠️ Falha vira `true`, nunca `null`: sem isto, um erro de rede faria o convite sumir por
   * completo, em vez de aparecer na versão discreta.
   */
  const fetchTemTransacoes = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (error) throw error;
      setTemTransacoes((count ?? 0) > 0);
    } catch (err) {
      console.error("Erro ao contar as transações:", err);
      setTemTransacoes(true);
    }
  };

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

      // ⭐ Só lê. A semente das 28 categorias mora em `semear_conta`, no banco, e roda no
      // cadastro. Semear aqui era escrita dentro de uma leitura: sob StrictMode os dois
      // efeitos viam a lista vazia e semeavam os dois — e `categories` não tinha índice
      // único para barrar o segundo. → L-008, D-053
      setCategories(data ?? []);
    } catch (err) {
      console.error("Erro ao buscar categorias:", err);
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

    // ⭐ `tipo` entra aqui, no único ponto de escrita do lote, e vale para todas as linhas:
    // o instrumento é do documento, não da transação. Ver `tipoDoEnvio`.
    const { error: erroInsert } = await supabase
      .from('transactions')
      .insert(transacoes.map(t => ({ ...t, user_id: user.id, tipo: tipoDoEnvio })));
    if (erroInsert) throw erroInsert;

    await fetchPendentes();
    // A conta deixou de estar vazia: o convite da planilha de exemplo encolhe para um link.
    await fetchTemTransacoes();

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
    // ⚠️ Volta ao padrão junto com o resto. Sem isto, quem acabou de importar uma fatura
    // encontraria "Cartão de crédito" já marcado no próximo envio — e o extrato seguinte
    // entraria inteiro como cartão, em silêncio.
    setTipoDoEnvio('debito');
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
   *
   * ⭐ `tipo` está ausente **de propósito**, e é o caso oposto: o `DEFAULT 'debito'` da coluna
   * já é o que se quer aqui. Quem digita uma linha à mão está registrando algo que saiu da
   * conta; citar o campo seria repetir o default e criar um segundo lugar para mantê-lo.
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
      await fetchTemTransacoes();
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

  /**
   * A lista como ela aparece na tela.
   *
   * ⚠️ **Lista derivada, nunca estado reordenado.** `aprovarTransacao`, `descartarTransacao`,
   * `aprovarTudo`, `reprovarTudo` e `handleUpdateField` fazem update otimista em
   * `extractedData` — se a ordenação virasse `setExtractedData(ordenado)`, cada troca de
   * ordem viraria uma escrita concorrente com esses handlers. Aqui só o `.map()` consome.
   *
   * ⭐ `data` é string `YYYY-MM-DD`, então `localeCompare` já dá ordem cronológica. Não usar
   * `new Date(item.data)`: a string sem hora é interpretada como UTC e desloca o dia em
   * fuso negativo, que é o nosso.
   */
  const rascunhosOrdenados = useMemo(() => {
    const copia = [...extractedData];   // .sort() muta — nunca ordenar extractedData direto
    type ComData = { data?: string | null };
    const porData = (a: ComData, b: ComData) => (a.data || '').localeCompare(b.data || '');

    switch (ordenacao) {
      case 'data_asc':
        return copia.sort(porData);
      case 'banco_asc':
      case 'banco_desc': {
        const sinal = ordenacao === 'banco_asc' ? 1 : -1;
        return copia.sort((a, b) => {
          const ba = (a.banco || '').trim();
          const bb = (b.banco || '').trim();
          // Sem banco vai sempre para o fim, nos DOIS sentidos: importação de planilha
          // grava `banco: null`, e esse bloco encabeçando a lista no Z-A esconderia
          // justamente o que se quis ver ao pedir ordem por banco.
          if (!ba && !bb) return porData(b, a);
          if (!ba) return 1;
          if (!bb) return -1;
          // Banco é texto livre (o check constraint foi derrubado, e o enum de bancos só
          // existe na edge function): `sensitivity: 'base'` mantém "Itaú"/"itau"/"ITAU" juntos.
          const cmp = ba.localeCompare(bb, 'pt-BR', { sensitivity: 'base' });
          return cmp !== 0 ? sinal * cmp : porData(b, a);   // empate: mais recente primeiro
        });
      }
      case 'data_desc':
      default:
        return copia.sort((a, b) => porData(b, a));
    }
  }, [extractedData, ordenacao]);

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
                repositório envelheceria e mostraria histórico morto. Ver src/lib/demo.ts.

                ⭐⭐ O convite tem DOIS pesos, e a conta decide qual. Vazia, ele é o caminho
                mais importante da tela — sem arquivo nenhum, as duas portas acima não levam
                a lugar nenhum. Com histórico, ele volta a ser um link, senão vira ruído
                permanente para quem importa extrato toda semana.

                ⚠️⚠️ Enquanto `temTransacoes` é `null`, mostra-se a versão **discreta**, e não
                nada. A primeira versão disto não renderizava nenhuma das duas, para o link
                não virar caixa sob o cursor — e o comentário afirmava que a espera seria de
                "~100 ms". ⛔ Não é: as cinco funções da montagem começam com
                `supabase.auth.getUser()`, que é uma requisição HTTP **serializada por um lock
                exclusivo**, e a contagem é a quarta da fila. São ~2 s, e nesse tempo o
                elemento mais importante da tela vazia simplesmente não existia. → P38

                ⭐ O discreto é o palpite certo para "não sei": ele é o estado final de quem
                já tem histórico, que é o caso comum — para essa pessoa a tela nunca muda.
                Só a conta vazia vê o link crescer, e ali não há nada abaixo para deslocar. */}
            {temTransacoes === false && (
              <div className="mt-6 w-full max-w-2xl bg-primary/10 border border-primary/25 rounded-2xl p-5 flex items-start gap-3 text-left">
                <FileText size={20} className="text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-text text-sm">Quer ver funcionando antes de usar seu extrato?</p>
                  <p className="text-xs text-text-light mt-1 leading-relaxed">
                    Baixe seis meses de transações de exemplo e importe aqui — dá para ver parcelas,
                    assinaturas e o que sobra no mês sem usar nenhum dado seu.
                  </p>
                  <button
                    type="button"
                    onClick={() => baixarDemonstracao()}
                    className="mt-3 inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium py-2 px-4 rounded-xl shadow-lg shadow-primary/30 transition-all text-xs cursor-pointer"
                  >
                    <Download size={14} /> Baixar planilha de exemplo
                  </button>
                </div>
              </div>
            )}

            {temTransacoes !== false && (
              <button
                type="button"
                onClick={() => baixarDemonstracao()}
                className="mt-5 flex items-center gap-2 text-xs font-medium text-text-light hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
                title="Um .csv com seis meses de transações fictícias, para experimentar a plataforma"
              >
                <Download size={14} /> Baixar planilha de exemplo
              </button>
            )}
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

            {/* ⭐⭐ De onde este dinheiro sai — a pergunta que decide o dia em que a cobrança
                pesa na conta. Fica ACIMA do seletor de arquivo, e não escondido em opções
                avançadas, porque é uma escolha que afeta todas as linhas do lote em silêncio:
                marcar errado põe uma fatura inteira no dia da compra. */}
            <div className="w-full max-w-lg mb-4">
              <p className="text-xs font-semibold text-text-light mb-2 text-left">
                De onde este dinheiro sai?
              </p>
              <div className="flex gap-2">
                {([
                  { valor: 'debito', rotulo: 'Débito em conta', ajuda: 'Extrato. Sai na data da transação.', Icone: Landmark },
                  { valor: 'credito', rotulo: 'Cartão de crédito', ajuda: 'Fatura. Sai no vencimento.', Icone: CreditCard },
                ] as const).map(({ valor, rotulo, ajuda, Icone }) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setTipoDoEnvio(valor)}
                    aria-pressed={tipoDoEnvio === valor}
                    className={`flex-1 flex items-start gap-2 p-3 rounded-xl border text-left transition-all ${tipoDoEnvio === valor
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-white/50 text-text-light hover:border-primary/40'
                      }`}
                  >
                    <Icone size={18} className="mt-0.5 shrink-0" />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">{rotulo}</span>
                      <span className="text-xs opacity-80">{ajuda}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

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
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processando com IA... não saia da tela, pode demorar até 1 minuto.</>
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              {/* Mesmo controle do seletor de ano do Dashboard Anual (glass-input). */}
              <select
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                aria-label="Ordenar rascunhos"
                title="Ordenar rascunhos"
                className="glass-input cursor-pointer font-medium text-sm w-full sm:w-auto"
              >
                <option value="data_desc">Data ↓ (mais recente)</option>
                <option value="data_asc">Data ↑ (mais antiga)</option>
                <option value="banco_asc">Banco (A-Z)</option>
                <option value="banco_desc">Banco (Z-A)</option>
              </select>
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

          {rascunhosOrdenados.map((item) => {
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
