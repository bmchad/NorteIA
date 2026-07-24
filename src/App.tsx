import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Pendentes from './pages/Pendentes';
import Meses from './pages/Meses';
import Parcelas from './pages/Parcelas';
import Perfil from './pages/Perfil';
import Fixos from './pages/Fixos';
import Historico from './pages/Historico';
import Layout from './components/Layout';
import type { Session } from '@supabase/supabase-js';

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
          <p className="mt-4 text-text-light font-medium">Carregando Balanço Geral...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Auth />} />
        
        {/* Protected Routes inside Layout */}
        <Route path="/dashboard" element={session ? <Layout><Dashboard /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/novos-registros" element={session ? <Layout><Pendentes /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/meses" element={session ? <Layout><Meses /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/historico" element={session ? <Layout><Historico /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/parcelas" element={session ? <Layout><Parcelas /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/fixos" element={session ? <Layout><Fixos /></Layout> : <Navigate to="/login" replace />} />
        <Route path="/perfil" element={session ? <Layout><Perfil /></Layout> : <Navigate to="/login" replace />} />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
