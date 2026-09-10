import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ChevronDown, CheckCircle } from 'lucide-react';
import Marca from '../components/Marca';
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
      q: 'O que é o NorteIA?',
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
    <div className="min-h-screen bg-background font-sans text-text overflow-x-hidden pb-24">
      {/* Header Fixo */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-surface/90 backdrop-blur-md shadow-glass-lg py-3' : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
            {/* ⭐ O símbolo entra sem pastilha atrás: a imagem tem fundo transparente, então
                ela funciona tanto sobre o hero sálvia (header transparente) quanto sobre o papel
                (header rolado), sem precisar de um tile que sirva de base para os dois. */}
            <img src="/norteia-simbolo.png" alt="" className="h-10 w-10 shrink-0" />
            <Marca className="text-2xl font-bold text-text" />
          </div>

          {/* ⛔ O item ativo era `text-primary`, e este nav fica sobre o hero sálvia enquanto o
              header é transparente: laranja sobre #9BB08D é 1,28:1 — ilegível, o pior caso de
              laranja pequeno do projeto.
              ⭐ O laranja continua marcando o ativo, mas como FIO de 2px embaixo, que é o papel
              que a paleta dá a ele. O texto vai para floresta (4,82:1 sobre sálvia). O inativo
              carrega `border-transparent` para a linha de base não pular no hover. */}
          <nav className="hidden md:flex items-center gap-8 font-medium text-text">
            <button onClick={() => scrollTo('inicio')} className={`pb-1 border-b-2 transition-colors ${activeSection === 'inicio' ? 'font-bold border-primary' : 'border-transparent hover:border-primary/60'}`}>Início</button>
            <button onClick={() => scrollTo('faq')} className={`pb-1 border-b-2 transition-colors ${activeSection === 'faq' ? 'font-bold border-primary' : 'border-transparent hover:border-primary/60'}`}>FAQ</button>
            <button onClick={() => scrollTo('contato')} className={`pb-1 border-b-2 transition-colors ${activeSection === 'contato' ? 'font-bold border-primary' : 'border-transparent hover:border-primary/60'}`}>Contato</button>
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
          {/* ⭐ Aqui a marca é a LOGO INTEIRA, um arquivo só — o símbolo e o wordmark que
              existiam separados viraram a imagem. É o único lugar do produto onde ela aparece
              completa, e é o que justifica a versão com o nome desenhado.
              ⚠️ O `alt` carrega o nome porque este `<h1>` não tem mais texto: sem ele a landing
              fica com um cabeçalho vazio para leitor de tela e para busca. */}
          <h1 className="mb-6 w-full">
            <img
              src="/norteia-logo.png"
              alt="NorteIA"
              className="w-full max-w-sm md:max-w-lg mx-auto"
            />
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
                    className={`text-text transition-transform duration-300 ${activeFaq === index ? 'rotate-180' : ''}`} 
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
          {/* ⭐ A moldura laranja de 2px é a exceção deliberada ao fio estrutural floresta: este é
              o único cartão da página com ação própria. Sólida, não a 40% — sobre papel o
              laranja diluído virava um contorno fantasma. */}
          <div className="glass-panel p-8 md:p-12 shadow-2xl border-2 border-primary rounded-3xl text-center bg-surface backdrop-blur-xl">
            <h3 className="text-3xl font-bold text-text mb-4">Pronto para saber o que sobra?</h3>
            <p className="text-text-light mb-8">
              Deixe seu contato para conhecer todos os detalhes do NorteIA.
            </p>
            
            {leadStatus === 'success' ? (
              /* ⛔ Este bloco era `bg-green-50` com texto `text-green-800`. Numa paleta em que a
                 tela E o texto já são verdes, verde deixa de ser sinal e vira ruído — o estado de
                 sucesso ficaria indistinguível do resto da página.
                 ⭐ Invertido: painel floresta sólido dentro do cartão de papel, que é o "cartão
                 escuro" da paleta. Sucesso passa a significar "isto virou um bloco fechado", e
                 não precisa de cor própria para dizer isso. */
              <div className="bg-text border border-text p-6 rounded-xl flex flex-col items-center text-center animate-fade-in">
                <CheckCircle size={48} className="text-background mb-4" />
                <h4 className="text-xl font-bold text-surface mb-2">Enviado com sucesso!</h4>
                <p className="text-superficie-forte">Obrigado pelo interesse. Em breve entraremos em contato.</p>
                <button onClick={() => { setLeadStatus('idle'); setLeadStep(1); }} className="mt-6 text-primary-clara font-medium hover:underline">
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
                        className="glass-input w-full mb-4"
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
                        className="glass-input w-full mb-4"
                        placeholder="seu@email.com"
                      />
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setLeadStep(1)} className="w-1/3 bg-superficie hover:bg-superficie-forte text-text font-bold py-3 px-4 rounded-xl border border-border transition-colors">Voltar</button>
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
                        className="glass-input w-full mb-4"
                        placeholder="(31) 90000-0000"
                      />
                      {leadStatus === 'error' && (
                        <p className="text-danger text-sm font-medium mb-3 text-left">Erro ao enviar. Tente novamente.</p>
                      )}
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setLeadStep(2)} className="w-1/3 bg-superficie hover:bg-superficie-forte text-text font-bold py-3 px-4 rounded-xl border border-border transition-colors">Voltar</button>
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
      
      {/* ⚠️ Fixo no rodapé da janela, não no fim do documento: as seções ocupam a tela
          inteira, e uma linha que só aparece para quem rola até o fim não é lida por ninguém.
          ⭐ Por estar sempre visível, ela precisa ser curta — e curta é o que a mantém baixa o
          bastante para não roubar a tela no celular.
          ⚠️ O `pb-24` no wrapper da página existe por causa dela: sem folga, o rodapé fixo
          cobre o fim da última seção. */}
      {/* ⭐ Faixa de floresta OPACA, e é a superfície invertida da paleta — papel sobre
          floresta é 10,62:1. O `/95` de antes existia para o slate-800 não pesar; sobre a tela
          sálvia a translucidez tinge a faixa de verde-médio e come justamente esse contraste.
          ⚠️ E o texto não é branco puro: a paleta pede papel (#FBF8F2) e sálvia 100 (#E2E8DD)
          sobre floresta. Branco puro ali é mais duro do que o sistema. */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-text py-3 px-6 text-center">
        <p className="text-sm text-superficie-forte max-w-3xl mx-auto leading-snug">
          © {new Date().getFullYear()} <Marca className="font-bold text-surface" destaque="text-primary-clara" /> · NEXFIN
          — todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
