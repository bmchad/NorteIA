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
       * deixa a cor num lugar só, e o que permite a plataforma ter texto azul enquanto a
       * landing tem texto neutro — mesma classe, valor diferente por escopo.
       *
       * ⚠️ `<alpha-value>` é obrigatório: sem ele, `bg-primary/10` deixa de funcionar.
       */
      colors: {
        background: '#f8fafc', // light gray
        surface: '#ffffff',
        primary: 'rgb(var(--marca) / <alpha-value>)',
        'primary-hover': 'rgb(var(--marca-forte) / <alpha-value>)',
        // O azul que era a marca. Sobrevive como cor de TEXTO dentro da plataforma.
        azul: 'rgb(var(--azul) / <alpha-value>)',
        'azul-claro': 'rgb(var(--azul-claro) / <alpha-value>)',
        danger: '#991b1b', // blood red
        'danger-hover': '#7f1d1d',
        text: 'rgb(var(--texto) / <alpha-value>)',
        'text-light': 'rgb(var(--texto-suave) / <alpha-value>)',
        border: '#e2e8f0',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'glass-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)',
      }
    },
  },
  plugins: [],
}
