import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { CompanyProvider } from './context/CompanyContext.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

// Com BASE_PATH configurado no build, as rotas passam a viver sob a subpasta
const base = import.meta.env.BASE_URL
const basename = base && base !== '/' && base !== './' ? base.replace(/\/$/, '') : undefined

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CompanyProvider>
          <BrowserRouter basename={basename}>
            <App />
          </BrowserRouter>
        </CompanyProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
