import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Escolher transações do histórico — usado ao **criar** e ao **editar** um compromisso.
 *
 * ⭐⭐ **Controlado de propósito**, porque "selecionar" significa coisas diferentes nos dois
 * lugares: na edição o slug já existe e cada clique grava no banco; na criação o slug ainda
 * não existe, então a escolha vive no formulário e só é persistida ao salvar. O componente
 * não sabe qual dos dois é — ele recebe o que está escolhido e avisa quando alguém clica.
 *
 * ⭐ **Rolar antes de buscar.** Exigir que o usuário digitasse para ver qualquer coisa supõe
 * que ele já sabe o nome que procura, e o nome do extrato é justamente o que ninguém lembra.
 */

export interface TransacaoEscolhida {
  id: string;
  data: string;
  nome: string;
  apelido?: string | null;
  /** ⚠️ Positivo. A transação é saída, mas aqui só se exibe o quanto. */
  valor?: number;
}

export interface CategoriaDeFiltro {
  id: string;
  nome: string;
  e_renda?: boolean | null;
}

/**
 * As quatro ordens do catálogo.
 *
 * ⚠️ `valor` é assinado e saída é negativa, então **maior gasto = ordem crescente do número**.
 * O rótulo fala de negócio e a direção fica aqui, para ninguém ler `ascending: true` na
 * consulta e achar que está invertido.
 */
const ORDEM: Record<string, { campo: string; asc: boolean }> = {
  recentes: { campo: 'data', asc: false },
  antigas: { campo: 'data', asc: true },
  maiores: { campo: 'valor', asc: true },
  menores: { campo: 'valor', asc: false },
};

const PAGINA = 100;

export default function SeletorDeTransacoes({ selecionadas, teto, categorias, onAlternar }: {
  selecionadas: TransacaoEscolhida[];
  teto: number;
  /** Para o filtro. ⚠️ Só as de gasto entram: o catálogo só mostra saída. */
  categorias: CategoriaDeFiltro[];
  onAlternar: (t: TransacaoEscolhida, jaEscolhida: boolean) => void;
}) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<keyof typeof ORDEM>('recentes');
  const [categoria, setCategoria] = useState('');
  const [catalogo, setCatalogo] = useState<TransacaoEscolhida[]>([]);
  const [limite, setLimite] = useState(PAGINA);
  const [carregando, setCarregando] = useState(false);

  /**
   * ⚠️ Paginado, ordenado e filtrado no **servidor**. São três anos de transações: trazer
   * tudo para o `/perfil` seria desperdício, e ordenar só a janela de 100 devolveria "a maior
   * das 100 primeiras", que não é a maior.
   *
   * ⚠️ O atraso agrupa as teclas — sem ele, cada letra digitada vira uma consulta. E montar o
   * componente já é o gatilho: quem não abriu o formulário não consulta nada.
   */
  useEffect(() => {
    const id = setTimeout(async () => {
      setCarregando(true);
      try {
        let consulta = supabase
          .from('transactions')
          .select('id, data, nome, apelido, valor')
          .eq('pendente', false)
          .lt('valor', 0);

        const termo = busca.trim();
        if (termo.length >= 2) consulta = consulta.or(`nome.ilike.%${termo}%,apelido.ilike.%${termo}%`);
        if (categoria) consulta = consulta.eq('categoria_id', categoria);

        const { data } = await consulta
          .order(ORDEM[ordem].campo, { ascending: ORDEM[ordem].asc })
          .limit(limite);
        setCatalogo((data ?? []).map(t => ({ ...t, valor: Math.abs(Number(t.valor) || 0) })));
      } finally {
        setCarregando(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [busca, ordem, categoria, limite]);

  const escolhidos = new Set(selecionadas.map(t => t.id));
  const noTeto = selecionadas.length >= teto;
  const resto = catalogo.filter(t => !escolhidos.has(t.id));

  const linha = (t: TransacaoEscolhida, marcada: boolean, aoClicar: (() => void) | null) => (
    <button
      key={t.id}
      onClick={() => aoClicar?.()}
      disabled={!aoClicar}
      title={marcada ? 'Clique para tirar dos exemplos' : undefined}
      className={`w-full flex items-center justify-between gap-2 text-xs py-1.5 px-2 border-b border-border/40 last:border-0 transition-colors ${
        marcada
          ? 'bg-primary/10 text-primary hover:bg-danger/10 hover:text-danger'
          : aoClicar ? 'hover:bg-primary/10' : 'opacity-40 cursor-not-allowed'
      }`}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {marcada && <Check size={12} className="shrink-0" />}
        <span className={`truncate ${marcada ? '' : 'text-text-light'}`}>
          {t.data} · {t.apelido || t.nome}
        </span>
      </span>
      {t.valor != null && (
        <span className={`shrink-0 ${marcada ? '' : 'text-text'}`}>
          R$ {t.valor.toFixed(2).replace('.', ',')}
        </span>
      )}
    </button>
  );

  return (
    <>
      <input
        value={busca}
        onChange={e => { setBusca(e.target.value); setLimite(PAGINA); }}
        placeholder="Filtrar por nome..."
        className="glass-input p-2 text-sm bg-white w-full"
      />

      {/* ⚠️ Trocar ordem ou categoria recomeça a janela: senão "as 300 já carregadas"
          continuariam sendo a amostra sob um critério que mudou. */}
      <div className="flex gap-2 mt-1">
        <select
          value={ordem}
          onChange={e => { setOrdem(e.target.value as keyof typeof ORDEM); setLimite(PAGINA); }}
          className="glass-input p-2 text-xs bg-white flex-1 cursor-pointer"
          title="Ordenar"
        >
          <option value="recentes">Mais recentes</option>
          <option value="antigas">Mais antigas</option>
          <option value="maiores">Maior valor</option>
          <option value="menores">Menor valor</option>
        </select>
        <select
          value={categoria}
          onChange={e => { setCategoria(e.target.value); setLimite(PAGINA); }}
          className="glass-input p-2 text-xs bg-white flex-1 cursor-pointer"
          title="Filtrar por categoria"
        >
          <option value="">Todas as categorias</option>
          {categorias.filter(c => !c.e_renda).map(c => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      {/* ⭐ Uma lista só. As escolhidas ficam no topo e clicar de novo desmarca — separar
          "as minhas" de "as disponíveis" fazia a mesma transação aparecer em dois lugares,
          e desmarcar só funcionava em um deles.
          ⚠️ As escolhidas vêm de fora, não do catálogo: uma transação de 2024 pode não estar
          na janela carregada, e sumiria da tela se dependesse dela. */}
      <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-white/40">
        {carregando && catalogo.length === 0 && selecionadas.length === 0 ? (
          <div className="p-3 text-center text-xs text-text-light">Carregando...</div>
        ) : selecionadas.length === 0 && resto.length === 0 ? (
          <div className="p-3 text-center text-xs text-text-light">Nenhuma transação encontrada.</div>
        ) : (
          <>
            {selecionadas.map(t => linha(t, true, () => onAlternar(t, true)))}
            {resto.map(t => linha(t, false, noTeto ? null : () => onAlternar(t, false)))}
            {catalogo.length >= limite && (
              <button
                onClick={() => setLimite(n => n + PAGINA)}
                disabled={carregando}
                className="w-full py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {carregando ? 'Carregando...' : 'Buscar +'}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
