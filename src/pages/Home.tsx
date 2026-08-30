import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogIn, ChevronDown, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import GraficoDecorativo from '../components/GraficoDecorativo';

export default function Home() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('inicio');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [leadForm, setLeadForm] = useState({ nome: '', email: '', telefone: '' });
  const [leadStatus, setLeadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [leadStep, setLeadStep] = useState(1);

  /**
   * ⭐ As perguntas seguem a tese do produto, não a lista de funcionalidades: comprometido →
   * o que sobra → como você gasta o que sobra. Um FAQ que enumera recursos responde "o que
   * ele faz"; este responde "o que muda para mim".
   */
  const faqs = [
    {
      q: 'O que é o Assistente Itaú?',
      a: 'Uma plataforma que responde uma pergunta antes de qualquer outra: quanto do seu dinheiro já tem dono. Parcela que ainda corre, assinatura que renova, mercado que você vai fazer de todo jeito — o que sobra depois disso é o que você realmente decide.'
    },
    {
      q: 'Por que separar os compromissos em três camadas?',
      a: 'Porque somar tudo num número só esconde o que dá para mudar. Parcela é dívida contratada e tem data de fim; assinatura dá para cancelar hoje; mercado e combustível você vai gastar de qualquer forma. Misturar os três dá um total certo e inútil.'
    },
    {
      q: 'Preciso cadastrar meus gastos fixos na mão?',
      a: 'Não. Depois de três cobranças iguais, a plataforma reconhece a recorrência sozinha e propõe — mostrando os lançamentos que geraram a proposta, para você aceitar ou recusar sabendo o porquê.'
    },
    {
      q: 'Como a IA entra nisso?',
      a: 'Ela lê extratos e faturas em imagem, PDF ou planilha e extrai as transações sem digitação. Mas a maior parte das decisões é determinística: o que você já confirmou uma vez não volta para a IA, e por isso o resultado não muda sozinho entre importações.'
    },
    {
      q: 'O mês da plataforma é o mês do calendário?',
      a: 'Só se você quiser. O ciclo é ancorado no dia em que seu dinheiro entra — se você recebe no dia 5, seu mês vai do dia 6 ao dia 5 seguinte. É o que faz o balanço bater com a vida real de quem tem fatura fechando no meio do mês.'
    },
    {
      q: 'Meus dados estão seguros?',
      a: 'A autenticação é via Google e cada usuário só enxerga as próprias linhas, isolamento garantido no banco e não apenas na tela. As chaves de IA vivem no servidor: o navegador nunca fala direto com o modelo.'
    },
    {
      q: 'Já dá para conectar com Open Finance?',
      a: 'Ainda não. Hoje a entrada é por extrato, fatura ou planilha que você envia.'
    }
  ];

  // Scroll listener for header & active section
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);

      const sections = ['inicio', 'faq', 'contato'];
      let current = 'inicio';
      for (const section of sections) {
        const el = document.getElementById(section);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= window.innerHeight / 2.5) {
            current = section;
          }
        }
      }
      setActiveSection(current);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeadStatus('loading');
    try {
      const { error } = await supabase.from('leads').insert([
        {
          nome: leadForm.nome,
          email: leadForm.email,
          telefone: leadForm.telefone
        }
      ]);
      if (error) throw error;
      setLeadStatus('success');
      setLeadForm({ nome: '', email: '', telefone: '' });
      setTimeout(() => setLeadStatus('idle'), 5000);
    } catch (error) {
      console.error('Erro ao salvar lead:', error);
      setLeadStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans text-text overflow-x-hidden">
      {/* Header Fixo */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-white/90 backdrop-blur-md shadow-glass-lg py-3' : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
            <div className="bg-primary/10 p-2 rounded-xl">
              <LayoutDashboard size={24} className="text-primary" />
            </div>
            <span className="text-2xl font-bold text-text">Assistente Itaú</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 font-medium text-text-light">
            <button onClick={() => scrollTo('inicio')} className={`transition-colors ${activeSection === 'inicio' ? 'text-primary font-bold' : 'hover:text-primary'}`}>Início</button>
            <button onClick={() => scrollTo('faq')} className={`transition-colors ${activeSection === 'faq' ? 'text-primary font-bold' : 'hover:text-primary'}`}>FAQ</button>
            <button onClick={() => scrollTo('contato')} className={`transition-colors ${activeSection === 'contato' ? 'text-primary font-bold' : 'hover:text-primary'}`}>Contato</button>
          </nav>

          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-primary/30"
          >
            <LogIn size={18} /> Entrar
          </button>
        </div>
      </header>

      {/* Seção Início */}
      <section id="inicio" className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
        <GraficoDecorativo />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto flex flex-col items-center">
          <div className="bg-primary/10 p-5 rounded-3xl mb-8 animate-bounce-slow">
            <LayoutDashboard size={64} className="text-primary" />
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-text mb-6 tracking-tight">
            Assistente Itaú
          </h1>
          {/* ⭐ A promessa é a tese, não a funcionalidade: primeiro o que já tem dono,
              depois o que sobra. */}
          <p className="text-2xl md:text-3xl text-text-light font-medium mb-12">
            Descubra quanto do seu dinheiro já tem dono. <br className="hidden md:block"/>
            O que sobra é o que você decide.
          </p>
          <button 
            onClick={() => navigate('/login')}
            className="bg-primary hover:bg-primary-hover text-white text-xl font-bold py-4 px-10 rounded-2xl transition-all shadow-xl shadow-primary/30 hover:-translate-y-1"
          >
            Começar Agora
          </button>
        </div>
      </section>

      {/* Seção FAQ */}
      <section id="faq" className="py-24 bg-background">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-text mb-4">Perguntas Frequentes</h2>
            <div className="w-24 h-1.5 bg-primary mx-auto rounded-full"></div>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className="glass-panel overflow-hidden transition-all duration-300"
              >
                <button
                  className="w-full px-6 py-5 text-left flex items-center justify-between focus:outline-none"
                  onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                >
                  <span className="text-lg font-bold text-text">{faq.q}</span>
                  <ChevronDown 
                    className={`text-primary transition-transform duration-300 ${activeFaq === index ? 'rotate-180' : ''}`} 
                    size={24} 
                  />
                </button>
                <div 
                  className={`px-6 overflow-hidden transition-all duration-300 ${activeFaq === index ? 'max-h-40 pb-5 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <p className="text-text-light">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seção Contato / Lead */}
      <section id="contato" className="py-24 bg-background relative overflow-hidden">
        <GraficoDecorativo />

        <div className="max-w-2xl mx-auto px-6 relative z-10">
          <div className="glass-panel p-8 md:p-12 shadow-2xl border-2 border-primary/40 rounded-3xl text-center bg-white/80 backdrop-blur-xl">
            <h3 className="text-3xl font-bold text-text mb-4">Pronto para saber o que sobra?</h3>
            <p className="text-text-light mb-8">
              Deixe seu contato para conhecer todos os detalhes do Assistente Itaú.
            </p>
            
            {leadStatus === 'success' ? (
              <div className="bg-green-50 border border-green-200 p-6 rounded-xl flex flex-col items-center text-center animate-fade-in">
                <CheckCircle size={48} className="text-green-500 mb-4" />
                <h4 className="text-xl font-bold text-green-800 mb-2">Enviado com sucesso!</h4>
                <p className="text-green-700">Obrigado pelo interesse. Em breve entraremos em contato.</p>
                <button onClick={() => { setLeadStatus('idle'); setLeadStep(1); }} className="mt-6 text-green-600 font-medium hover:underline">
                  Enviar outro
                </button>
              </div>
            ) : (
              <div className="overflow-hidden relative w-full pb-2">
                <div 
                  className="flex transition-transform duration-500 ease-in-out w-[300%]"
                  style={{ transform: `translateX(-${(leadStep - 1) * 33.333}%)` }}
                >
                  {/* Step 1: Nome */}
                  <div className="w-1/3 px-2">
                    <form onSubmit={(e) => { e.preventDefault(); if (leadForm.nome.length > 2) setLeadStep(2); }}>
                      <label className="block text-left text-sm font-medium text-text mb-2">Como podemos te chamar?</label>
                      <input
                        type="text"
                        required
                        value={leadForm.nome}
                        onChange={e => setLeadForm({...leadForm, nome: e.target.value})}
                        className="glass-input w-full bg-background mb-4"
                        placeholder="Seu nome completo"
                      />
                      <button type="submit" className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-primary/30">Continuar</button>
                    </form>
                  </div>

                  {/* Step 2: Email */}
                  <div className="w-1/3 px-2">
                    <form onSubmit={(e) => { e.preventDefault(); if (leadForm.email.includes('@')) setLeadStep(3); }}>
                      <label className="block text-left text-sm font-medium text-text mb-2">Qual seu melhor e-mail?</label>
                      <input
                        type="email"
                        required
                        value={leadForm.email}
                        onChange={e => setLeadForm({...leadForm, email: e.target.value})}
                        className="glass-input w-full bg-background mb-4"
                        placeholder="seu@email.com"
                      />
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setLeadStep(1)} className="w-1/3 bg-gray-100 hover:bg-gray-200 text-text font-bold py-3 px-4 rounded-xl border border-border transition-colors">Voltar</button>
                        <button type="submit" className="w-2/3 bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-primary/30">Continuar</button>
                      </div>
                    </form>
                  </div>

                  {/* Step 3: Telefone */}
                  <div className="w-1/3 px-2">
                    <form onSubmit={handleLeadSubmit}>
                      <label className="block text-left text-sm font-medium text-text mb-2">Telefone (opcional)</label>
                      <input
                        type="tel"
                        value={leadForm.telefone}
                        onChange={e => setLeadForm({...leadForm, telefone: e.target.value})}
                        className="glass-input w-full bg-background mb-4"
                        placeholder="(31) 90000-0000"
                      />
                      {leadStatus === 'error' && (
                        <p className="text-danger text-sm font-medium mb-3 text-left">Erro ao enviar. Tente novamente.</p>
                      )}
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setLeadStep(2)} className="w-1/3 bg-gray-100 hover:bg-gray-200 text-text font-bold py-3 px-4 rounded-xl border border-border transition-colors">Voltar</button>
                        <button type="submit" disabled={leadStatus === 'loading'} className="w-2/3 bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-primary/30 disabled:opacity-70">
                          {leadStatus === 'loading' ? 'Enviando...' : 'Finalizar'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      
      {/* ⚠️ O aviso não é rodapé decorativo: a página usa o nome e a cor do Itaú, e sem
          dizer que é protótipo de hackathon ela se passa por produto oficial. */}
      <footer className="bg-text text-white py-8 px-6 text-center">
        <p className="text-white/70 max-w-2xl mx-auto">
          Protótipo desenvolvido para o <strong className="text-white">InovaCamp WI</strong> do Itaú.
        </p>
        <p className="text-white/50 text-sm mt-2 max-w-2xl mx-auto">
          Não é um produto oficial do Itaú Unibanco, não tem vínculo com o banco e não está
          associado a nenhum serviço dele. Nome e identidade visual são usados apenas no
          contexto do desafio.
        </p>
        <p className="text-white/40 text-xs mt-4">© {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
