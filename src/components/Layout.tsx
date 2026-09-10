import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, Clock, Calendar, LogOut, User, Layers, History, CalendarClock } from 'lucide-react';
import Marca from './Marca';

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
   * ⭐ A ordem é a da pergunta que a plataforma responde: quanto já tem dono, **quando** ele
   * sai, o que sobra, como você gasta o que sobra. Compromissos primeiro porque é o número
   * que muda a decisão de hoje; histórico por último porque é consulta, não decisão.
   *
   * ⭐ Mercado de Datas é a mesma pergunta de Compromissos virada de lado — lá se vê quanto do
   * mês já tem dono, aqui em que dia esse dono cobra —, mas fica **abaixo** do Dashboard Anual:
   * ele responde por um mês, e o Dashboard é o retrato do ano. Quem abre o produto quer o
   * panorama antes do detalhe de datas.
   */
  const navItems = [
    { name: 'Compromissos', path: '/compromissos', icon: Layers },
    { name: 'Dashboard Anual', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Mercado de Datas', path: '/mercado-de-datas', icon: CalendarClock },
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
      {/* ⭐ A barra é a PRÓPRIA TELA, não um painel sobre ela: mesmo `bg-background` do
          conteúdo. Ela deixou de ser a maior superfície branca do produto — os cartões é que
          flutuam agora, e a navegação se distingue por posição e espaço, não por superfície.
          ⚠️ Sem fio à direita e sem sombra, e agora por um motivo diferente do de antes: não
          há mais degrau nenhum a marcar (barra e conteúdo são a mesma cor, 1:1). A sombra
          preta do `shadow-sm` sobre um fundo cromático dessatura o verde e vira auréola.
          ⭐ Se a falta de fronteira incomodar, o único valor que funciona ali é o floresta:
          `border-r border-moldura`, 4,82:1. Sálvia 500 daria 1,31:1 e não separaria nada. */}
      <aside className="w-64 bg-background flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-moldura">
          {/* ⛔ Era `text-primary` com o ícone num chip `bg-primary/10`. Sobre a barra sálvia
              o laranja dá 1,28:1 — a palavra sumia — e o chip a 10% era imperceptível.
              ⭐ A palavra vai para floresta (6,45:1) e o chip vira laranja SÓLIDO com ícone
              branco: o laranja continua no logo, como bloco, que é o papel que a paleta dá
              a ele. Mesmo movimento do ícone do hero na landing. */}
          {/* ⭐ O símbolo é o arquivo, não um ícone da lucide: ele já carrega o laranja da
              marca, então o chip laranja que existia aqui saiu — eram dois laranjas empilhados.
              `alt=""` de propósito: o wordmark ao lado já diz o nome, e repetir faria o leitor
              de tela anunciar "NorteIA NorteIA". */}
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            <img src="/norteia-simbolo.png" alt="" className="h-9 w-9 shrink-0" />
            <Marca />
          </h1>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl border-l-[3px] transition-all duration-200 ${isActive
                  ? 'bg-text text-surface border-primary shadow-glass'
                  : 'text-text border-transparent hover:bg-realce'
                }`
              }
            >
              <item.icon size={20} />
              <span className="font-medium">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-moldura flex flex-col gap-2">
          <NavLink
            to="/perfil"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl border-l-[3px] transition-all duration-200 ${isActive
                ? 'bg-text text-surface border-primary shadow-glass'
                : 'text-text border-transparent hover:bg-realce'
              }`
            }
          >
            <User size={20} />
            <span className="font-medium">Perfil</span>
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-danger-hover hover:bg-danger hover:text-white transition-colors font-medium"
          >
            <LogOut size={20} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        {/* ⭐ Acompanha a barra: é a mesma superfície noutro viewport, e deixá-la em papel
            faria o mobile destoar do desktop. Aqui a sombra FICA — este header flutua sobre o
            conteúdo que rola por baixo —, mas é a `shadow-glass` (floresta), porque a preta
            do `shadow-sm` não lê sobre sálvia. */}
        <header className="h-16 bg-background border-b border-moldura flex items-center justify-between px-4 md:hidden shadow-glass">
          <h1 className="text-lg font-bold text-text flex items-center gap-2">
            <img src="/norteia-simbolo.png" alt="" className="h-8 w-8 shrink-0" />
            <Marca />
          </h1>
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
