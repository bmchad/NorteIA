/**
 * O gráfico animado de fundo da landing e do login.
 *
 * ⭐⭐ Toda cor aqui é `currentColor`: o SVG herda a cor de texto do container, que usa o
 * token `primary`. Antes eram 24 atributos com `#0ea5e9` escrito à mão, em três blocos
 * copiados — e trocar a marca exigia lembrar dos três.
 *
 * ⚠️ A opacidade vem das classes (`opacity-40`, `opacity-20`), não da cor. Misturar as duas
 * coisas é o que faz um `fill` com alpha embutido escapar da troca de tema.
 */
export default function GraficoDecorativo({ className = '' }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 z-0 opacity-30 pointer-events-none flex items-end justify-center text-primary ${className}`}
      aria-hidden="true"
    >
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

        {/* Linhas de grade */}
        <path
          d="M0 100 H1200 M0 200 H1200 M0 300 H1200 M0 400 H1200 M0 500 H1200"
          stroke="currentColor" strokeWidth="1" strokeDasharray="5,5" className="opacity-20"
        />

        {/* Barras */}
        {[
          { x: 100, y: 400, h: 100 },
          { x: 250, y: 300, h: 200 },
          { x: 400, y: 350, h: 150 },
          { x: 550, y: 200, h: 300 },
          { x: 700, y: 250, h: 250 },
          { x: 850, y: 100, h: 400 },
        ].map(b => (
          <rect
            key={b.x} x={b.x} y={b.y} width="80" height={b.h}
            fill="currentColor" className="bar opacity-40"
          />
        ))}

        {/* Linha ascendente e a seta */}
        <path
          d="M 50 500 L 250 400 L 450 450 L 650 250 L 850 300 L 1100 100"
          fill="none" stroke="currentColor" strokeWidth="8"
          className="chart-line" strokeLinecap="round" strokeLinejoin="round"
        />
        <polygon points="1120,90 1070,80 1090,120" fill="currentColor" className="chart-area" />
      </svg>
    </div>
  );
}
