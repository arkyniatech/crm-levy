import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH permite servir o app de uma subpasta (ex.: Hostinger em /crm/).
// Para deploy na raiz (Vercel/Netlify/Hostinger raiz) não precisa configurar nada.
// Ex.: BASE_PATH=/crm/ npm run build
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', '@supabase/supabase-js'],
        },
      },
    },
  },
})
