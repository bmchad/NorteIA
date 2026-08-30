import { useState } from 'react';
import { GraduationCap, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * As transações que o usuário apontou como exemplo de um tipo de compromisso.
 *
 * ⭐ Elas são o que ensina o agente de classificação: "Elizabeth" não parece lavanderia para
 * ninguém, e nenhuma descrição de tipo resolve isso — uma linha de exemplo resolve. Só que
 * viviam invisíveis, dentro do formulário de edição do `/perfil`. Quem configurou não tinha
 * como conferir sem entrar no modo de edição.
 *
 * ⭐ **Vazio devolve `null`.** Sem exemplo, sem ícone — assim o ícone significa alguma coisa,
 * e o card de quem não configurou nada continua limpo.
 *
 * ⚠️ **Somente leitura.** Acrescentar e remover continuam no formulário do `/perfil`: o card
 * informa, a edição configura. Mesmo corte da D-029.
 */
export default function ExemplosDoCompromisso({ exemplos, className = '' }: {
  /** Linhas de `compromisso_exemplos` com `transactions` embutido. */
  exemplos: any[];
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  if (exemplos.length === 0) return null;

  return (
    <div className={className}>
      <button
        onClick={() => setAberto(v => !v)}
        className="flex items-center gap-1 text-[11px] text-text-light hover:text-primary transition-colors"
        title="Transações que ensinam a IA a reconhecer este tipo"
      >
        <GraduationCap size={12} className="shrink-0" />
        {exemplos.length} exemplo{exemplos.length > 1 ? 's' : ''}
        {aberto ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {aberto && (
        <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
          {exemplos.map(e => (
            <div key={e.id ?? e.transaction_id} className="text-[11px] text-text-light truncate">
              {e.transactions?.data} · {e.transactions?.apelido || e.transactions?.nome}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
