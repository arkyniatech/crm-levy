import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { isSupabaseConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Orders from './pages/Orders'
import ImportNfe from './pages/ImportNfe'
import Campaigns from './pages/Campaigns'
import Settings from './pages/Settings'

function ProtectedRoutes() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Carregando…</div>
    )
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Layout />
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md p-6">
          <h1 className="font-display text-lg font-semibold">Configuração pendente</h1>
          <p className="mt-2 text-sm text-gray-600">
            Defina <code className="rounded bg-gray-100 px-1">VITE_SUPABASE_URL</code> e{' '}
            <code className="rounded bg-gray-100 px-1">VITE_SUPABASE_ANON_KEY</code> no arquivo{' '}
            <code className="rounded bg-gray-100 px-1">.env</code> (veja o .env.example) e reinicie o servidor.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Customers />} />
        <Route path="/clientes/:id" element={<CustomerDetail />} />
        <Route path="/vendas" element={<Orders />} />
        <Route path="/importar" element={<ImportNfe />} />
        <Route path="/campanhas" element={<Campaigns />} />
        <Route path="/configuracoes" element={<Settings />} />
        <Route path="/integracoes" element={<Navigate to="/configuracoes" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
