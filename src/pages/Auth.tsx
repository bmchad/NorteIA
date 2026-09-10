import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Marca from '../components/Marca';
import { ENTRADA } from '../lib/rotas';
import GraficoDecorativo from '../components/GraficoDecorativo';

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${ENTRADA}`
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao conectar com o Google.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <GraficoDecorativo />
      
      {/* ⭐ `painel-estrutural` (2px floresta) é opt-in e mora em 3 lugares no projeto: aqui,
          no número de "Comprometido por mês" e no card de lead da landing. É o cartão que É a
          resposta da tela — nesta, ele é o único elemento. */}
      <div className="glass-panel painel-estrutural w-full max-w-md p-8 relative z-10">
        {/* ⚠️ Sem isto o login é um beco: quem chega aqui por engano só sai pelo botão do
            navegador, e num app instalado como PWA nem isso existe. */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-text-light hover:text-text hover:underline transition-colors mb-6"
        >
          <ArrowLeft size={16} /> Voltar
        </button>

        <div className="flex flex-col items-center mb-8">
          <img src="/norteia-simbolo.png" alt="" className="h-20 w-20 mb-4" />
          <h1 className="text-3xl font-bold text-text mb-2"><Marca /></h1>
          <p className="text-text-light text-center">
            Quanto do seu dinheiro já tem dono
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="text-danger shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-danger-hover">{error}</p>
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          /**
           * ⛔ EXCEÇÃO DE MARCA — não aplique a paleta do NorteIA aqui.
           * As diretrizes do Google exigem superfície branca (ou #131314) e traço neutro
           * #747775 no botão de login. Os quatro `fill` do logo abaixo são intocáveis pela
           * mesma razão. Uma varredura de cor que "conserta" este botão quebra a
           * conformidade — daí este comentário.
           */
          className="w-full bg-white hover:bg-[#F2F2F2] text-text font-medium py-3 px-4 rounded-xl transition-all shadow-md border border-[#747775] flex justify-center items-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuar com o Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}
