import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CreditCard, Trash2, ListChecks, ChevronDown, ChevronUp } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

export default function Parcelas() {
  const [parcelas, setParcelas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

  const toggleExpand = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    fetchParcelas();
  }, []);

  const fetchParcelas = async () => {
    setLoading(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('pendente', false)
        .not('parcela_total', 'is', null) // Traz apenas transações que têm um total de parcelas definido
        .order('data', { ascending: false });

      if (error) throw error;
      setParcelas(data || []);
    } catch (error) {
      console.error("Erro ao buscar parcelas:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteGroup = async (group: any[]) => {
    const baseName = group[0].apelido || group[0].nome;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Parcelas',
      message: `Tem certeza que deseja excluir TODAS as ${group.length} parcelas pagas de "${baseName}"?`,
      onConfirm: async () => {
        try {
          const idsToDelete = group.map(t => t.id);
          const { error } = await supabase
            .from('transactions')
            .delete()
            .in('id', idsToDelete);

          if (error) throw error;
          setParcelas(prev => prev.filter(t => !idsToDelete.includes(t.id)));
        } catch (error) {
          console.error("Erro ao excluir:", error);
          alert("Erro ao excluir parcelas.");
        }
      }
    });
  };

  const isSameBillingDay = (date1: string, date2: string) => {
    const d1 = parseInt(date1.split('-')[2], 10);
    const d2 = parseInt(date2.split('-')[2], 10);
    const m1 = parseInt(date1.split('-')[1], 10);
    const y1 = parseInt(date1.split('-')[0], 10);
    const m2 = parseInt(date2.split('-')[1], 10);
    const y2 = parseInt(date2.split('-')[0], 10);

    if (Math.abs(d1 - d2) <= 2) return true;
    if (d1 >= 28 && d2 >= 28) return true;

    const checkWrap = (y: number, m: number, d: number, targetD: number) => {
      for (let offset = -2; offset <= 2; offset++) {
        const testDate = new Date(y, m - 1, d + offset);
        if (testDate.getDate() === targetD) return true;
      }
      return false;
    };

    if (checkWrap(y1, m1, d1, d2)) return true;
    if (checkWrap(y2, m2, d2, d1)) return true;

    return false;
  };

  const groupParcelas = () => {
    const groups: any[][] = [];
    parcelas.forEach(p => {
      const valorStr = Math.abs(Number(p.valor)).toFixed(2);
      const pTotal = p.parcela_total || 1;

      let foundGroup = groups.find(group => {
        const baseItem = group[0];
        const baseValor = Math.abs(Number(baseItem.valor)).toFixed(2);
        const baseTotal = baseItem.parcela_total || 1;

        if (valorStr === baseValor && pTotal === baseTotal) {
          return isSameBillingDay(p.data, baseItem.data);
        }
        return false;
      });

      if (foundGroup) {
        foundGroup.push(p);
      } else {
        groups.push([p]);
      }
    });

    const record: Record<string, any[]> = {};
    groups.forEach(g => {
      record[g[0].id] = g;
    });
    return record;
  };

  const groupedParcelas = groupParcelas();
  const groupKeys = Object.keys(groupedParcelas);

  // Separar em dois grupos: Em andamento e Concluídas
  const emAndamentoKeys: string[] = [];
  const concluidasKeys: string[] = [];

  groupKeys.forEach(nomeKey => {
    const group = groupedParcelas[nomeKey];
    const baseItem = group[0];
    const current = group.length;
    const total = baseItem.parcela_total || 1;

    if (current >= total) {
      concluidasKeys.push(nomeKey);
    } else {
      emAndamentoKeys.push(nomeKey);
    }
  });

  const renderCard = (nomeKey: string) => {
    const group = groupedParcelas[nomeKey];
    const baseItem = group[0];
    const current = group.length;
    const total = baseItem.parcela_total || 1;
    const percentage = Math.min((current / total) * 100, 100);

    const valorParcela = Math.abs(Number(baseItem.valor));
    const valorTotalCompra = valorParcela * total;
    const valorPago = valorParcela * current;

    const isCompleted = current >= total;

    return (
      <div
        key={nomeKey}
        className={`glass-panel p-6 flex flex-col gap-4 relative overflow-hidden group/card border-t-4 transition-all duration-300 ${isCompleted
            ? 'border-t-[#10b981] hover:border-t-[#059669] bg-[#10b981]/[0.01]'
            : 'border-t-transparent hover:border-t-primary'
          }`}
      >
        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover/card:opacity-100 transition-opacity">
          <button
            onClick={() => deleteGroup(group)}
            className="text-text-light hover:text-danger p-2 bg-white rounded-full shadow-md transition-all"
            title="Excluir Todo o Grupo"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <ListChecks size={14} className={isCompleted ? 'text-[#10b981]' : 'text-primary'} />
            <span className="text-[10px] text-text-light font-bold uppercase tracking-wider">Última Entrada: {baseItem.data}</span>
          </div>
          <h3 className="font-bold text-lg text-text leading-tight">{baseItem.apelido || baseItem.nome}</h3>
          {baseItem.apelido && baseItem.apelido !== baseItem.nome && (
            <div className="text-[10px] text-text-light/70 break-words whitespace-normal leading-tight mt-0.5" title={baseItem.nome}>
              Original: {baseItem.nome}
            </div>
          )}
          {baseItem.banco && (
            <div className={`text-sm mt-1 font-medium ${isCompleted ? 'text-[#10b981]' : 'text-primary'}`}>
              {baseItem.banco}
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 border-t border-border">
          <div className="flex justify-between items-end mb-2">
            <div>
              <span className="text-xs text-text-light uppercase block">Valor da Parcela</span>
              <span className="font-bold text-danger text-lg">R$ {valorParcela.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-text-light uppercase block">Progresso Real</span>
              <span className={`font-bold text-lg ${isCompleted ? 'text-[#10b981]' : 'text-text'}`}>
                {current} de {total}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ease-out ${isCompleted ? 'bg-[#10b981]' : 'bg-primary/70'}`}
              style={{ width: `${percentage}%` }}
            ></div>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <div className="text-xs text-text-light flex justify-between items-center">
              <span>Valor Pago:</span>
              <span className={`font-medium ${isCompleted ? 'text-[#10b981]' : 'text-primary'}`}>R$ {valorPago.toFixed(2)}</span>
            </div>
            <div className="text-xs text-text-light flex justify-between items-center">
              <span>Valor Total:</span>
              <span className="font-medium text-text">R$ {valorTotalCompra.toFixed(2)}</span>
            </div>
          </div>

          {/* Botão de Expandir Histórico */}
          <button
            onClick={() => toggleExpand(nomeKey)}
            className={`mt-4 w-full flex items-center justify-center gap-1 text-xs font-bold transition-colors py-2 border-t border-border/50 ${isCompleted ? 'text-[#10b981] hover:text-[#059669]' : 'text-primary hover:text-primary-hover'
              }`}
          >
            {expandedGroups[nomeKey] ? (
              <><ChevronUp size={14} /> Ocultar Histórico</>
            ) : (
              <><ChevronDown size={14} /> Ver Parcelas Pagas</>
            )}
          </button>

          {/* Lista de Parcelas Pagas (Expansível) */}
          {expandedGroups[nomeKey] && (
            <div className={`mt-2 flex flex-col gap-2 p-3 rounded-lg border ${isCompleted ? 'bg-[#10b981]/5 border-[#10b981]/10' : 'bg-primary/5 border-primary/10'
              }`}>
              <h4 className="text-[10px] font-bold text-text-light uppercase tracking-wider mb-1">Histórico de Pagamentos</h4>
              {group.map((transacao) => (
                <div key={transacao.id} className="flex justify-between items-center text-xs border-b border-border/30 pb-1 last:border-0 last:pb-0">
                  <div>
                    <span className="font-medium text-text">{transacao.data}</span>
                    <span className="text-[10px] text-text-light ml-2">({transacao.nome})</span>
                  </div>
                  <span className={`font-bold ${isCompleted ? 'text-[#10b981]' : 'text-primary'}`}>R$ {Math.abs(Number(transacao.valor)).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
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
      <header>
        <h2 className="text-3xl font-bold text-text flex items-center gap-3">
          <CreditCard size={32} className="text-primary" /> Minhas Parcelas
        </h2>
        <p className="text-text-light mt-1">
          Acompanhe aqui o andamento das suas compras parceladas! <br />
          Elas são agrupadas pelo valor, quantidade total de parcelas e dia da cobrança. Se estiverem desagrupadas, ajuste a quantidade total ou o valor em "Balanços Mensais".
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : groupKeys.length === 0 ? (
        <div className="glass-panel p-12 text-center text-text-light">
          Você não possui nenhuma compra parcelada registrada.
        </div>
      ) : (
        <div className="space-y-10">
          {/* Seção: Em Andamento */}
          <div>
            <h3 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
              Em Andamento
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium ml-1">
                {emAndamentoKeys.length}
              </span>
            </h3>

            {emAndamentoKeys.length === 0 ? (
              <div className="glass-panel p-8 text-center text-text-light bg-white/20">
                Não há parcelas em andamento
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                {emAndamentoKeys.map(nomeKey => renderCard(nomeKey))}
              </div>
            )}
          </div>

          {/* Seção: Concluídas */}
          <div>
            <h3 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
              Concluídas
              <span className="text-xs bg-[#10b981]/10 text-[#10b981] px-2 py-0.5 rounded-full font-medium ml-1">
                {concluidasKeys.length}
              </span>
            </h3>

            {concluidasKeys.length === 0 ? (
              <div className="glass-panel p-8 text-center text-text-light bg-white/20">
                Não há parcelas concluídas
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                {concluidasKeys.map(nomeKey => renderCard(nomeKey))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
