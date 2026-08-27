import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE em vez do fluxo implicit: o retorno do login traz `?code=` de uso unico e vida
    // curta, e o SDK troca por sessao sozinho. No implicit, o Supabase devolvia
    // access_token, refresh_token e provider_token no fragmento da URL -- onde ficavam na
    // barra de enderecos, no historico do navegador e em qualquer captura de tela.
    // Ver context/30-decisoes-e-licoes.md L-002.
    flowType: 'pkce',
  },
});
