import { X } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel}></div>
      <div className="glass-panel w-full max-w-sm relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden shadow-2xl bg-white/90">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-bold text-text">{title}</h3>
            <button onClick={onCancel} className="text-text-light hover:text-danger transition-colors bg-white/50 rounded-full p-1">
              <X size={20} />
            </button>
          </div>
          <p className="text-text-light mb-8 font-medium">
            {message}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 font-medium text-text bg-black/5 hover:bg-black/10 rounded-xl transition-colors"
            >
              Não
            </button>
            <button
              onClick={() => {
                onConfirm();
                onCancel();
              }}
              className="px-6 py-2 font-bold bg-danger text-white hover:bg-danger/90 rounded-xl transition-colors shadow-lg shadow-danger/25"
            >
              Sim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
