/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Superfícies escuras da navegação ("central de operação")
        ink: {
          950: '#0c101b',
          900: '#111627',
          800: '#1a2138',
          700: '#242d4a',
        },
        // Acento principal da marca Unificca
        brand: {
          50: '#effaf9',
          100: '#d7f1ef',
          500: '#128c7e',
          600: '#0f766b',
          700: '#0d5f56',
        },
        // Um acento por marketplace
        shopee: '#ee4d2d',
        meli: '#ffe600',
        tiktok: '#25f4ee',
      },
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Archivo Variable', 'Inter Variable', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
