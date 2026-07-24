import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogIn, MapPin, Phone, Mail, ChevronDown, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('inicio');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [leadForm, setLeadForm] = useState({ nome: '', email: '', telefone: '' });
  const [leadStatus, setLeadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [leadStep, setLeadStep] = useState(1);

  // FAQs data
  const faqs = [
    {
      q: 'O que é o Balanço Geral?',
      a: 'Uma plataforma inteligente com IA integrada para automatizar sua gestão financeira pessoal e empresarial.'
    },
    {
      q: 'Como a IA funciona no aplicativo?',
      a: 'A IA lê automaticamente seus comprovantes, planilhas e extratos em imagem ou PDF, extraindo valores e datas sem que você precise digitar nada.'
    },
    {
      q: 'Meus dados estão seguros?',
      a: 'Sim, utilizamos autenticação robusta via Google e infraestrutura em nuvem segura para garantir a proteção de todas as suas informações.'
    },
    {
      q: 'É possível gerenciar gastos fixos e compras parceladas?',
      a: 'Com certeza. Temos módulos dedicados para projetar seus gastos fixos e agrupar inteligentemente suas parcelas, unificando a visão anual.'
    },
    {
      q: 'Vocês possuem integração com o Open Finance?',
      a: 'Em breve!'
    }
  ];

  // Scroll listener for header & active section
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);

      const sections = ['inicio', 'localizacao', 'faq', 'contato'];
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
            <span className="text-2xl font-bold text-text">Balanço Geral</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 font-medium text-text-light">
            <button onClick={() => scrollTo('inicio')} className={`transition-colors ${activeSection === 'inicio' ? 'text-primary font-bold' : 'hover:text-primary'}`}>Início</button>
            <button onClick={() => scrollTo('localizacao')} className={`transition-colors ${activeSection === 'localizacao' ? 'text-primary font-bold' : 'hover:text-primary'}`}>Localização</button>
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
            
            {/* Grid lines */}
            <path d="M0 100 H1200 M0 200 H1200 M0 300 H1200 M0 400 H1200 M0 500 H1200" stroke="currentColor" strokeWidth="1" strokeDasharray="5,5" className="opacity-20" />
            
            {/* Bars */}
            <rect x="100" y="400" width="80" height="100" fill="#0ea5e9" className="bar opacity-40" />
            <rect x="250" y="300" width="80" height="200" fill="#0ea5e9" className="bar opacity-40" />
            <rect x="400" y="350" width="80" height="150" fill="#0ea5e9" className="bar opacity-40" />
            <rect x="550" y="200" width="80" height="300" fill="#0ea5e9" className="bar opacity-40" />
            <rect x="700" y="250" width="80" height="250" fill="#0ea5e9" className="bar opacity-40" />
            <rect x="850" y="100" width="80" height="400" fill="#0ea5e9" className="bar opacity-40" />
            
            {/* Ascending Line & Arrow */}
            <path d="M 50 500 L 250 400 L 450 450 L 650 250 L 850 300 L 1100 100" fill="none" stroke="#0ea5e9" strokeWidth="8" className="chart-line" strokeLinecap="round" strokeLinejoin="round" />
            <polygon points="1120,90 1070,80 1090,120" fill="#0ea5e9" className="chart-area" />
          </svg>
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto flex flex-col items-center">
          <div className="bg-primary/10 p-5 rounded-3xl mb-8 animate-bounce-slow">
            <LayoutDashboard size={64} className="text-primary" />
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-text mb-6 tracking-tight">
            Balanço Geral
          </h1>
          <p className="text-2xl md:text-3xl text-text-light font-medium mb-12">
            Controle suas finanças. Controle sua vida. <br className="hidden md:block"/> Tudo em um só lugar.
          </p>
          <button 
            onClick={() => navigate('/login')}
            className="bg-primary hover:bg-primary-hover text-white text-xl font-bold py-4 px-10 rounded-2xl transition-all shadow-xl shadow-primary/30 hover:-translate-y-1"
          >
            Começar Agora
          </button>
        </div>
      </section>

      {/* Seção Localização */}
      <section id="localizacao" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-text mb-4">Onde Estamos</h2>
            <div className="w-24 h-1.5 bg-primary mx-auto rounded-full"></div>
          </div>
          
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            <div className="w-full lg:w-1/3 space-y-6">
              <div className="glass-panel p-8">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-primary/10 p-3 rounded-full shrink-0">
                    <MapPin className="text-primary" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-text mb-2">Endereço</h3>
                    <p className="text-text-light leading-relaxed">
                      Av. Pref. Telésforo Cândido de Rezende, 590 - Centro<br />
                      Conselheiro Lafaiete - MG<br />
                      CEP: 36400-076
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="w-full lg:w-2/3 h-[400px] rounded-2xl overflow-hidden shadow-glass-lg border border-border">
              <iframe 
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3725.687610664972!2d-43.76615552399222!3d-20.658824160759364!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xa38c71ccfdbf91%3A0xe67db50eddb86e24!2sAv.%20Pref.%20Tel%C3%A9sforo%20C%C3%A2ndido%20de%20Resende%2C%20590%20-%20Centro%2C%20Conselheiro%20Lafaiete%20-%20MG%2C%2036400-076!5e0!3m2!1spt-BR!2sbr!4v1700000000000!5m2!1spt-BR!2sbr" 
                width="100%" 
                height="100%" 
                style={{ border: 0 }} 
                allowFullScreen={true} 
                loading="lazy" 
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            </div>
          </div>
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
        {/* Background Animado (Gráfico Ascendente) */}
        <div className="absolute inset-0 z-0 opacity-30 pointer-events-none flex items-end justify-center">
          <svg className="w-full h-full" viewBox="0 0 1200 600" preserveAspectRatio="none">
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

        <div className="max-w-2xl mx-auto px-6 relative z-10">
          <div className="glass-panel p-8 md:p-12 shadow-2xl border-2 border-primary/40 rounded-3xl text-center bg-white/80 backdrop-blur-xl">
            <h3 className="text-3xl font-bold text-text mb-4">Pronto para transformar sua vida financeira?</h3>
            <p className="text-text-light mb-8">
              Deixe seu contato para conhecer todos os detalhes do Balanço Geral.
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
      
      {/* Footer minimalista */}
      <footer className="bg-text text-white py-8 text-center">
        <p className="text-white/60">© {new Date().getFullYear()} Balanço Geral. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
