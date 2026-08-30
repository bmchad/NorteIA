/**
 * Onde a sessão autenticada cai ao entrar.
 *
 * ⭐ `/compromissos` porque é a tela que responde "quanto do meu dinheiro já tem dono" — a
 * resposta que muda uma decisão hoje. O dashboard continua existindo e linkável; o que
 * mudou foi a porta de entrada, não o mapa de rotas.
 *
 * ⚠️ Mora aqui, e não em `App.tsx`, porque `Auth.tsx` também precisa dela: importar de
 * `App.tsx` fecharia um ciclo, já que `App` importa `Auth`.
 *
 * ⛔ Trocar esta constante exige que a URL correspondente esteja na lista de **Redirect
 * URLs** do Supabase Auth. Fora da lista, o SSO do Google volta para a home sem sessão.
 */
export const ENTRADA = '/compromissos';
