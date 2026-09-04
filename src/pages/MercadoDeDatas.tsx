import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { CalendarClock, CreditCard, AlertTriangle, TrendingUp, Settings, Check, X, Gauge } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  cobrancasEmRisco, curvaDeFolga, sugestaoDeData,
  type CurvaDeFolga, type EntradaDoMercado, type EventoDatado, type FixoDaFolga, type TransacaoDaFolga,
} from '../lib/folga';
import { detectarPropostas, detectarPropostasDeData, type PropostaDeData } from '../lib/fixos-propostos';
import { MINIMO_DE_CICLOS_DE_BASE } from '../lib/compromissos';
import { cicloDeHoje, limitesDoCiclo } from '../lib/ciclo';

/**
 * As cores do gráfico, lidas de `src/index.css` em tempo de execução.
 *
 * ⚠️⚠️ **Recharts precisa de uma cor concreta**: `var(--marca)` num atributo de apresentação
 * SVG não é resolvido pelo navegador, e a linha sai preta sem nenhum erro. Escrever
 * `#FF6200` aqui seria a duplicação que a armadilha 11 proíbe — `src/index.css` é o único
 * dono da cor de marca (D-037) —, então a variável é lida de lá.
 *
 * `danger` e `border` não passam por variável: são literais no `tailwind.config.js` e não
 * são cor de marca, então o valor vem de lá mesmo.
 */
const COR = {
  marca: () => daVariavel('--marca', '#FF6200'),
  texto: () => daVariavel('--texto-suave', '#64748b'),
  perigo: '#991b1b',
  grade: '#e2e8f0',
  renda: '#059669',
};

function daVariavel(nome: string, reserva: string): string {
  if (typeof document === 'undefined') return reserva;
  const canais = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return canais ? `rgb(${canais})` : reserva;
}

