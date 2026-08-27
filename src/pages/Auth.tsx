import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, AlertCircle } from 'lucide-react';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
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
      {/* Background Animado (Gráfico Ascendente) */}
      <div className="absolute inset-0 z-0 opacity-30 pointer-events-none flex items-end justify-center">
        <svg className="w-full h-full" viewBox="0 0 1200 600" preserveAspectRatio="none">
          <style>
            {`
              .chart-line {
                stroke-dasharray: 2000;
                stroke-dashoffset: 2000;
                animation: drawLine 4s ease-out infinite alternate;
              }
              .chart-area {
                animation: fadeInOut 4s ease-out infinite alternate;
              }
              @keyframes drawLine {
                0% { stroke-dashoffset: 2000; }
                100% { stroke-dashoffset: 0; }
              }
              @keyframes fadeInOut {
                0% { opacity: 0; transform: translateY(20px); }
                100% { opacity: 0.5; transform: translateY(0); }
              }
              .bar {
                transform-origin: bottom;
                animation: growBar 2s ease-out infinite alternate;
              }
              .bar:nth-child(2) { animation-delay: 0.2s; }
              .bar:nth-child(3) { animation-delay: 0.4s; }
              .bar:nth-child(4) { animation-delay: 0.6s; }
              .bar:nth-child(5) { animation-delay: 0.8s; }
              .bar:nth-child(6) { animation-delay: 1.0s; }
              @keyframes growBar {
                0% { transform: scaleY(0); }
                100% { transform: scaleY(1); }
              }
            `}
          </style>
          
          <path d="M0 100 H1200 M0 200 H1200 M0 300 H1200 M0 400 H1200 M0 500 H1200" stroke="currentColor" strokeWidth="1" strokeDasharray="5,5" className="opacity-20" />
          
          <rect x="100" y="400" width="80" height="100" fill="#0ea5e9" className="bar opacity-40" />
          <rect x="250" y="300" width="80" height="200" fill="#0ea5e9" className="bar opacity-40" />
          <rect x="400" y="350" width="80" height="150" fill="#0ea5e9" className="bar opacity-40" />
          <rect x="550" y="200" width="80" height="300" fill="#0ea5e9" className="bar opacity-40" />
          <rect x="700" y="250" width="80" height="250" fill="#0ea5e9" className="bar opacity-40" />
          <rect x="850" y="100" width="80" height="400" fill="#0ea5e9" className="bar opacity-40" />
          
          <path d="M 50 500 L 250 400 L 450 450 L 650 250 L 850 300 L 1100 100" fill="none" stroke="#0ea5e9" strokeWidth="8" className="chart-line" strokeLinecap="round" strokeLinejoin="round" />
          <polygon points="1120,90 1070,80 1090,120" fill="#0ea5e9" className="chart-area" />
        </svg>
      </div>
      
      <div className="glass-panel w-full max-w-md p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary/10 p-3 rounded-2xl mb-4">
            <LayoutDashboard size={40} className="text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-text mb-2">Balanço Geral</h1>
          <p className="text-text-light text-center">
            Inteligência artificial para sua gestão financeira
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
          className="w-full bg-white hover:bg-gray-50 text-text font-medium py-3 px-4 rounded-xl transition-all shadow-md border border-border flex justify-center items-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
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
