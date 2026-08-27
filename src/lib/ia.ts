/**
 * O vocabulário que vai dentro dos prompts do Gemini.
 *
 * O que está aqui não é configuração de infraestrutura: é o conjunto fechado de valores que o
 * modelo pode devolver. Escrever essas listas à mão dentro de cada prompt faz as três portas de
 * entrada divergirem entre si com o tempo.
 */

/** Os modelos do Gemini usados pelo projeto, por papel e não por nome. */
export const MODELO = {
  /** Extração de transações a partir de imagem, planilha e PDF. */
  RAPIDO: 'gemini-3.5-flash',
};

/**
 * Os bancos que a IA pode atribuir a uma transação.
 *
 * A lista cobre os vinte mais usados no Brasil, incluindo os digitais, porque a interface do print
 * quase sempre identifica a instituição. `Outros` é a saída para o que não estiver aqui, e `null`
 * para quando o print não deixa deduzir nada.
 */
export const BANCOS = [
  'Nubank', 'Itaú', 'Bradesco', 'Banco do Brasil', 'Caixa', 'Santander',
  'Inter', 'C6 Bank', 'BTG Pactual', 'XP', 'Original', 'Neon',
  'PagBank', 'Mercado Pago', 'PicPay', 'Safra', 'Banrisul', 'Sicredi',
  'Sicoob', 'Will Bank', 'Outros'
];

/** Os bancos formatados para irem dentro do prompt, entre aspas e separados por vírgula. */
export const listaDeBancos = () => BANCOS.map(b => `"${b}"`).join(', ');
