import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Anchor, CreditCard, Layers, Settings2, Check, X, Info, ChevronDown, ChevronUp, Trash2, TrendingDown, TrendingUp, Minus, Undo2, ShoppingCart, ListChecks, AlertTriangle, PlusCircle, CheckCheck, PiggyBank, type LucideIcon } from 'lucide-react';
import {
  agruparParcelas, comprometidoRestante, contaDaCompra, parcelasRestantes, projecaoPorCiclo,
} from '../lib/parcelas';
import ConfirmModal from '../components/ConfirmModal';
import ExemplosDoCompromisso from '../components/ExemplosDoCompromisso';
import {
  detectarPropostas, lancamentosDoFixo, PISO_AUTO, PREFIXO_CORRECAO, type PropostaDeFixo,
} from '../lib/fixos-propostos';
import {
  MINIMO_DE_CICLOS_DE_BASE, ritmoDoCiclo, TETO_EXEMPLOS, valorDoCompromisso, type RitmoDoCiclo,
} from '../lib/compromissos';
import { comprometidoDoCiclo, proximoAlivio } from '../lib/comprometido';
import { cobrancasDoCiclo, type Cobranca } from '../lib/reserva';

/**
 * `/compromissos` — dinheiro que já tem dono antes de você decidir qualquer coisa.
 *
 * ⭐⭐ A fusão de `/fixos` e `/parcelas` numa tela só. O eixo não é o canal — Netflix no
 * cartão ocupa limite — é **quando o compromisso foi assumido**: parcela é dívida
 * contratada, fixo é comportamento observado.
 *
 * ⭐ O painel nunca mostra um total único. Três camadas de certeza, porque somá-las esconde
 * o que dá para cancelar — e é essa distinção que faz o número servir para decidir.
 */
