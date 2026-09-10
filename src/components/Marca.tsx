/**
 * O wordmark "NorteIA", com o N e o IA em laranja — a mesma quebra do arquivo de logo.
 *
 * ⭐ Existe porque a quebra aparece em SEIS lugares (barra lateral, header mobile, login,
 * navbar da landing, rodapé e tela de carregamento) e precisa de um dono só: escrever
 * `<span className="text-primary">N</span>orte...` à mão em cada um é a duplicação que um dia
 * diverge — alguém corrige o laranja num lugar e os outros cinco ficam para trás.
 *
 * ⚠️ O laranja de destaque VARIA com a superfície, e é por isso que ele é prop e não constante:
 *   papel     → `text-primary` (#FF6200)   2,83:1  — o padrão
 *   floresta  → `text-primary-clara`       5,57:1  — o único que passa em texto pequeno lá
 *   sálvia    → `text-primary`             1,28:1  ⛔ reprova, e está no ar por decisão
 *                                                     explícita de produto. Não é descuido.
 */
export default function Marca({
  className = '',
  destaque = 'text-primary',
}: {
  className?: string;
  /** A classe de cor do "N" e do "IA". Troque conforme a superfície — ver o aviso acima. */
  destaque?: string;
}) {
  return (
    <span className={className}>
      <span className={destaque}>N</span>orte<span className={destaque}>IA</span>
    </span>
  );
}
