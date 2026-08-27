import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')
const SELLER_EMAIL = Deno.env.get('SELLER_EMAIL') || 'vendas@balancogeral.com.br'
const SENDER_EMAIL = 'Balanço Geral <onboarding@resend.dev>' // Altere para seu domínio verificado

/**
 * Compara em tempo constante. Um `===` sai no primeiro byte diferente, e o tempo de
 * resposta revela quantos caracteres do segredo estao certos.
 */
function segredoConfere(recebido: string | null): boolean {
  if (!WEBHOOK_SECRET || !recebido) return false
  if (recebido.length !== WEBHOOK_SECRET.length) return false
  let diferenca = 0
  for (let i = 0; i < WEBHOOK_SECRET.length; i++) {
    diferenca |= WEBHOOK_SECRET.charCodeAt(i) ^ recebido.charCodeAt(i)
  }
  return diferenca === 0
}

serve(async (req: Request) => {
  try {
    // Esta funcao roda com verify_jwt = false, porque quem a chama e um Database
    // Webhook e nao um usuario -- nao ha JWT na requisicao. Sem esta verificacao,
    // qualquer POST com um payload forjado dispara e-mail pela conta Resend para
    // endereco arbitrario. Ver context/30-decisoes-e-licoes.md D-024.
    if (!segredoConfere(req.headers.get('x-webhook-secret'))) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const payload = await req.json()
    
    // Assegurar que seja um evento INSERT
    if (payload.type !== 'INSERT') {
      return new Response(
        JSON.stringify({ error: 'Payload type must be INSERT' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const table = payload.table
    const record = payload.record
    const emailsToProcess = []

    // LÓGICA PARA LEADS
    if (table === 'leads') {
      const firstName = record.nome.split(' ')[0]
      
      // 1. E-mail para o Lead
      emailsToProcess.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: SENDER_EMAIL,
            to: [record.email],
            subject: 'Recebemos seu contato. Vamos falar sobre sua liberdade financeira?',
            html: `
              <p>Olá! Aqui é o Bernardo, do time do Balanço Geral.</p>
              
              <p>${firstName}, lembra da primeira vez que o seu salário caiu na conta e da liberdade que você sentiu? Eu lembro bem da minha... Eu sonhava em comprar uma bicicleta e prometi para mim mesmo que iria guardar um pouco do dinheiro todo mês.</p>
              
              <p>Mas a promessa durou pouco. Uma avalanche de pedidos no iFood de R$20 e comprinhas na Shopee de R$15, espalhadas por três cartões de crédito diferentes, me assolavam. No final das contas, eu não só não tinha guardado nada, como estava devendo dinheiro.</p>
              
              <p>Você se identifica com essa história, ${firstName}?</p>
              
              <p>Estamos aqui para mudar isso. Em breve nossa equipe entrará em contato com você!</p>
              <br/>
              <p>Um abraço,<br/><strong>Bernardo</strong><br/>Time Balanço Geral</p>
            `,
          })
        })
      )

      // 2. E-mail para o Vendedor (Aviso interno)
      emailsToProcess.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: SENDER_EMAIL,
            to: [SELLER_EMAIL],
            subject: 'Novo Lead do Balanço Geral!',
            html: `
              <h2>Você recebeu um lead do Balanço Geral!</h2>
              <p><strong>Nome:</strong> ${record.nome}</p>
              <p><strong>Email:</strong> ${record.email}</p>
              <p><strong>Telefone:</strong> ${record.telefone || 'Não informado'}</p>
              <p><em>Entre em contato o mais rápido possível.</em></p>
            `,
          })
        })
      )
    } 
    
    // LÓGICA PARA BOAS VINDAS (Criação de Conta via tabela profiles)
    else if (table === 'profiles') {
      emailsToProcess.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: SENDER_EMAIL,
            to: [record.email],
            subject: 'Bem-vindo(a) ao Balanço Geral! 🚀',
            html: `
              <h2>Olá, que bom ter você com a gente!</h2>
              <p>O Balanço Geral nasceu para organizar a sua vida financeira de forma inteligente e sem estresse. A partir de agora, você tem tudo o que precisa em um só lugar.</p>
              <p>Acesse a plataforma e comece a controlar o seu futuro hoje mesmo!</p>
              <br/>
              <a href="https://localhost:5173/dashboard" style="display:inline-block;padding:12px 24px;background-color:#0ea5e9;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
                Acessar Balanço Geral
              </a>
              <br/><br/>
              <p>Se tiver qualquer dúvida, é só responder este e-mail.</p>
            `,
          })
        })
      )
    } 
    
    // Tabela não mapeada
    else {
      return new Response(
        JSON.stringify({ message: 'No action defined for this table' }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Aguardar todas as requisições de e-mail finalizarem
    const results = await Promise.all(emailsToProcess)
    
    // Verificar se houve erros nas requisições do Resend
    for (const res of results) {
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(`Erro da API Resend: ${JSON.stringify(errorData)}`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: emailsToProcess.length }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
