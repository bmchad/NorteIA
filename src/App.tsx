import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Pendentes from './pages/Pendentes';
import Meses from './pages/Meses';
import Perfil from './pages/Perfil';
import Compromissos from './pages/Compromissos';
import Historico from './pages/Historico';
import Layout from './components/Layout';
import type { Session } from '@supabase/supabase-js';
import { ENTRADA } from './lib/rotas';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <p className="mt-4 text-text-light font-medium">Carregando Assistente Itaú...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* ⭐ Entrar cai em /compromissos: é a tela que responde "quanto do meu dinheiro
            já tem dono", e é essa a resposta que muda uma decisão hoje. */}
        <Route path="/login" element={session ? <Navigate to={ENTRADA} replace /> : <Auth />} />
        
        {/* Protected Routes inside Layout */}
        <Route path="/dashboard" element={session ? <Layout><Dashboard /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/novos-registros" element={session ? <Layout><Pendentes /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/meses" element={session ? <Layout><Meses /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/historico" element={session ? <Layout><Historico /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/compromissos" element={session ? <Layout><Compromissos /></Layout> : <Navigate to="/login" replace />} />
        {/* ⚠️ Link salvo não pode morrer: as duas telas viraram uma. */}
        <Route path="/parcelas" element={<Navigate to="/compromissos" replace />} />
        <Route path="/fixos" element={<Navigate to="/compromissos" replace />} />
        <Route path="/perfil" element={session ? <Layout><Perfil /></Layout> : <Navigate to="/login" replace />} />
        
        {/* ⚠️ /dashboard continua existindo e continua linkável — o que mudou foi para
            onde se cai ao entrar, não o mapa de rotas. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
