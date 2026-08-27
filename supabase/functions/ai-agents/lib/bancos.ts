/**
 * Os bancos que a IA pode atribuir a uma transacao -- os vinte mais usados no Brasil,
 * incluindo os digitais, porque a interface do print quase sempre identifica a
 * instituicao. `Outros` cobre o que ficar de fora; `null`, o print que nao deixa deduzir.
 *
 * Este arquivo e o unico dono da lista. O Postgres nao a restringe mais
 * (migrations/20260827120000_drop_chk_banco.sql).
 */
export const BANCOS = [
  'Nubank', 'Itaú', 'Bradesco', 'Banco do Brasil', 'Caixa', 'Santander',
  'Inter', 'C6 Bank', 'BTG Pactual', 'XP', 'Original', 'Neon',
  'PagBank', 'Mercado Pago', 'PicPay', 'Safra', 'Banrisul', 'Sicredi',
  'Sicoob', 'Will Bank', 'Outros',
];

export const listaDeBancos = () => BANCOS.map((b) => `"${b}"`).join(', ');