export default function Compromissos() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  // ⭐ As abas têm o nome das três camadas. Cards dizendo "Contratado" sobre abas dizendo
  // "Parcelas" são dois vocabulários para a mesma coisa, e o conceito está no card.
  const [aba, setAba] = useState<Camada>('contratado');

  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [fixos, setFixos] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [exemplos, setExemplos] = useState<any[]>([]);
  const [cicloDia, setCicloDia] = useState(5);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [buscaTransacao, setBuscaTransacao] = useState('');
  const [verRecusados, setVerRecusados] = useState(false);
  const [novo, setNovo] = useState({ nome: '', valor: '', dia: '' });
  const [aceitandoTudo, setAceitandoTudo] = useState(false);
  const [reconhecidos, setReconhecidos] = useState<string[]>([]);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; mensagem: string; onConfirmar: () => void } | null>(null);

  /**
   * ⛔ **A guarda existe por um defeito real, não por precaução.** O aceite automático morava
   * dentro do `carregar()`, e `useEffect` com array vazio roda **duas vezes** sob StrictMode:
   * as duas chamadas liam o mesmo estado, as duas inseriam, e nasciam gastos fixos
   * duplicados — que inflavam o comprometido, não só a lista.
   *
   * ⭐ `carregar()` voltou a só ler, que é o que o nome promete. Escrever é trabalho de quem
   * decide escrever, e uma vez por montagem.
   */
  const jaAceitouSozinho = useRef(false);

  useEffect(() => {
    (async () => {
      await carregar();
      if (jaAceitouSozinho.current) return;
      jaAceitouSozinho.current = true;
      await aceitarAutomaticas();
    })();
  }, []);

  const carregar = async () => {
    setCarregando(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const [mem, tx, fx, tp, ex] = await Promise.all([
        supabase.from('memory').select('ciclo_dia').maybeSingle(),
        // ⛔⛔ O `order` NAO e cosmetico. A regra `valor + dia` **ancora no primeiro
        // elemento do array**: o dia dele vira o centro da tolerancia, e `fixos.nome` e a
        // `assinatura` saem dele. Sem ordem definida, o Postgres devolve o que quiser e a
        // assinatura de um gasto fixo muda entre carregamentos -- e `casarComFixo` compara
        // assinaturas antes de tudo, entao a proposta deixa de casar com o proprio fixo e
        // reaparece duplicada. So aparece quando o nome varia entre as cobrancas. → D-060
        supabase.from('transactions').select('*').eq('pendente', false).order('data'),
        supabase.from('fixos').select('*'),
        supabase.from('compromissos').select('*').order('titulo'),
        supabase.from('compromisso_exemplos').select('id, slug, transaction_id, transactions(data, nome, apelido)'),
      ]);

      setCicloDia(mem.data?.ciclo_dia ?? 1);
      setTransacoes(tx.data ?? []);
      setFixos(fx.data ?? []);
      setTipos(tp.data ?? []);
      setExemplos(ex.data ?? []);
    } catch (err) {
      console.error('Erro ao carregar compromissos:', err);
    } finally {
      setCarregando(false);
    }
  };

  // ⚠️ Detecção é derivada, não guardada: recalcula ao abrir. O que persiste em `fixos` é
  // o que foi decidido — aceito, recusado, encerrado. Mesmo desenho de D-013.
  const propostas = useMemo(
    () => (carregando ? [] : detectarPropostas(transacoes, fixos, cicloDia)),
    [transacoes, fixos, cicloDia, carregando],
  );

  // ⭐ O cálculo mora em src/lib/comprometido.ts, e o Dashboard usa o mesmo. Duas telas
  // calculando o mesmo número por conta própria é o erro da D-007.
  const { contratado, recorrente, previsivel, total, gruposEmAndamento: emAndamento, detectados } =
    useMemo(
      () => comprometidoDoCiclo(transacoes, fixos, tipos, cicloDia),
      [transacoes, fixos, tipos, cicloDia],
    );

  /**
   * O ritmo de cada tipo previsível, por slug.
   *
   * ⛔ **De propósito fora de `comprometidoDoCiclo`.** Aquela função é pura em relação ao
   * relógio, e o Dashboard soma o retorno dela: injetar `hoje` ali faria o total do painel
   * depender da hora em que a tela montou. O ritmo é leitura, não total.
   *
   * ⭐ E deriva de `c.transacoes`, que já saiu da cascata sem parcelas e sem cobranças de
   * fixo. Refazer a conta a partir de `transacoes` cru faria os números discordarem do
   * painel — a D-007 outra vez.
   */
  const ritmos = useMemo(() => {
    const mapa = new Map<string, RitmoDoCiclo | null>();
    for (const c of detectados) mapa.set(c.slug, ritmoDoCiclo(c.transacoes, cicloDia));
    return mapa;
  }, [detectados, cicloDia]);

  /**
   * As compras já quitadas.
   *
   * ⚠️ **Não entram em nenhum total** — parcela paga é histórico, não compromisso. Por isso
   * `comprometidoDoCiclo` não as devolve, e por isso elas são derivadas só aqui: as em
   * andamento continuam vindo de lá (`emAndamento`), com um dono só.
   */
  const concluidas = useMemo(
    () => agruparParcelas(transacoes).filter(g => contaDaCompra(g).concluida),
    [transacoes],
  );

  const restante = useMemo(() => comprometidoRestante(emAndamento), [emAndamento]);
  const faltamParcelas = useMemo(() => parcelasRestantes(emAndamento), [emAndamento]);
  const projecao = useMemo(() => projecaoPorCiclo(emAndamento, cicloDia, 6), [emAndamento, cicloDia]);

  const alivio = useMemo(
    () => proximoAlivio(emAndamento, recorrente + previsivel, cicloDia),
    [emAndamento, recorrente, previsivel, cicloDia],
  );

  const fixosAtivos = fixos.filter(f => f.status === 'ativo');

  /**
   * ⭐ O aviso de silêncio mora no card do fixo que parou, não numa lista à parte.
   *
   * Como mais uma linha em "Propostas", ele ficava longe do gasto de que fala — e a pergunta
   * que ele levanta ("ainda pago isto?") só se responde olhando o próprio gasto.
   */
  const encerramentos = useMemo(() => {
    const porFixo = new Map<string, PropostaDeFixo>();
    for (const p of propostas) if (p.natureza === 'encerrar' && p.fixoId) porFixo.set(p.fixoId, p);
    return porFixo;
  }, [propostas]);

  /**
   * ⭐ O quanto e o quando. O painel diz o que você deve por mês; isto diz o que ainda vai
   * sair até o fim do ciclo — que é a parte que decide se você pode gastar hoje.
   *
   * ⛔⛔ **Fixo com proposta de encerramento fica de fora**, e não é detalhe: sem este filtro
   * as duas funções liam o MESMO histórico e chegavam a conclusões opostas no mesmo card —
   * "cai dia 18" ao lado de "sem cobrança há 3 ciclos". Pior: os R$ 89,90 dele entravam no
   * total a reservar, ou seja, a tela pedia que você guardasse dinheiro para uma cobrança que
   * ela própria acabara de dizer que sumiu.
   *
   * ⭐ A regra mora aqui, no chamador, porque ela **compõe** dois resultados de domínio que
   * não se conhecem. ⛔ Recalcular o silêncio dentro de `reserva.ts` criaria um segundo dono
   * do critério — que é exatamente o defeito da D-007.
   *
   * ⚠️ Só se manifestava com fixo **mensal**: um não mensal silencioso já era barrado pela
   * igualdade estrita de `cobrancasDoCiclo`, e caía num texto neutro.
   */
  const reserva = useMemo(
    () => cobrancasDoCiclo(
      fixosAtivos.filter(f => !encerramentos.has(f.id)),
      transacoes,
      cicloDia,
    ),
    [fixos, transacoes, cicloDia, encerramentos],
  );

  /** O estado de cada fixo neste ciclo, para o card dizer "cai dia N" ou "já caiu". */
  const estadoDoFixo = useMemo(() => {
    const mapa = new Map<string, { data: string; jaCaiu: boolean }>();
    for (const c of reserva.jaCairam) mapa.set(c.fixo.id, { data: c.data, jaCaiu: true });
    for (const c of reserva.pendentes) mapa.set(c.fixo.id, { data: c.data, jaCaiu: false });
    return mapa;
  }, [reserva]);
  /**
   * O que foi dispensado — recusado **ou** encerrado.
   *
   * ⚠️ Encerrado entra aqui porque agora ele suprime a redetecção. Sem aparecer nesta seção,
   * encerrar um gasto fixo seria irreversível **e** invisível: ele sumiria dos ativos e nada
   * na tela diria que ele existiu.
   */
  const dispensados = fixos.filter(f => f.status === 'recusado' || f.status === 'encerrado');

  const propostasAbertas = useMemo(
    () => propostas.filter(p => p.natureza !== 'encerrar'),
    [propostas],
  );

  /**
   * Aplica uma proposta, sem recarregar.
   *
   * ⭐ Separada do handler para que "aceitar tudo" recarregue **uma vez** no fim, em vez de
   * uma vez por proposta.
   */
  const aplicarProposta = async (p: PropostaDeFixo, userId: string) => {
    if (p.natureza === 'corrigir' && p.fixoId) {
      await supabase.from('fixos').update({ valor: p.valor, dia: p.dia }).eq('id', p.fixoId);
    } else if (p.natureza === 'encerrar' && p.fixoId) {
      await supabase.from('fixos').update({ status: 'encerrado' }).eq('id', p.fixoId);
    } else {
      await supabase.from('fixos').insert([{
        user_id: userId, nome: p.nome, valor: p.valor, dia: p.dia,
        periodicidade_meses: p.periodicidade_meses, origem: p.origem,
        status: 'ativo', assinatura: p.assinatura,
        evidencia: p.evidencia.map((t: any) => ({ id: t.id, data: t.data, nome: t.nome, valor: t.valor })),
      }]);
    }
  };

  const aceitarProposta = async (p: PropostaDeFixo) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    await aplicarProposta(p, user.id);
    await carregar();
  };

  /**
   * Aceita todas as propostas abertas de uma vez.
   *
   * ⭐ Existe porque a primeira importação de um histórico longo produz dezenas de propostas
   * verdadeiras, e revisar uma a uma faz a pessoa desistir no meio — deixando o comprometido
   * pela metade, que é pior do que não ter começado.
   *
   * ⚠️ **Só o que está na lista**, ou seja, `criar` e `corrigir`. Encerramento fica de fora
   * de propósito: ele mora no card do fixo e desligar um gasto por engano é o erro caro.
   *
   * ⚠️ Sequencial, não `Promise.all`: duas propostas podem tocar o mesmo `fixos`, e a ordem
   * importa. São poucas dezenas de linhas, então o ganho de paralelizar não paga o risco.
   */
  const aceitarTodas = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    setAceitandoTudo(true);
    try {
      for (const p of propostasAbertas) await aplicarProposta(p, user.id);
      await carregar();
    } finally {
      setAceitandoTudo(false);
    }
  };

  /**
   * ⭐ Recusar é para sempre, e as assinaturas de criação e correção são separadas: fossem a
   * mesma, recusar a correção mataria também a proposta de criação.
   */
  const recusarProposta = async (p: PropostaDeFixo) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const prefixo = p.natureza === 'corrigir' ? PREFIXO_CORRECAO : '';
    await supabase.from('fixos').insert([{
      user_id: user.id, nome: p.nome, valor: p.valor, dia: p.dia,
      periodicidade_meses: p.periodicidade_meses, origem: p.origem,
      status: 'recusado', assinatura: prefixo + p.assinatura,
    }]);
    await carregar();
  };

  /**
   * Põe uma transação num compromisso à mão.
   *
   * ⭐ Sem isto o usuário só consegue tirar, nunca corrigir para mais — e a IA errar para
   * menos é o caso mais comum: ela não rotula o que não reconhece.
   *
   * ⚠️ `compromisso_manual` marca a decisão como declarada, e é o que a faz vencer a
   * detecção automática na importação seguinte.
   */
  const acrescentarAoCompromisso = async (transacaoId: string, slug: string) => {
    await supabase
      .from('transactions')
      .update({ compromisso: slug, compromisso_manual: true })
      .eq('id', transacaoId);
    setBuscaTransacao('');
    await carregar();
  };

  /** ⚠️ Marca `compromisso_manual`: a detecção não pode devolver o que o usuário tirou. */
  const removerDoCompromisso = async (transacaoId: string) => {
    await supabase
      .from('transactions')
      .update({ compromisso: null, compromisso_manual: true })
      .eq('id', transacaoId);
    await carregar();
  };

  /**
   * Desfaz uma recusa.
   *
   * ⭐ Recusar é permanente **por decisão**, não por falta de saída. A assinatura some e a
   * proposta volta na próxima carga — porque a detecção é derivada, e o que a segurava era
   * exatamente esta linha.
   *
   * ⚠️ Criação e correção têm assinaturas separadas de propósito: desfazer uma não
   * ressuscita a outra.
   */
  const desfazerRecusa = async (id: string) => {
    await supabase.from('fixos').delete().eq('id', id);
    await carregar();
  };

  /** ⚠️ Some com a compra inteira, parcela por parcela. Por isso passa pela confirmação. */
  const excluirGrupo = (grupo: any[]) => {
    const nome = grupo[0].apelido || grupo[0].nome;
    setConfirmacao({
      titulo: 'Excluir parcelas',
      mensagem: `Excluir TODAS as ${grupo.length} parcelas de "${nome}"?`,
      onConfirmar: async () => {
        await supabase.from('transactions').delete().in('id', grupo.map((t: any) => t.id));
        setConfirmacao(null);
        await carregar();
      },
    });
  };

  /**
   * Cadastro manual de gasto fixo.
   *
   * ⭐ **O nome tem de ser o do extrato**, não um apelido — é por ele que o fixo encontra os
   * próprios lançamentos e, por consequência, os retira da camada Previsível. "Netflix"
   * digitado não casa com "NETFLIX.COM": o fixo existiria sem nunca achar uma cobrança, e o
   * comprometido contaria o valor duas vezes, uma pelo fixo e outra pelo rótulo.
   *
   * ⚠️ Dia é opcional de propósito: "gasto uns R$ 300 no mercado" é cadastro legítimo, e
   * obrigar o dia expulsaria esse caso.
   */
  const adicionarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = parseFloat(novo.valor.replace(',', '.'));
    if (!novo.nome.trim() || isNaN(valor)) return;

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    await supabase.from('fixos').insert([{
      user_id: user.id, nome: novo.nome.trim(), valor,
      dia: novo.dia ? parseInt(novo.dia) : null,
      origem: 'manual', status: 'ativo', periodicidade_meses: 1,
    }]);
    setNovo({ nome: '', valor: '', dia: '' });
    await carregar();
  };

  /**
   * Exclui um gasto fixo.
   *
   * ⛔ **Excluir um fixo detectado registra uma recusa**, e não é zelo: sem isso a detecção
   * o recria na carga seguinte — como proposta antes, e agora, com o aceite automático, como
   * fixo ativo. Excluir viraria um botão que não faz nada.
   *
   * ⚠️ Fixo manual não tem assinatura, então some de vez. É o que se espera de algo que você
   * mesmo digitou.
   *
   * ⭐ E a recusa é desfazível, na seção recolhida no fim desta aba.
   */
  /**
   * Aceita sozinha a criação que já se repetiu `PISO_AUTO` vezes.
   *
   * ⚠️ Converge porque o fixo nasce com exatamente o valor e o dia da proposta — na volta,
   * `casarComFixo` acha e o ramo "casa e concorda" não propõe nada.
   *
   * ⛔ Recusa continua valendo: `detectarPropostas` tira as assinaturas recusadas antes de
   * chegar aqui, então o que você dispensou não volta por esta porta.
   *
   * ⚠️ `upsert` com `ignoreDuplicates`, e não `insert`: se duas chamadas se cruzarem, a
   * segunda não cria linha nem estoura erro na cara do usuário. O índice único
   * `fixos_assinatura_unica` é quem garante isso do lado do banco.
   */
  const aceitarAutomaticas = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const [tx, fx, mem] = await Promise.all([
      supabase.from('transactions').select('*').eq('pendente', false),
      supabase.from('fixos').select('*'),
      supabase.from('memory').select('ciclo_dia').maybeSingle(),
    ]);

    const automaticas = detectarPropostas(tx.data ?? [], fx.data ?? [], mem.data?.ciclo_dia ?? 1)
      .filter(p => p.natureza === 'criar' && p.evidencia.length >= PISO_AUTO);
    if (automaticas.length === 0) return;

    // ⚠️ `.select()` devolve **só as linhas realmente inseridas** — com `ignoreDuplicates`, o
    // que o índice único barrou não vem. É o que faz o aviso dizer o que entrou, e não o que
    // se tentou: antes ele anunciava a intenção e reaparecia a cada F5, mesmo sem criar nada.
    const { data: criados, error } = await supabase.from('fixos').upsert(
      automaticas.map(p => ({
        user_id: user.id, nome: p.nome, valor: p.valor, dia: p.dia,
        periodicidade_meses: p.periodicidade_meses, origem: p.origem,
        status: 'ativo', assinatura: p.assinatura,
        evidencia: p.evidencia.map((t: any) => ({ id: t.id, data: t.data, nome: t.nome, valor: t.valor })),
      })),
      { onConflict: 'user_id,assinatura', ignoreDuplicates: true },
    ).select('nome');
    if (error) { console.error('Aceite automático falhou:', error); return; }
    if (!criados || criados.length === 0) return;

    // ⚠️ Nada aparece em silêncio: o aviso diz o que entrou sem você pedir.
    setReconhecidos(criados.map(f => f.nome));
    await carregar();
  };

  const excluirFixo = async (id: string) => {
    const fixo = fixos.find(f => f.id === id);
    if (fixo?.assinatura) {
      await supabase.from('fixos').update({ status: 'recusado' }).eq('id', id);
    } else {
      await supabase.from('fixos').delete().eq('id', id);
    }
    await carregar();
  };

  /**
   * Aceitar um compromisso previsível: fixa o valor e guarda as transações como exemplo.
   *
   * ⭐⭐ **É o laço que fecha o aprendizado.** Você confirmou que aquelas transações são
   * daquele tipo; o agente que classifica compromisso passa a receber os nomes delas no
   * prompt. Sem isso, você ensinaria a mesma coisa a cada importação.
   *
   * ⚠️ Falha ao gravar exemplo não desfaz o valor fixado: o número é a decisão que o
   * usuário tomou, e o exemplo é otimização em cima dela. O teto de 10 e a unicidade são do
   * banco, então tentar de novo o que já existe simplesmente não passa — e está certo.
   */
  const fixarValor = async (slug: string, valor: number, transacoes?: any[]) => {
    const user = (await supabase.auth.getUser()).data.user;
    await supabase.from('compromissos').update({ valor_mensal: valor, status: 'aceito' }).eq('slug', slug);

    if (user && transacoes?.length) {
      const jaTem = new Set(
        exemplos.filter(e => e.slug === slug).map(e => e.transaction_id),
      );
      const novos = transacoes
        .filter(t => !jaTem.has(t.id))
        .slice(0, Math.max(0, TETO_EXEMPLOS - jaTem.size))
        .map(t => ({ user_id: user.id, slug, transaction_id: t.id }));

      if (novos.length > 0) {
        // ⚠️ O trigger marca estas como `compromisso_manual`. Aqui isso é no-op de rótulo
        // (elas já têm o slug, foi por ele que foram detectadas), mas passa a protegê-las
        // de a IA mudar de ideia na importação seguinte — que é o certo: você aceitou.
        const { error } = await supabase.from('compromisso_exemplos').insert(novos);
        if (error) console.error('Exemplos não gravados; o valor fixado continua valendo:', error);
      }
    }
    await carregar();
  };

  const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  if (carregando) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {confirmacao && (
        <ConfirmModal
          title={confirmacao.titulo}
          message={confirmacao.mensagem}
          onConfirm={confirmacao.onConfirmar}
          onCancel={() => setConfirmacao(null)}
        />
      )}

      <header>
        <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
          <Layers size={32} className="text-primary" /> Compromissos
        </h2>
        <p className="text-text-light mt-1">
          Quanto do seu dinheiro já tem dono antes de você decidir qualquer coisa.
        </p>
      </header>

      {/* ⭐ A resposta da tela, sozinha na própria caixa. Dividir a linha com o rótulo à
          esquerda e o número à direita fazia dele mais um item de cabeçalho. */}
      <div className="glass-panel p-8 text-center">
        <span className="text-text-light text-sm uppercase font-bold tracking-wider">
          Comprometido por mês
        </span>
        <div className="text-5xl font-bold text-text mt-2">{brl(total)}</div>

        {/* ⭐ A frase que só existe porque parcela tem fim conhecido — e a razão de as duas
            telas terem virado uma. Para assinatura não dá para dizer nada: pode durar
            para sempre. */}
        {alivio && (
          <div className="mt-4 inline-flex items-start gap-2 text-sm bg-[#10b981]/5 rounded-xl p-3 text-left">
            <TrendingDown size={16} className="text-[#10b981] shrink-0 mt-0.5" />
            <span className="text-text-light">
              A partir de <strong className="text-text">{alivio.rotulo}</strong>, cai para{' '}
              <strong className="text-text">{brl(alivio.valor)}</strong> — são{' '}
              {brl(alivio.diferenca)} a menos por mês, quando as parcelas acabam.
            </span>
          </div>
        )}
      </div>

      {/* ⭐⭐ O painel decomposto: um total só esconderia o que dá para cancelar.
          ⭐ E o card É o botão da aba — três cards e, logo abaixo, três abas repetindo os
          mesmos nomes seria o mesmo controle duas vezes. */}
      <div className="glass-panel p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CardCamada
            id="contratado"
            titulo="Contratado"
            valor={brl(contratado)}
            nota="Parcelas. Você deve, e tem data de fim"
            cor="text-danger"
            icone={CreditCard}
            ativo={aba === 'contratado'}
            onClick={() => setAba('contratado')}
          />
          <CardCamada
            id="recorrente"
            titulo="Recorrente"
            valor={brl(recorrente)}
            nota="Dia e valor previsíveis. Dá para cancelar"
            cor="text-azul"
            icone={Anchor}
            ativo={aba === 'recorrente'}
            onClick={() => setAba('recorrente')}
          />
          <CardCamada
            id="previsivel"
            titulo="Previsível"
            valor={brl(previsivel)}
            nota="Mercado, combustível. Você vai gastar"
            cor="text-[#10b981]"
            icone={ShoppingCart}
            ativo={aba === 'previsivel'}
            onClick={() => setAba('previsivel')}
          />
        </div>
      </div>

      {aba === 'recorrente' && (
        <div className="space-y-6">
          {/* ⚠️ Aceite automático é conveniência, não segredo. Quem não souber o que entrou
              não confia no total — e o total é a tese. */}
          {reconhecidos.length > 0 && (
            <div className="glass-panel p-4 flex items-start gap-3 border-l-4 border-primary">
              <CheckCheck size={18} className="text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text">
                  {reconhecidos.length === 1
                    ? '1 gasto fixo foi reconhecido automaticamente'
                    : `${reconhecidos.length} gastos fixos foram reconhecidos automaticamente`}
                </div>
                <div className="text-xs text-text-light mt-0.5">
                  {reconhecidos.join(' · ')} — apareceram {PISO_AUTO} vezes ou mais. Exclua
                  qualquer um se não fizer sentido.
                </div>
              </div>
              <button
                onClick={() => setReconhecidos([])}
                className="text-text-light hover:text-text p-1 shrink-0"
                title="Entendi"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* ⭐⭐ A frase que faltava: quanto deixar na conta, e por causa de quê. Um total
              sozinho não muda comportamento; a data e o nome mudam.
              ⛔ Some quando não há nada a reservar — "Reserve R$ 0,00" é ruído, e um aviso
              que aparece sempre deixa de ser aviso. */}
          {reserva.pendentes.length > 0 && (
            <div className="glass-panel p-5 border-l-4 border-primary">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary p-2 rounded-lg shrink-0">
                  <PiggyBank size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold text-text-light tracking-wider">
                    Deixe reservado
                  </div>
                  <div className="text-3xl font-bold text-text">{brl(reserva.aReservar)}</div>
                  <div className="text-xs text-text-light mt-0.5">
                    até {diaEMes(reserva.fimDoCiclo)}, para as cobranças que ainda faltam
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-1 border-t border-border pt-3">
                {reserva.pendentes.map(c => (
                  <LinhaDeCobranca key={c.fixo.id} c={c} brl={brl} />
                ))}
              </div>
            </div>
          )}

          <section className="space-y-3">
            <h3 className="font-bold text-text">Ativos</h3>
            {fixosAtivos.length === 0 ? (
              /* ⭐ A promessa continua sendo a detecção: o formulário abaixo é a exceção,
                 para quem não quer esperar. */
              <div className="glass-panel p-8 text-center text-text-light">
                Nada por aqui ainda — seus gastos fixos são importados{' '}
                <strong className="text-primary">automaticamente</strong>.
              </div>
            ) : (
              fixosAtivos.map(f => (
                <FixoAtivo
                  key={f.id}
                  f={f}
                  brl={brl}
                  lancamentos={lancamentosDoFixo(f, transacoes)}
                  estado={estadoDoFixo.get(f.id) ?? null}
                  encerramento={encerramentos.get(f.id) ?? null}
                  onExcluir={() => excluirFixo(f.id)}
                  onEncerrar={() => aceitarProposta(encerramentos.get(f.id)!)}
                />
              ))
            )}

            {/* ⚠️ O nome é a chave: é por ele que o fixo encontra os próprios lançamentos.
                Por isso o campo pede o nome do extrato e o rótulo insiste nisso — apelido
                cria um fixo que nunca casa com nada. */}
            <form onSubmit={adicionarManual} className="glass-panel p-4 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  value={novo.nome}
                  onChange={e => setNovo({ ...novo, nome: e.target.value })}
                  placeholder="Nome exato do extrato (ex: NETFLIX.COM)"
                  className="glass-input p-2 text-sm bg-white flex-1 min-w-[200px]"
                />
                <input
                  value={novo.valor}
                  onChange={e => setNovo({ ...novo, valor: e.target.value })}
                  placeholder="Valor" inputMode="decimal"
                  className="glass-input p-2 text-sm bg-white w-28"
                />
                <input
                  value={novo.dia}
                  onChange={e => setNovo({ ...novo, dia: e.target.value })}
                  placeholder="Dia (opcional)" type="number" min={1} max={31}
                  className="glass-input p-2 text-sm bg-white w-32"
                  title="Opcional: 'gasto uns R$ 300 no mercado' é cadastro legítimo"
                />
                <button
                  type="submit"
                  className="bg-primary text-white px-4 rounded-xl hover:bg-primary-hover transition-colors"
                  title="Acrescentar"
                >
                  <PlusCircle size={18} />
                </button>
              </div>
              <p className="text-[11px] text-text-light/80">
                ⚠️ Escreva o nome <strong>exatamente como aparece no extrato</strong> — é por ele
                que o gasto encontra as próprias cobranças. Um apelido cria um fixo que nunca
                casa com nada.
              </p>
            </form>
          </section>

          {propostasAbertas.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h3 className="font-bold text-text">Propostas</h3>
                {/* ⚠️ Discreto de propósito: aceitar em massa é atalho para quem já confia na
                    detecção, não o caminho recomendado. Cada proposta continua trazendo a
                    própria evidência logo abaixo. */}
                <button
                  onClick={aceitarTodas}
                  disabled={aceitandoTudo}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCheck size={14} />
                  {aceitandoTudo
                    ? 'Aceitando...'
                    : `Aceitar ${propostasAbertas.length > 1 ? `as ${propostasAbertas.length}` : 'a'}`}
                </button>
              </div>
              {propostasAbertas.map((p, i) => (
                <Proposta
                  key={`${p.assinatura}-${i}`}
                  p={p}
                  brl={brl}
                  onAceitar={() => aceitarProposta(p)}
                  onRecusar={() => recusarProposta(p)}
                />
              ))}
            </section>
          )}

          {dispensados.length > 0 && (
            <section>
              {/* ⚠️ Discreto de propósito: dispensar é decisão que o usuário quer esquecer.
                  Mas precisa ser encontrável, senão "para sempre" vira "sem saída". */}
              <button
                onClick={() => setVerRecusados(v => !v)}
                className="flex items-center gap-2 text-sm text-text-light hover:text-text transition-colors"
              >
                {verRecusados ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {dispensados.length} dispensado{dispensados.length > 1 ? 's' : ''}
              </button>

              {verRecusados && (
                <div className="mt-3 space-y-2">
                  {dispensados.map(f => {
                    const eraCorrecao = String(f.assinatura ?? '').startsWith(PREFIXO_CORRECAO);
                    const motivo = f.status === 'encerrado'
                      ? 'Encerrado por você'
                      : eraCorrecao ? 'Correção recusada' : 'Não é um gasto fixo';
                    return (
                      <div key={f.id} className="glass-panel p-3 flex items-center justify-between gap-3 opacity-70 hover:opacity-100 transition-opacity">
                        <div className="min-w-0">
                          <span className="text-sm text-text truncate">{f.nome}</span>
                          <div className="text-[11px] text-text-light">
                            {motivo}
                            {' · '}{brl(Number(f.valor))}
                          </div>
                        </div>
                        <button
                          onClick={() => desfazerRecusa(f.id)}
                          className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors shrink-0"
                          title="A proposta volta a aparecer"
                        >
                          <Undo2 size={14} /> Desfazer
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {aba === 'previsivel' && (
        <section className="space-y-3">
          {/* ⚠️ A lista de tipos só governa esta aba. No cabeçalho, o botão valia para as três
              e sugeria configurar coisas que ele não configura.
              ⭐ Navegação, não modal: a configuração mora no /perfil (D-029). */}
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h3 className="font-bold text-text">Previsíveis</h3>
            <button
              onClick={() => navigate('/perfil')}
              className="glass-input flex items-center gap-2 px-4 py-2 text-sm font-medium hover:text-primary transition-colors"
            >
              <Settings2 size={16} /> Editar lista de compromissos
            </button>
          </div>
          {detectados.length === 0 ? (
            <div className="glass-panel p-8 text-center text-text-light">
              Nada por aqui ainda — importe mais extratos e a IA reconhece seus gastos
              previsíveis <strong className="text-primary">automaticamente</strong>.
            </div>
          ) : (
            detectados.map(c => (
              <div key={c.slug} className="glass-panel p-4">
                <button
                  onClick={() => setExpandido(expandido === c.slug ? null : c.slug)}
                  className="w-full flex items-center justify-between gap-4"
                >
                  <div className="text-left">
                    <span className="font-medium text-text">{c.titulo}</span>
                    <div className="text-xs text-text-light">
                      {c.transacoes.length} lançamentos em {c.ciclos} ciclo(s)
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-bold text-text">{brl(valorDoCompromisso(c))}/mês</div>
                      {c.valorFixado == null && (
                        <div className="text-[10px] text-text-light">média observada</div>
                      )}
                    </div>
                    {expandido === c.slug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {/* ⚠️ Fora do cabeçalho porque ele é um <button> inteiro, e botão dentro de
                    botão é HTML inválido. Aqui o ícone fica visível com o card fechado, que
                    é o ponto. */}
                <ExemplosDoCompromisso
                  exemplos={exemplos.filter(e => e.slug === c.slug)}
                  className="mt-2"
                />

                {/* ⭐⭐ Onde você está AGORA. O resto do card é o passado: quanto custa por mês,
                    quantos lançamentos, qual valor você fixou. Esta linha é a única que responde
                    "e este ciclo, vai bem?" — que é a pergunta que ainda dá para agir sobre. */}
                <Ritmo ritmo={ritmos.get(c.slug) ?? null} brl={brl} />

                {/* ⭐ Avisa, não age: valor que persegue a própria média nunca discorda de você. */}
                {c.divergente && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-text-light bg-primary/5 rounded-lg p-3">
                    <Info size={14} className="text-primary shrink-0 mt-0.5" />
                    <span>
                      Os lançamentos recentes dão {brl(c.amortizadoObservado)}/mês, e você fixou{' '}
                      {brl(c.valorFixado!)}.{' '}
                      <button
                        onClick={() => fixarValor(c.slug, c.amortizadoObservado, c.transacoes)}
                        className="text-primary font-medium underline"
                      >
                        Atualizar
                      </button>
                    </span>
                  </div>
                )}

                {expandido === c.slug && (
                  <div className="mt-4 space-y-1 border-t border-border pt-3">
                    {c.valorFixado == null && (
                      <button
                        onClick={() => fixarValor(c.slug, c.amortizadoObservado, c.transacoes)}
                        className="text-xs text-primary font-medium mb-2"
                      >
                        Fixar {brl(c.amortizadoObservado)}/mês
                      </button>
                    )}
                    {c.transacoes.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between text-xs py-1">
                        <span className="text-text-light truncate">
                          {t.data} · {t.apelido || t.nome}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-text">{brl(Math.abs(Number(t.valor)))}</span>
                          <button
                            onClick={() => removerDoCompromisso(t.id)}
                            className="text-text-light hover:text-danger p-1"
                            title="Tirar deste compromisso"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* ⭐ Acrescentar existe porque a IA erra mais para menos que para
                        mais: ela não rotula o que não reconhece. */}
                    <div className="pt-2 mt-2 border-t border-border">
                      <input
                        value={buscaTransacao}
                        onChange={e => setBuscaTransacao(e.target.value)}
                        placeholder="Buscar transação para acrescentar..."
                        className="glass-input w-full p-2 text-xs bg-white"
                      />
                      {buscaTransacao.trim().length >= 2 && (
                        <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                          {transacoes
                            .filter(t =>
                              Number(t.valor) < 0 &&
                              t.compromisso !== c.slug &&
                              `${t.nome} ${t.apelido ?? ''}`.toLowerCase()
                                .includes(buscaTransacao.toLowerCase().trim()))
                            .slice(0, 8)
                            .map((t: any) => (
                              <button
                                key={t.id}
                                onClick={() => acrescentarAoCompromisso(t.id, c.slug)}
                                className="w-full flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-primary/10 transition-colors"
                              >
                                <span className="text-text-light truncate">
                                  {t.data} · {t.apelido || t.nome}
                                </span>
                                <span className="text-text shrink-0 ml-2">
                                  {brl(Math.abs(Number(t.valor)))}
                                </span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {aba === 'contratado' && (
        <div className="space-y-6">
          {/* ⚠️ Dois números grandes na mesma tela parecem contradição, e não são: o card do
              topo diz quanto sai POR MÊS, este diz o TOTAL que ainda falta pagar. */}
          {emAndamento.length > 0 && (
            <div className="glass-panel p-6">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-light font-bold">
                    Comprometido restante
                  </p>
                  <p className="text-4xl font-bold text-danger mt-1">{brl(restante)}</p>
                  <p className="text-sm text-text-light mt-1">
                    {faltamParcelas} parcela{faltamParcelas === 1 ? '' : 's'} a vencer em{' '}
                    {emAndamento.length} compra{emAndamento.length === 1 ? '' : 's'}
                  </p>
                </div>

                {projecao.length > 0 && (
                  <div className="flex-1 min-w-[280px]">
                    <p className="text-xs uppercase tracking-wider text-text-light font-bold mb-2">
                      Saída por ciclo
                    </p>
                    <div className="flex items-end gap-3 flex-wrap">
                      {projecao.map(c => (
                        <div key={c.cicloKey} className="text-center">
                          <div className="text-[11px] text-text-light">{c.rotulo}</div>
                          <div className="text-sm font-bold text-text">{brl(c.valor)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {emAndamento.length === 0 && concluidas.length === 0 ? (
            <div className="glass-panel p-12 text-center text-text-light">
              Você não possui nenhuma compra parcelada registrada.
            </div>
          ) : (
            <>
              <section>
                <h3 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                  <CreditCard size={20} className="text-primary" /> Em andamento
                </h3>
                {emAndamento.length === 0 ? (
                  <div className="glass-panel p-8 text-center text-text-light bg-white/20">
                    Nenhuma compra parcelada em andamento.
                  </div>
                ) : (
                  <Colunas
                    itens={emAndamento}
                    render={g => (
                      <CardParcelas
                        key={g[0].id}
                        grupo={g}
                        brl={brl}
                        aberto={grupoAberto === g[0].id}
                        onAlternar={() => setGrupoAberto(grupoAberto === g[0].id ? null : g[0].id)}
                        onExcluir={() => excluirGrupo(g)}
                      />
                    )}
                  />
                )}
              </section>

              {concluidas.length > 0 && (
                <section>
                  <h3 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                    <Check size={20} className="text-[#10b981]" /> Quitadas
                  </h3>
                  <Colunas
                    itens={concluidas}
                    render={g => (
                      <CardParcelas
                        key={g[0].id}
                        grupo={g}
                        brl={brl}
                        aberto={grupoAberto === g[0].id}
                        onAlternar={() => setGrupoAberto(grupoAberto === g[0].id ? null : g[0].id)}
                        onExcluir={() => excluirGrupo(g)}
                      />
                    )}
                  />
                </section>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}

/** As três camadas de certeza. ⭐ Também são as abas: o nome do conceito é um só. */
type Camada = 'contratado' | 'recorrente' | 'previsivel';

function CardCamada({ titulo, valor, nota, cor, icone: Icone, ativo, onClick }: {
  id: Camada; titulo: string; valor: string; nota: string; cor: string;
  icone: LucideIcon; ativo: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-4 transition-all ${
        ativo
          ? 'bg-white ring-2 ring-primary shadow-md'
          : 'bg-white/50 hover:bg-white/80'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-text-light tracking-wider">
        <Icone size={12} /> {titulo}
      </div>
      <div className={`text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
      <div className="text-[10px] text-text-light mt-1">{nota}</div>
    </button>
  );
}

const ROTULO_NATUREZA: Record<string, string> = {
  criar: 'Parece um gasto fixo novo',
  corrigir: 'O valor mudou',
  encerrar: 'Não vejo isto há um tempo',
};

/**
 * A lista de lançamentos que sustenta um gasto fixo — na proposta e no ativo.
 *
 * ⭐ Compartilhada de propósito. Antes a evidência existia só na proposta pendente: aceita,
 * o "por que isto virou um fixo" sumia da tela. E a lista aqui é **derivada na hora**, não a
 * cópia guardada em `fixos.evidencia` — cobranças novas aparecem sozinhas, sem escrita
 * nenhuma no banco. É a D-013: não guarde o que dá para derivar.
 */
function Lancamentos({ itens, brl, rotulo }: {
  itens: any[]; brl: (v: number) => string; rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  if (itens.length === 0) {
    return (
      <div className="text-[11px] text-text-light/70 mt-1">
        Sem lançamentos vinculados
      </div>
    );
  }
  return (
    <>
      <button onClick={() => setAberto(v => !v)} className="text-[11px] text-primary mt-1">
        {aberto ? 'ocultar' : 'ver'} {rotulo ?? 'os'} {itens.length} lançamentos
      </button>
      {aberto && (
        <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
          {itens.map((t: any) => (
            <div key={t.id} className="text-[11px] text-text-light">
              {t.data} · {t.nome} · {brl(Math.abs(Number(t.valor)))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Um gasto fixo ativo, com os lançamentos que o sustentam e o aviso de silêncio. */
/** `2026-02-05` → `5 de fevereiro`. */
/**
 * O gasto do ciclo corrente contra o normal para o mesmo ponto do ciclo.
 *
 * ⭐ **Verde para baixo, vermelho para cima.** Aqui gastar menos é boa notícia, e o projeto já
 * usa `TrendingDown` em verde com esse sentido no aviso de alívio das parcelas. ⚠️ No Dashboard
 * os mesmos dois ícones querem dizer *entrada* e *saída*, não tendência — não é de lá que este
 * uso vem.
 *
 * ⭐ **Linha, e não painel.** O aviso de divergência logo abaixo é um `bg-primary/5` e responde
 * outra pergunta: observado contra o valor que você fixou. Dois blocos iguais empilhados
 * leriam como contradição, quando na verdade são dois recortes diferentes.
 *
 * ⚠️ **Sem base, a linha fala mesmo assim.** Silêncio ficaria ambíguo entre "está normal" e
 * "ainda não sei", e as duas coisas pedem reações opostas.
 */
function Ritmo({ ritmo, brl }: { ritmo: RitmoDoCiclo | null; brl: (v: number) => string }) {
  if (!ritmo) {
    return (
      <div className="mt-2 text-[10px] text-text-light/70">
        Comparação de ritmo a partir de {MINIMO_DE_CICLOS_DE_BASE} ciclos fechados.
      </div>
    );
  }

  const { diferenca, emLinha, diaDoCiclo, diasDoCiclo, gastoAtual, referencia, ciclosDeBase } = ritmo;
  const acima = diferenca > 0;
  const Icone = emLinha ? Minus : acima ? TrendingUp : TrendingDown;
  const cor = emLinha ? 'text-text-light' : acima ? 'text-danger' : 'text-[#10b981]';

  /**
   * ⭐⭐ **Quanto ainda dá para corrigir** — e não em que dia do ciclo estamos.
   *
   * "R$ 120 acima do normal, faltam 22 dias" e "R$ 120 acima do normal, falta 1 dia" pedem
   * reações opostas, e é esta metade da frase que decide qual. O ordinal carrega a mesma
   * informação escondida atrás de uma subtração — e escrita de um jeito que **parece errado**
   * justamente onde a régua confunde: com `ciclo_dia = 1`, o ciclo de agosto vai de 02/08 a
   * 01/09, então no dia 31/08 o card dizia "dia 30 de 31".
   *
   * ⚠️ O plural é tratado: "faltam 1 dia" faria desconfiar do número ao lado.
   */
  const restam = diasDoCiclo - diaDoCiclo;
  const prazo = restam === 0
    ? 'último dia do ciclo'
    : restam === 1
      ? 'falta 1 dia para o ciclo fechar'
      : `faltam ${restam} dias para o ciclo fechar`;

  return (
    <div
      className="mt-2 flex items-center gap-2 text-xs"
      // ⭐ A conta por extenso vive aqui: o número tem de ser auditável sem ocupar a linha.
      title={
        `Você está em ${brl(gastoAtual)} neste ciclo; costuma estar em ${brl(referencia)} `
        + `no dia ${diaDoCiclo}, média de ${ciclosDeBase} ciclos fechados.`
      }
    >
      <Icone size={14} className={`shrink-0 ${cor}`} />
      <span className="text-text-light">
        {emLinha ? (
          <>Em linha com o normal · {prazo}</>
        ) : (
          <>
            <strong className={cor}>{brl(Math.abs(diferenca))}</strong>{' '}
            {acima ? 'acima' : 'abaixo'} do normal · {prazo}
          </>
        )}
      </span>
    </div>
  );
}

function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split('-').map(Number);
  return `${dia} de ${MES_LONGO[mes - 1]}`;
}

const MES_LONGO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Uma cobrança que ainda vai cair.
 *
 * ⭐ É a frase inteira numa linha: **dia, nome, valor**. Foi para isso que a data foi
 * calculada — um total sozinho não diz o que fazer.
 */
function LinhaDeCobranca({ c, brl }: { c: Cobranca; brl: (v: number) => string }) {
  const dia = Number(c.data.split('-')[2]);
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-3 min-w-0">
        {/* ⭐⭐ O dia é a informação que esta linha existe para dar, e era o elemento mais
            apagado dela — cinza, 12px, do tamanho de uma legenda. Agora é uma pastilha de
            largura fixa, e a largura fixa é o ponto: os dias se alinham numa coluna e a
            lista inteira se lê de cima a baixo como um calendário do ciclo. */}
        <span className="shrink-0 w-11 rounded-lg bg-primary/10 py-1 text-center leading-none">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-primary/70">dia</span>
          <span className="block text-base font-bold text-primary">{String(dia).padStart(2, '0')}</span>
        </span>
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-text truncate">{c.fixo.nome}</span>
          {/* ⚠️ Quando o dia nominal cai em fim de semana, a data muda — e esconder isso faria
              o usuário achar que o app errou. */}
          {c.ajustada && (
            <span className="text-[10px] text-text-light/70 shrink-0" title="O dia caía num fim de semana">
              ajustado
            </span>
          )}
        </span>
      </span>
      <span className="font-medium text-text shrink-0">{brl(c.valor)}</span>
    </div>
  );
}

function FixoAtivo({ f, brl, lancamentos, estado, encerramento, onExcluir, onEncerrar }: {
  f: any; brl: (v: number) => string; lancamentos: any[];
  estado: { data: string; jaCaiu: boolean } | null;
  encerramento: PropostaDeFixo | null;
  onExcluir: () => void; onEncerrar: () => void;
}) {
  return (
    <div className="glass-panel p-4 group">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="font-medium text-text">{f.nome}</span>
          {/* ⚠️ "dia 3" solto não responde a pergunta que importa: já passou ou vem aí? Sem
              isto o usuário teria de cruzar este card com a lista de reserva lá em cima. */}
          <div className="text-xs text-text-light">
            {estado
              ? (estado.jaCaiu
                ? <span className="text-text-light/70">já caiu neste ciclo</span>
                : <span className="text-primary font-bold">cai dia {Number(estado.data.split('-')[2])}</span>)
              : (f.dia ? `dia ${f.dia}` : 'sem dia')}
            {(f.periodicidade_meses ?? 1) > 1 && ` · a cada ${f.periodicidade_meses} meses`}
            {f.origem === 'manual' && ' · cadastrado por você'}
          </div>
          <Lancamentos itens={lancamentos} brl={brl} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-bold text-text">{brl(Number(f.valor))}</div>
            {(f.periodicidade_meses ?? 1) > 1 && (
              <div className="text-[10px] text-text-light" title="Amortizado por mês">
                {brl(Number(f.valor) / f.periodicidade_meses)}/mês
              </div>
            )}
          </div>
          <button
            onClick={onExcluir}
            className="p-2 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            title="Excluir"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* ⚠️ O texto diz há quanto tempo, não "cancelado": o produto não vê cancelamento,
          vê ausência. Quem conclui é você, no botão ao lado. */}
      {encerramento && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2 text-xs text-danger">
            <AlertTriangle size={14} className="shrink-0" />
            Sem cobrança há {encerramento.silencioCiclos} ciclos — ainda paga isto?
          </span>
          {/* ⛔ Havia um "Ignorar" ao lado, e ele não fazia nada: gravava uma recusa com
              assinatura `ENCERRAR::…`, que a detecção nunca lê — os encerramentos entram
              depois da checagem de recusa. Além disso não existe caso legítimo para ele: se a
              cobrança voltar, o próprio lançamento novo apaga o aviso. */}
          <button
            onClick={onEncerrar}
            className="text-xs px-3 py-1 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors shrink-0"
          >
            Encerrar
          </button>
        </div>
      )}
    </div>
  );
}

function Proposta({ p, brl, onAceitar, onRecusar }: {
  p: PropostaDeFixo; brl: (v: number) => string; onAceitar: () => void; onRecusar: () => void;
}) {
  return (
    <div className="glass-panel p-4 border-l-4 border-primary">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase font-bold text-azul tracking-wider">
            {ROTULO_NATUREZA[p.natureza]}
          </div>
          <div className="font-medium text-text truncate">{p.nome}</div>
          {/* ⭐ Os dois valores lado a lado. Sem o antigo não dá para julgar a correção — e é
              esta linha que torna visível um casamento errado com o fixo. */}
          {p.natureza === 'corrigir' && p.nomeDoFixo && (
            <div className="text-[11px] text-text-light">
              corrige «{p.nomeDoFixo}» · {brl(p.valorAtual ?? 0)} → {brl(p.valor)}
            </div>
          )}
          <div className="text-xs text-text-light">
            {brl(p.valor)} · dia {p.dia}
            {p.periodicidade_meses > 1 && ` · a cada ${p.periodicidade_meses} meses`}
          </div>
          {/* ⭐ Evidência é o que torna a proposta discutível: sem ver o que a gerou, aceitar é chute. */}
          <Lancamentos itens={p.evidencia} brl={brl} />
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onAceitar} className="p-2 text-primary hover:bg-primary/10 rounded-lg" title="Aceitar">
            <Check size={18} />
          </button>
          <button onClick={onRecusar} className="p-2 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg" title="Recusar">
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Os mesmos pontos de quebra do Tailwind: `md` e `xl`. */
const LARGURAS = ['(min-width: 1280px)', '(min-width: 768px)'];

function quantasColunas(): number {
  if (typeof window === 'undefined') return 3;
  if (window.matchMedia(LARGURAS[0]).matches) return 3;
  return window.matchMedia(LARGURAS[1]).matches ? 2 : 1;
}

/**
 * Colunas que crescem de forma independente — o que um grid não faz.
 *
 * ⚠️ Num grid, expandir um card faz a **linha inteira** crescer, e tudo abaixo dela desce
 * junto. `items-start` resolve só metade do problema: os vizinhos param de esticar, mas a
 * linha continua empurrando o resto da página.
 *
 * ⛔ CSS multi-column (`columns-3`) resolveria em uma classe, e é a tentação óbvia. Mas ele
 * rebalanceia a altura sozinho: ao expandir um card, os outros **pulam de coluna**. Trocaria
 * um incômodo por um pior.
 *
 * ⭐ Distribuir por `i % n` mantém a leitura da esquerda para a direita — os três primeiros
 * itens continuam sendo a primeira "linha" visual, e nenhum card muda de coluna ao expandir.
 */
function Colunas({ itens, render }: { itens: any[]; render: (item: any) => ReactNode }) {
  const [colunas, setColunas] = useState(quantasColunas);

  useEffect(() => {
    const consultas = LARGURAS.map(q => window.matchMedia(q));
    const aoMudar = () => setColunas(quantasColunas());
    consultas.forEach(c => c.addEventListener('change', aoMudar));
    return () => consultas.forEach(c => c.removeEventListener('change', aoMudar));
  }, []);

  return (
    <div className="flex gap-6 items-start">
      {Array.from({ length: colunas }, (_, col) => (
        <div key={col} className="flex-1 min-w-0 flex flex-col gap-6">
          {itens.filter((_, i) => i % colunas === col).map(render)}
        </div>
      ))}
    </div>
  );
}

/**
 * Uma compra parcelada.
 *
 * ⭐ Mostra a **compra**, não a parcela: valor pago, pendente e total. É o que responde
 * "quanto ainda devo disto", que a linha de uma parcela sozinha não responde.
 *
 * ⚠️ Toda conta vem de `contaDaCompra`. Card que calcula sozinho é a D-007.
 */
function CardParcelas({ grupo, brl, aberto, onAlternar, onExcluir }: {
  grupo: any[]; brl: (v: number) => string;
  aberto: boolean; onAlternar: () => void; onExcluir: () => void;
}) {
  const base = grupo[0];
  const c = contaDaCompra(grupo);
  const pct = Math.min((c.pagas / c.totalParcelas) * 100, 100);

  return (
    <div
      className={`glass-panel p-6 flex flex-col gap-4 relative overflow-hidden group/card border-t-4 transition-all duration-300 ${
        c.concluida
          ? 'border-t-[#10b981] hover:border-t-[#059669] bg-[#10b981]/[0.01]'
          : 'border-t-transparent hover:border-t-primary'
      }`}
    >
      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover/card:opacity-100 transition-opacity">
        <button
          onClick={onExcluir}
          className="text-text-light hover:text-danger p-2 bg-white rounded-full shadow-md transition-all"
          title="Excluir a compra inteira"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <ListChecks size={14} className={c.concluida ? 'text-[#10b981]' : 'text-primary'} />
          <span className="text-[10px] text-text-light font-bold uppercase tracking-wider">
            Última entrada: {base.data}
          </span>
        </div>
        <h3 className="font-bold text-lg text-text leading-tight">{base.apelido || base.nome}</h3>
        {base.apelido && base.apelido !== base.nome && (
          <div className="text-[10px] text-text-light/70 break-words leading-tight mt-0.5" title={base.nome}>
            Original: {base.nome}
          </div>
        )}
        {base.banco && (
          <div className={`text-sm mt-1 font-medium ${c.concluida ? 'text-[#10b981]' : 'text-azul'}`}>
            {base.banco}
          </div>
        )}
      </div>

      <div className="mt-auto pt-4 border-t border-border">
        <div className="flex justify-between items-end mb-2">
          <div>
            <span className="text-xs text-text-light uppercase block">Valor da parcela</span>
            <span className="font-bold text-danger text-lg">{brl(c.valorParcela)}</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-text-light uppercase block">Progresso</span>
            <span className={`font-bold text-lg ${c.concluida ? 'text-[#10b981]' : 'text-text'}`}>
              {c.pagas} de {c.totalParcelas}
            </span>
          </div>
        </div>

        <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ease-out ${c.concluida ? 'bg-[#10b981]' : 'bg-primary/70'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <div className="text-xs text-text-light flex justify-between">
            <span>Valor pago:</span>
            <span className={`font-medium ${c.concluida ? 'text-[#10b981]' : 'text-azul'}`}>
              {brl(c.valorPago)}
            </span>
          </div>
          <div className="text-xs text-text-light flex justify-between">
            <span>Valor pendente:</span>
            <span className={`font-medium ${c.valorPendente > 0 ? 'text-danger' : 'text-text-light'}`}>
              {brl(c.valorPendente)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Valor total:</span>
            <span className="font-medium text-text">{brl(c.valorTotal)}</span>
          </div>
        </div>

        <button
          onClick={onAlternar}
          className={`mt-4 w-full flex items-center justify-center gap-1 text-xs font-bold transition-colors py-2 border-t border-border/50 ${
            c.concluida ? 'text-[#10b981] hover:text-[#059669]' : 'text-primary hover:text-primary-hover'
          }`}
        >
          {aberto
            ? <><ChevronUp size={14} /> Ocultar histórico</>
            : <><ChevronDown size={14} /> Ver parcelas pagas</>}
        </button>

        {aberto && (
          <div className={`mt-2 flex flex-col gap-2 p-3 rounded-lg border ${
            c.concluida ? 'bg-[#10b981]/5 border-[#10b981]/10' : 'bg-primary/5 border-primary/10'
          }`}>
            <h4 className="text-[10px] font-bold text-text-light uppercase tracking-wider mb-1">
              Histórico de pagamentos
            </h4>
            {grupo.map((t: any) => (
              <div key={t.id} className="flex justify-between items-center text-xs border-b border-border/30 pb-1 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium text-text">{t.data}</span>
                  <span className="text-[10px] text-text-light ml-2">({t.nome})</span>
                </div>
                <span className={`font-bold ${c.concluida ? 'text-[#10b981]' : 'text-azul'}`}>
                  {brl(Math.abs(Number(t.valor)))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
