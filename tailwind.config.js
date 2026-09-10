/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /**
       * ⭐ Os tokens de tema apontam para variáveis CSS, definidas em src/index.css. É o que
       * deixa a cor num lugar só, e o que permite a plataforma ter texto mais escuro que a
       * landing — mesma classe, valor diferente por escopo.
       *
       * ⚠️ `<alpha-value>` é obrigatório: sem ele, `bg-primary/10` deixa de funcionar.
       *
       * ⭐ `background`, `surface`, `border`, `danger` e `danger-hover` eram hex literais
       * aqui até a paleta sálvia. Enquanto foram, a promessa "cor de tema mora em
       * src/index.css" cobria METADE da paleta: justamente o fundo e as molduras não tinham
       * como mudar por escopo, porque só variável entra em `.tema-plataforma`.
       */
      colors: {
        background: 'rgb(var(--fundo) / <alpha-value>)',
        surface: 'rgb(var(--papel) / <alpha-value>)',
        // A superfície aninhada: sub-card dentro do cartão, trilho, aba inativa.
        superficie: 'rgb(var(--superficie) / <alpha-value>)',
        'superficie-forte': 'rgb(var(--superficie-forte) / <alpha-value>)',
        primary: 'rgb(var(--marca) / <alpha-value>)',
        'primary-hover': 'rgb(var(--marca-forte) / <alpha-value>)',
        'primary-clara': 'rgb(var(--marca-clara) / <alpha-value>)',
        // ⭐ Nunca foi o azul da marca: é o VALOR POSITIVO, sempre em par com `danger`.
        // Absorveu o antigo `#10b981` — ver o comentário de `--azul` em src/index.css.
        azul: 'rgb(var(--azul) / <alpha-value>)',
        'azul-forte': 'rgb(var(--azul-forte) / <alpha-value>)',
        danger: 'rgb(var(--perigo) / <alpha-value>)',
        'danger-hover': 'rgb(var(--perigo-forte) / <alpha-value>)',
        text: 'rgb(var(--texto) / <alpha-value>)',
        'text-light': 'rgb(var(--texto-suave) / <alpha-value>)',
        // ⭐ Dois fios com trabalhos opostos — ver o comentário em src/index.css.
        // `moldura` DESENHA a aresta do cartão; `border` SEPARA item de item dentro dele.
        moldura: 'rgb(var(--moldura) / <alpha-value>)',
        border: 'rgb(var(--fio) / <alpha-value>)',
        // A superfície de hover sobre a barra lateral sálvia.
        realce: 'rgb(var(--realce) / <alpha-value>)',
        // A borda de campo: sálvia 800. Só a `.glass-input` e os campos de hover a usam.
        campo: 'rgb(var(--campo) / <alpha-value>)',
        // ⭐ O FUNDO do campo, que NÃO é o fundo do cartão. `campo` é a borda,
        // `campo-fundo` é o preenchimento — ver o comentário da `.glass-input`.
        'campo-fundo': 'rgb(var(--papel-campo) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        /**
         * ⚠️ Sombra PRETA sobre fundo cromático dessatura a cor na borda do painel — a
         * auréola cinza é o artefato clássico. Floresta 900 sobre sálvia lê como
         * profundidade, não como sujeira.
         * ⭐ A geometria é a mesma de antes (mesmos offsets, blur e spread): só a tinta mudou,
         * e o alpha dobrou. O fundo caiu de luminância 0,97 (branco) para 0,45 (sálvia), e
         * uma sombra de 3% simplesmente não existe contra ele.
         * ⚠️ `boxShadow` não aceita `<alpha-value>` — daí o alpha fixo no `rgb(var(...))`.
         */
        'glass': '0 4px 6px -1px rgb(var(--sombra) / 0.10), 0 2px 4px -1px rgb(var(--sombra) / 0.06)',
        'glass-lg': '0 10px 15px -3px rgb(var(--sombra) / 0.12), 0 4px 6px -2px rgb(var(--sombra) / 0.07)',
      }
    },
  },
  plugins: [],
}