const real = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const realExato = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function MercadoDeDatas() {
  const [transacoes, setTransacoes] = useState<TransacaoDaFolga[]>([]);
  // `status` não é lido por `folga.ts` — a entrada dele já são os ativos —, mas é lido aqui,
  // que é quem filtra.
  const [fixos, setFixos] = useState<(FixoDaFolga & { status?: string | null })[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; e_renda?: boolean | null }[]>([]);
  const [vencimentos, setVencimentos] = useState<{ banco: string; dia: number }[]>([]);
  /**
   * As decisões de `public.mercado_datas` — aceitas **e** recusadas.
   *
   * ⚠️ Carrega as duas: a recusada não vira evento na curva, mas precisa estar aqui para a
   * detecção não repropor o que já foi dispensado. Sem isso a decisão dura até o próximo F5, que
   * é a mesma armadilha que `fixos.status` documenta.
   */
  const [decisoes, setDecisoes] = useState<
    { id: string; assinatura: string; nome: string; dia: number; periodicidade_meses: number; status: string }[]
  >([]);
  const [salvando, setSalvando] = useState<string | null>(null);
  // ⚠️ Valor do PRIMEIRO render, antes de a consulta voltar -- nao e so um placeholder: com um
  // numero diferente do que esta no banco, a primeira pintura agrupa por uma fronteira de
  // ciclo e a segunda por outra. Padrao 1.
  const [cicloDia, setCicloDia] = useState(1);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setCarregando(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const [mem, tx, fx, cat, ven, mdd] = await Promise.all([
        supabase.from('memory').select('ciclo_dia').maybeSingle(),
        // ⛔ O `order` não é cosmético: a detecção de fixos ancora no primeiro elemento do
        // array, e sem ordem definida a assinatura muda entre carregamentos. → D-060
        supabase.from('transactions').select('*').eq('pendente', false).order('data'),
        supabase.from('fixos').select('*'),
        supabase.from('categories').select('id, e_renda'),
        supabase.from('vencimentos').select('banco, dia'),
        supabase.from('mercado_datas').select('id, assinatura, nome, dia, periodicidade_meses, status'),
      ]);
      setCicloDia(mem.data?.ciclo_dia ?? 1);
      setTransacoes(tx.data ?? []);
      setFixos(fx.data ?? []);
      setCategorias(cat.data ?? []);
      setVencimentos(ven.data ?? []);
      setDecisoes(mdd.data ?? []);
    } catch (err) {
      console.error('Erro ao carregar o mercado de datas:', err);
    } finally {
      setCarregando(false);
    }
  };

  /**
   * ⚠️⚠️ **O contrato de `cobrancasDoCiclo` vale aqui inteiro:** fixo com proposta de
   * encerramento não entra. Sem este filtro, uma cobrança que parou de existir continuaria
   * derrubando a curva, e a tela ofereceria negociar a data de algo que ninguém cobra mais.
   */
  /** Só as `ativo` viram evento na curva. Recusada é decisão de não participar. */
  const aceitas = useMemo<EntradaDoMercado[]>(
    () => decisoes.filter(d => d.status === 'ativo'),
    [decisoes],
  );

  const resultado = useMemo(() => {
    if (carregando) return null;
    const ativos = fixos.filter(f => f.status === 'ativo');
    const encerrados = new Set(
      detectarPropostas(transacoes, fixos, cicloDia)
        .filter(p => p.natureza === 'encerrar' && p.fixoId)
        .map(p => p.fixoId as string),
    );
    return curvaDeFolga({
      transacoes,
      fixosAtivos: ativos.filter(f => !encerrados.has(f.id)),
      categorias,
      vencimentos,
      mercadoDatas: aceitas,
      cicloDia,
    });
  }, [carregando, transacoes, fixos, categorias, vencimentos, aceitas, cicloDia]);

  /**
   * As cobranças de valor variável que ainda não foram decididas.
   *
   * ⚠️ Passa `decisoes` inteiro — aceitas **e** recusadas —, porque o que a detecção precisa saber
   * é "já decidi sobre isto", não "aceitei". Filtrar só as aceitas faria a recusada reaparecer em
   * toda carga.
   */
  const propostasDeData = useMemo(
    () => (carregando ? [] : detectarPropostasDeData(transacoes, fixos, decisoes, cicloDia)),
    [carregando, transacoes, fixos, decisoes, cicloDia],
  );

  /**
   * Aceita ou recusa uma proposta de data.
   *
   * ⛔ **Recusar grava uma linha, não apaga nada.** Sem o registro da recusa a detecção repropõe na
   * carga seguinte, e a decisão dura até o próximo F5 — é a mesma armadilha que o comentário de
   * `dispensada` em `fixos-propostos.ts` documenta para os gastos fixos.
   */
  const decidir = async (p: PropostaDeData, status: 'ativo' | 'recusado') => {
    setSalvando(p.assinatura);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const { error } = await supabase.from('mercado_datas').upsert({
        user_id: user.id,
        assinatura: p.assinatura,
        nome: p.nome,
        dia: p.dia,
        periodicidade_meses: p.periodicidade_meses,
        status,
      }, { onConflict: 'user_id,assinatura' });
      if (error) throw error;
      await carregar();
    } catch (err) {
      console.error('Erro ao decidir proposta de data:', err);
    } finally {
      setSalvando(null);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-primary flex items-center gap-2">
          <CalendarClock size={28} /> Mercado de Datas
        </h2>
        {/* ⭐ A promessa da tela em uma frase, e ela não é "você gasta demais". É a outra, que
            só existe porque a data importa. */}
        <p className="text-text-light mt-1">
          Não é sobre gastar menos. É sobre <strong>quando</strong> o dinheiro sai: se as
          cobranças caem antes do salário, falta dinheiro mesmo num mês em que sobra.
        </p>
      </header>

      {resultado === null || !resultado.ok
        ? <SemCurva resultado={resultado} />
        : <ComCurva curva={resultado.curva} cicloDia={cicloDia} />}

      {/* ⭐ No FIM da página, e não no topo. O que a tela promete é o diagnóstico do ciclo — a
          curva, o que está em risco, o que cai. Isto é configuração: melhora o diagnóstico do mês
          que vem, não responde nada sobre este. Pedir uma decisão antes de mostrar o resultado
          inverte a ordem e transforma a tela numa fila de tarefas. */}
      <PropostasDeData propostas={propostasDeData} salvando={salvando} onDecidir={decidir} />
    </div>
  );
}

