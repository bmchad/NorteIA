/**
 * O dia de uma cobrança, como pastilha de largura fixa.
 *
 * ⭐⭐ A largura fixa é o ponto, não o enfeite: com ela os dias se alinham numa coluna e a
 * lista inteira passa a se ler de cima a baixo como um calendário do ciclo. Antes disto o dia
 * era o elemento mais apagado da linha — cinza, do tamanho de uma legenda —, sendo que é a
 * informação que a linha existe para dar.
 *
 * ⭐ Nasceu inline no `LinhaDeCobranca` do /compromissos e virou componente quando o
 * /mercado-de-datas passou a usar o mesmo desenho: são três listas em dois arquivos, e o
 * próximo ajuste no desenho de data precisa acontecer num lugar só.
 *
 * ⚠️ `padStart` aqui e não em quem chama: o zero à esquerda é o que mantém os dois dígitos
 * sempre na mesma largura, e é disso que o alinhamento depende. Quem passa um dia sem zero
 * quebra a coluna sem perceber.
 */
export default function PastilhaDeDia({ dia }: { dia: number | string }) {
  return (
    <span className="shrink-0 w-11 rounded-lg bg-primary/10 py-1 text-center leading-none">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-primary/70">dia</span>
      <span className="block text-base font-bold text-text">{String(dia).padStart(2, '0')}</span>
    </span>
  );
}
