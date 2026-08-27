import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Cliente que age **como o usuario que chamou a funcao**, repassando o Authorization
 * recebido. Toda consulta feita por ele passa pela RLS da conta dele.
 *
 * A funcao nunca usa a service role: ela le a lista de categorias e o ciclo do proprio
 * usuario, e nada alem disso. Escrever em transactions continua sendo trabalho do
 * frontend, com a sessao do browser -- ver context/30-decisoes-e-licoes.md D-012.
 */
export function clienteDoUsuario(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization') ?? '';
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
}
