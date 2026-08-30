import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, Clock, Calendar, LogOut, User, Layers, History } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  /**
   * ⭐ A ordem é a da pergunta que a plataforma responde: quanto já tem dono, o que sobra,
   * como você gasta o que sobra. Compromissos primeiro porque é o número que muda a decisão
   * de hoje; histórico por último porque é consulta, não decisão.
   */
  const navItems = [
    { name: 'Compromissos', path: '/compromissos', icon: Layers },
    { name: 'Dashboard Anual', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Balanços Mensais', path: '/meses', icon: Calendar },
    { name: 'Novos Registros', path: '/novos-registros', icon: Clock },
    { name: 'Histórico', path: '/historico', icon: History },
  ];

  /**
   * ⭐ `tema-plataforma` troca as variáveis de cor de texto para azul. Vale para tudo que
   * está dentro do Layout, e só para isso — landing e login herdam o `:root` e ficam com o
   * texto neutro. Ver src/index.css.
   */
  return (
    <div className="tema-plataforma min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col shadow-sm hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <span className="bg-primary/10 p-1.5 rounded-lg">
              <LayoutDashboard size={20} className="text-primary" />
            </span>
            Assistente Itaú
          </h1>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive
                  ? 'bg-primary-hover text-white shadow-md shadow-primary/20'
                  : 'text-text-light hover:bg-background hover:text-primary'
                }`
              }
            >
              <item.icon size={20} />
              <span className="font-medium">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border flex flex-col gap-2">
          <NavLink
            to="/perfil"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive
                ? 'bg-primary-hover text-white shadow-md shadow-primary/20'
                : 'text-text-light hover:bg-background hover:text-primary'
              }`
            }
          >
            <User size={20} />
            <span className="font-medium">Perfil</span>
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-danger hover:bg-danger/10 transition-colors font-medium"
          >
            <LogOut size={20} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 md:hidden shadow-sm">
          <h1 className="text-lg font-bold text-primary">Assistente Itaú</h1>
          {/* Add mobile menu toggle here if needed */}
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto w-full h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