/**
 * As cobranças de **valor variável** que o produto reconheceu e ainda não foram decididas.
 *
 * ⭐⭐ **Por que elas aparecem aqui e não em `/compromissos`.** Uma conta de consumo não promete um
 * valor — promete uma *data*. Para o painel de comprometido isso a torna um mau gasto fixo: afirmar
 * "R$ 240 por mês" é afirmar um número que ninguém mediu. Para esta tela é o contrário, porque aqui
 * o que se usa é a data. Aceitar não muda nenhum número do comprometido: aquelas transações
 * continuam contadas como Previsível, pelo rótulo.
 *
 * ⛔⛔ **Nada disto é aceito sozinho, e a medição explica por quê.** O filtro (nome idêntico, dia
 * ±1, uma vez por ciclo, valor variando) pega a conta de internet — variação de 5% — e pega junto o
 * posto de gasolina, com 13% a 23%. Nenhum teto de dispersão separa os dois: 10% barraria os postos
 * e barraria também uma Enel sazonal, que é o caso de uso. A diferença entre "conta que eu devo" e
 * "compra que eu escolho" não está nos números — então quem decide é a pessoa.
 */
function PropostasDeData(
  { propostas, salvando, onDecidir }: {
    propostas: PropostaDeData[];
    salvando: string | null;
    onDecidir: (p: PropostaDeData, status: 'ativo' | 'recusado') => void;
  },
) {
  if (propostas.length === 0) return null;

  return (
    <div className="glass-panel p-6 border-l-4 border-primary">
      <h3 className="text-lg font-bold text-text flex items-center gap-2 mb-1">
        <Gauge size={20} className="text-primary" />
        {propostas.length === 1 ? 'Uma cobrança de valor variável' : `${propostas.length} cobranças de valor variável`}
      </h3>
      <p className="text-xs text-text-light mb-4">
        Caem sempre no mesmo dia, mas o valor muda todo mês — conta de luz, água, internet. A
        <strong> data</strong> é confiável mesmo quando o valor não é, e é a data que esta tela usa.
        Aceitar não muda nenhum número do seu comprometido.
      </p>

      <div className="flex flex-col">
        {propostas.map(p => (
          <div key={p.assinatura} className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
            <span className="w-10 text-sm font-bold text-text-light text-right shrink-0">{p.dia}</span>
            <span className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-text block truncate">{p.nome}</span>
              <span className="text-xs text-text-light">
                {p.evidencia.length} cobranças
                {(p.periodicidade_meses ?? 1) > 1 && ` · a cada ${p.periodicidade_meses} meses`}
                {' · '}
                {/* ⚠️ A faixa observada, e não só a média: é o que deixa você julgar se aquilo é
                    conta de consumo ou compra sua. A média sozinha esconde a dispersão, que é
                    justamente o sinal que separa os dois. */}
                {realExato(Math.min(...p.evidencia.map(t => Math.abs(Number(t.valor)))))}
                {' a '}
                {realExato(Math.max(...p.evidencia.map(t => Math.abs(Number(t.valor)))))}
              </span>
            </span>
            <span className="text-right shrink-0">
              <span className="text-sm font-bold text-text block">{realExato(p.valorMedio)}</span>
              <span className="text-[10px] text-text-light">média</span>
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {salvando === p.assinatura ? (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <button
                    onClick={() => onDecidir(p, 'ativo')}
                    title="Contar esta cobrança na curva"
                    className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    onClick={() => onDecidir(p, 'recusado')}
                    title="Não é uma cobrança com data fixa"
                    className="p-2 rounded-lg text-text-light hover:bg-danger/10 hover:text-danger transition-colors"
                  >
                    <X size={18} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ⛔ Sem base, a tela diz o que falta — não desenha uma curva chutada.
 *
 * É o mesmo princípio de `reserva.ts`: "sem histórico não se afirma nada; chutar produziria
 * um aviso falso, pior que aviso nenhum". Aqui o silêncio seria ainda pior, porque uma tela
 * vazia se confunde com "está tudo bem".
 */
function SemCurva({ resultado }: { resultado: ReturnType<typeof curvaDeFolga> | null }) {
  if (!resultado) return null;
  if (resultado.ok) return null;

  if (resultado.motivo === 'sem-renda') {
    return (
      <div className="glass-panel p-8 text-center">
        <TrendingUp size={32} className="text-primary mx-auto mb-3" />
        <h3 className="text-lg font-bold text-text mb-2">Falta dizer o que é renda</h3>
        <p className="text-sm text-text-light max-w-lg mx-auto">
          A conta inteira parte de <strong>quando</strong> o seu dinheiro entra. Marque no
          perfil quais categorias são renda — e não basta o valor ser positivo: estorno e
          reembolso também são, e não são dinheiro que você ganhou.
        </p>
        <Link
          to="/perfil"
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
        >
          <Settings size={16} /> Ir para o Perfil
        </Link>
      </div>
    );
  }

  const faltam = MINIMO_DE_CICLOS_DE_BASE - resultado.ciclosDeBase;
  return (
    <div className="glass-panel p-8 text-center">
      <CalendarClock size={32} className="text-primary mx-auto mb-3" />
      <h3 className="text-lg font-bold text-text mb-2">
        {faltam === 1 ? 'Falta um ciclo' : `Faltam ${faltam} ciclos`}
      </h3>
      <p className="text-sm text-text-light max-w-lg mx-auto">
        Você tem {resultado.ciclosDeBase} de {MINIMO_DE_CICLOS_DE_BASE} ciclos fechados.
        Com menos que isso, um mês atípico desloca a referência pela metade e a curva vira
        ruído com cara de fato — então ela ainda não é desenhada.
      </p>
    </div>
  );
}

function ComCurva({ curva, cicloDia }: { curva: CurvaDeFolga; cicloDia: number }) {
  const sugestao = useMemo(() => sugestaoDeData(curva), [curva]);
  // ⭐ Vem de `folga.ts`, não é refiltrado aqui: "cai dentro da janela de déficit" é regra de
  // domínio, e ela tem um dono só — o mesmo de onde a sugestão tira os candidatos.
  const emRisco = useMemo(() => cobrancasEmRisco(curva), [curva]);
  const totalEmRisco = emRisco.reduce((soma, e) => soma + e.valor, 0);

  /**
   * O eixo X mostra a **data**, não o índice do dia do ciclo.
   *
   * ⚠️⚠️ O ciclo não é o mês: com `ciclo_dia = 10`, o dia 1 do ciclo é o dia 11 do mês. Um
   * eixo numerado de 1 a 30 pareceria o calendário e não é — e a pessoa configurou o
   * vencimento da fatura pelo dia do mês, então ver "9" onde ela escreveu "10" seria um erro
   * aparente que não existe.
   */
  const rotuloDoDia = useMemo(() => {
    const { inicio } = limitesDoCiclo(cicloDeHoje(cicloDia), cicloDia);
    const [a, m, d] = inicio.split('-').map(Number);
    return (dia: number) => {
      const x = new Date(a, m - 1, d);
      x.setDate(x.getDate() + dia - 1);
      return String(x.getDate());
    };
  }, [cicloDia]);

  const dados = curva.saldo.map((valor, i) => ({ dia: i + 1, rotulo: rotuloDoDia(i + 1), saldo: valor }));

  /**
   * Um marcador por DIA, não por cobrança.
   *
   * ⛔ **Duas `ReferenceLine` no mesmo `x` são duas linhas idênticas, uma sobre a outra** — o
   * agrupamento seria necessário mesmo que o rótulo estivesse certo. Três débitos no dia 3 desenhavam
   * três linhas e três textos empilhados, e o resultado era um borrão.
   *
   * ⭐ Quando o dia tem mais de uma, o rótulo vira a contagem: os nomes completos vivem na lista
   * "O que cai neste ciclo", logo abaixo. O gráfico mostra **quando** e **quanto**; a lista mostra
   * **o quê**. Tentar ser as duas coisas foi o que estourou a área de plotagem.
   */
  const marcadores = useMemo(() => {
    const porDia = new Map<number, EventoDatado[]>();
    for (const e of curva.eventos) porDia.set(e.dia, [...(porDia.get(e.dia) ?? []), e]);

    return [...porDia.entries()].map(([dia, eventos]) => {
      // A natureza dominante decide a cor. Renda primeiro porque um dia que recebe salário é, para
      // quem olha, o dia do salário — mesmo que uma conta caia junto.
      const natureza = eventos.some(e => e.natureza === 'renda') ? 'renda'
        : eventos.some(e => e.natureza === 'fatura') ? 'fatura' : 'debito';
      return {
        dia,
        natureza,
        rotulo: eventos.length === 1 ? eventos[0].rotulo : `${eventos.length} cobranças`,
        // Só tracejado quando TODAS escorregaram; senão o tracejado mentiria sobre as outras.
        ajustada: eventos.every(e => e.ajustada),
        jaAconteceu: eventos.every(e => e.jaAconteceu),
      };
    });
  }, [curva.eventos]);

  return (
    <>
      {/* ---------------------------------------------------------------- o veredito */}
      {curva.deficit ? (
        <div className="glass-panel p-6 border-l-4 border-danger">
          <h3 className="text-lg font-bold text-danger flex items-center gap-2 mb-2">
            <AlertTriangle size={20} /> Vai faltar dinheiro no dia {rotuloDoDia(curva.deficit.pior)}
          </h3>
          <p className="text-sm text-text-light">
            A folga chega a <strong className="text-danger">{realExato(curva.deficit.valorPior)}</strong> no
            pior momento, entre os dias {rotuloDoDia(curva.deficit.inicio)} e{' '}
            {rotuloDoDia(curva.deficit.fim)}. Você não gasta mais do que ganha neste ciclo — o
            problema é a ordem em que as coisas caem.
          </p>

          {sugestao && (
            <div className="mt-4 p-4 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-sm text-text">
                {sugestao.resolve ? (
                  <>
                    Mude a cobrança de <strong>{sugestao.evento.rotulo}</strong>{' '}
                    ({realExato(sugestao.evento.valor)}) do dia{' '}
                    <strong>{rotuloDoDia(sugestao.evento.dia)}</strong> para o dia{' '}
                    <strong>{rotuloDoDia(sugestao.diasOfertados[0])}</strong> e o ciclo fecha no
                    azul — sem gastar um centavo a menos.
                  </>
                ) : (
                  <>
                    Mover <strong>{sugestao.evento.rotulo}</strong> para o dia{' '}
                    <strong>{rotuloDoDia(sugestao.diasOfertados[0])}</strong> é o que mais
                    alivia, mas <strong>não basta</strong>: a folga ainda ficaria em{' '}
                    {realExato(sugestao.folgaResultante)}. Este buraco não se resolve só com
                    data.
                  </>
                )}
              </p>
              {sugestao.resolve && sugestao.diasOfertados.length > 1 && (
                /* ⭐ Os outros dias existem para a negociação: se o recebedor recusar o
                   primeiro, há alternativa pronta em vez de recomeçar a conversa. */
                <p className="text-xs text-text-light mt-2">
                  Também funcionariam os dias{' '}
                  {sugestao.diasOfertados.slice(1, 6).map(d => rotuloDoDia(d)).join(', ')}
                  {sugestao.diasOfertados.length > 6 && ' e outros'}.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="glass-panel p-6 border-l-4 border-emerald-500">
          <h3 className="text-lg font-bold text-text mb-1">O ciclo fecha sem aperto</h3>
          <p className="text-sm text-text-light">
            Seu pior momento é o dia <strong>{rotuloDoDia(curva.folgaMinima.dia)}</strong>, com{' '}
            <strong>{realExato(curva.folgaMinima.valor)}</strong> de folga.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------- o gráfico */}
      <div className="glass-panel p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h3 className="text-lg font-bold text-text">Sua folga, dia a dia</h3>
          <span className="text-xs text-text-light">
            parte de {realExato(curva.saldoInicial)}, a sobra do ciclo passado
          </span>
        </div>
        <p className="text-xs text-text-light mb-4">
          Média de {curva.ciclosDeBase} ciclos fechados. Cada marcador é um dia em que algo cai —
          e cada degrau da curva é isso acontecendo. Dia com mais de uma cobrança mostra a contagem;
          os nomes completos estão na lista abaixo.
        </p>

        <div className="h-[26rem] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados} margin={{ top: 12, right: 12, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => real(Number(v))} width={70} />
              <Tooltip
                // ⚠️ A assinatura do `formatter` do Recharts já quebrou o deploy antes
                // (TS2322, armadilha 4): o retorno tem de ser string, e o valor chega unknown.
                formatter={(valor) => [realExato(Number(valor)), 'Folga']}
                labelFormatter={(r) => `Dia ${r}`}
              />

              {/* A fronteira. É o zero que importa, não o cruzamento de duas retas. */}
              <ReferenceLine y={0} stroke={COR.perigo} strokeWidth={1.5} />

              {/* A janela de déficit, sombreada — do primeiro dia negativo até voltar. */}
              {curva.deficit && (
                <ReferenceArea
                  x1={dados[curva.deficit.inicio - 1]?.rotulo}
                  x2={dados[curva.deficit.fim - 1]?.rotulo}
                  fill={COR.perigo}
                  fillOpacity={0.08}
                />
              )}

              {/* ⭐ Um marcador por dia em que algo cai — no dia EXATO, já com o ajuste de fim de
                  semana, que é onde o dinheiro sai de verdade. É o elemento que torna o degrau
                  legível: sem ele a pessoa vê uma queda e não sabe de quem é. */}
              {marcadores.map(m => (
                <ReferenceLine
                  key={`m${m.dia}`}
                  x={dados[m.dia - 1]?.rotulo}
                  stroke={m.natureza === 'renda' ? COR.renda : m.natureza === 'fatura' ? COR.marca() : COR.perigo}
                  strokeWidth={m.natureza === 'debito' ? 1 : 2}
                  strokeOpacity={m.jaAconteceu ? 0.35 : 0.85}
                  strokeDasharray={m.ajustada ? '4 3' : undefined}
                  label={<RotuloDoMarcador texto={m.rotulo} aoFim={m.dia / curva.dias > 0.7} />}
                />
              ))}

              {/* Hoje. */}
              <ReferenceLine
                x={dados[curva.diaDeHoje - 1]?.rotulo}
                stroke={COR.texto()}
                strokeDasharray="2 2"
                label={{ value: 'hoje', position: 'top', fontSize: 10 }}
              />

              <Line
                type="stepAfter"
                dataKey="saldo"
                stroke={COR.marca()}
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ------------------------------------------------------- o que pode não ser pago */}
      {curva.deficit && emRisco.length > 0 && (
        <div className="glass-panel p-6 border-l-4 border-danger">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <h3 className="text-lg font-bold text-danger flex items-center gap-2">
              <AlertTriangle size={20} /> Em risco de não cair
            </h3>
            <span className="text-sm font-bold text-danger">{realExato(totalEmRisco)}</span>
          </div>
          {/* ⭐ A seção existe separada porque responde outra pergunta que a lista de baixo: lá é
              "o que acontece neste ciclo", aqui é "o que pode não acontecer". Misturar as duas fazia
              a informação mais urgente da tela ficar escondida no meio de dez linhas iguais. */}
          <p className="text-xs text-text-light mb-4">
            Estas cobranças caem entre os dias {rotuloDoDia(curva.deficit.inicio)} e{' '}
            {rotuloDoDia(curva.deficit.fim)}, quando a folga está negativa — elas disputam um
            dinheiro que ainda não está na conta.
          </p>
          <div className="flex flex-col">
            {emRisco.map((e, i) => (
              <LinhaDoEvento key={i} evento={e} rotulo={rotuloDoDia(e.dia)} destaque={sugestao?.evento === e} />
            ))}
          </div>
          {/* ⚠️ Sem esta frase, uma fatura na lista parece um item negociável como os outros. */}
          <p className="text-xs text-text-light mt-4">
            {emRisco.some(e => e.movivel)
              ? 'As marcadas como “pode mudar de data” são as que dá para negociar — as outras entram na conta, mas não no mercado.'
              : 'Nenhuma delas é débito em conta, então não há data a negociar: este buraco não se resolve movendo cobrança.'}
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------- o ciclo inteiro */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-text mb-1">O que cai neste ciclo</h3>
        {/* ⚠️ Só débito em conta é negociável, e a tela precisa dizer por quê — senão a
            ausência da fatura na lista de móveis parece descuido. */}
        <p className="text-xs text-text-light mb-4">
          Só o débito em conta entra no mercado: é o único que vira multa no dia seguinte.
          Cobrança no cartão não atrasa nada — ela só espera a fatura.
        </p>
        <div className="flex flex-col">
          {curva.eventos.map((e, i) => (
            <LinhaDoEvento key={i} evento={e} rotulo={rotuloDoDia(e.dia)} destaque={sugestao?.evento === e} />
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- o que ficou fora */}
      {(curva.cartoesSemVencimento.length > 0 || curva.semBanco > 0) && (
        <div className="glass-panel p-6 border-l-4 border-amber-500">
          <h3 className="text-base font-bold text-text flex items-center gap-2 mb-2">
            <CreditCard size={18} /> Fatura que ficou fora da curva
          </h3>
          {/* ⚠️ "Fatura", e não "cartão": desde 03/09 a parcela anda aqui também, e ela costuma vir
              marcada como débito no histórico — quem lesse "cartão" não reconheceria a própria
              parcela no número. */}
          {curva.cartoesSemVencimento.map(c => (
            <p key={c.banco} className="text-sm text-text-light">
              <strong>{c.banco}</strong>: {realExato(c.valor)} em compras e parcelas de cartão, sem
              dia de vencimento configurado.
            </p>
          ))}
          {curva.semBanco > 0 && (
            <p className="text-sm text-text-light">
              {realExato(curva.semBanco)} em compras e parcelas de cartão <strong>sem banco
              identificado</strong> — planilha não traz o banco, e print nem sempre deixa deduzir.
            </p>
          )}
          {/* ⛔ Chutar um vencimento produziria um aviso falso, pior que aviso nenhum. */}
          <p className="text-xs text-text-light mt-2">
            Sem o dia, essa saída não entra na conta — e o produto prefere dizer que não sabe.
          </p>
          <Link
            to="/perfil"
            className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            <Settings size={14} /> Configurar no Perfil
          </Link>
        </div>
      )}
    </>
  );
}

/**
 * O rótulo de um marcador, na diagonal a −45°.
 *
 * ⭐⭐ **A geometria, porque ela decide tudo aqui.** Em SVG o texto corre na direção `+x`; sob
 * `rotate(-45)` essa direção vira `(0,707, −0,707)` — para a **direita e para cima**. Daí os dois
 * quadrantes, com a mesma inclinação:
 *
 * | onde | âncora | `textAnchor` | o texto ocupa |
 * |---|---|---|---|
 * | ciclo cedo/meio | pé do marcador | `start` | direita-acima, **começando** no marcador |
 * | fim do ciclo | topo do marcador | `end` | esquerda-abaixo, **terminando** no marcador |
 *
 * ⚠️ **O segundo quadrante existe por causa da borda direita.** Um rótulo de ~120 px a 45° avança
 * ~85 px na horizontal; do fim do ciclo em diante isso passa do limite da área. Virar o quadrante
 * mantém a leitura idêntica — mesmo ângulo, mesmo sentido — e traz o texto para dentro.
 *
 * ⛔ **`aoFim` vem como prop, e não do `viewBox`.** Para uma `ReferenceLine` vertical o Recharts
 * entrega `width: 0` (x1 === x2), então a largura da área de plotagem **não está** ali — não dá para
 * decidir a virada aqui dentro. Quem sabe é o pai, por `dia / dias`.
 *
 * ⚠️⚠️ **Foi aqui que os nomes saíam do gráfico, e o histórico fica para não voltar.** A primeira
 * versão usava o objeto `label={{ ..., position: 'insideTopLeft', angle: -90 }}`. `rotate(-90)` faz
 * o texto correr para cima a partir da âncora, e `insideTopLeft` põe a âncora na borda superior:
 * ele subia para fora da área e era cortado. ⛔ **O `angle` do Recharts não reposiciona a âncora
 * para compensar** — é por isso que o rótulo é desenhado à mão aqui em vez de voltar para o objeto
 * `label`, que parece mais simples e não dá controle sobre a âncora.
 *
 * ⚠️ `viewBox` chega do Recharts por `cloneElement`, e por isso é opcional na assinatura: o
 * componente nunca é montado à mão. Sem ele, não desenha — em vez de desenhar em (0,0).
 */
function RotuloDoMarcador(
  { texto, aoFim, viewBox }: {
    texto: string;
    /** O marcador está no fim do ciclo? Decide o quadrante — ver o comentário acima. */
    aoFim: boolean;
    viewBox?: { x?: number; y?: number; height?: number };
  },
) {
  if (!viewBox || viewBox.x == null || viewBox.y == null || viewBox.height == null) return null;

  // Trunca porque a diagonal gasta largura, e é a largura que acaba primeiro: um nome de extrato
  // como "Debito automatico: \"0071845220196\"" avançaria meia tela para a direita.
  const curto = texto.length > 18 ? `${texto.slice(0, 17)}…` : texto;

  // ⭐ Os dois quadrantes, com a MESMA inclinação — o que muda é onde o texto começa e onde termina.
  const x = viewBox.x + (aoFim ? -4 : 4);
  const y = aoFim ? viewBox.y + 14 : viewBox.y + viewBox.height - 8;

  return (
    <text
      x={x}
      y={y}
      transform={`rotate(-45, ${x}, ${y})`}
      textAnchor={aoFim ? 'end' : 'start'}
      fontSize={11}
      className="fill-text-light"
    >
      {curto}
    </text>
  );
}

function LinhaDoEvento(
  { evento, rotulo, destaque }: { evento: EventoDatado; rotulo: string; destaque: boolean },
) {
  const cor = evento.natureza === 'renda' ? 'text-emerald-600'
    : evento.natureza === 'fatura' ? 'text-primary' : 'text-danger';
  return (
    <div className={`flex items-center gap-3 py-2 border-b border-border last:border-b-0 ${destaque ? 'bg-primary/5 -mx-2 px-2 rounded-lg' : ''}`}>
      <span className="w-10 text-sm font-bold text-text-light text-right shrink-0">{rotulo}</span>
      <span className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-text block truncate">{evento.rotulo}</span>
        <span className="text-xs text-text-light">
          {evento.natureza === 'renda' ? 'entra' : evento.natureza === 'fatura' ? 'fatura do cartão' : 'débito em conta'}
          {evento.ajustada && ' · escorregou do fim de semana'}
          {evento.jaAconteceu && ' · já caiu'}
          {evento.movivel && !evento.jaAconteceu && ' · pode mudar de data'}
        </span>
      </span>
      <span className={`text-sm font-bold whitespace-nowrap ${cor}`}>
        {evento.natureza === 'renda' ? '+' : '−'} {realExato(evento.valor)}
      </span>
    </div>
  );
}
