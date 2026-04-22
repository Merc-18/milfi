/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        principal: '#FCE4EC',
        acento: '#FFE0D4',
        secundario: '#EADEF4',
        exito: '#DDEBD8',
        fondo: '#FDFAF7',
        texto: '#5C4A52',
        'texto-light': '#8B7A82',
      },
      fontFamily: {
        sans: ['Quicksand', 'sans-serif'],
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '24px',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0,0,0,0.04)',
      }
    },
  },
  plugins: [],
}
