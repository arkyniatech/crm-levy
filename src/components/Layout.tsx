import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Layers,
  Package,
  ShoppingCart,
  FileUp,
  Megaphone,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { formatCnpj } from '../lib/format'

const NAV = [
  { to: '/', label: 'Visão Geral', icon: LayoutDashboard, end: true },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/segmentos', label: 'Segmentos', icon: Layers },
  { to: '/vendas', label: 'Vendas', icon: ShoppingCart },
  { to: '/produtos', label: 'Produtos', icon: Package },
  { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
  { to: '/importar', label: 'Importar NF-e', icon: FileUp },
]

const SOON: { label: string; icon: typeof Settings }[] = []

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut, session } = useAuth()
  const { clients, activeClient, setActiveClientId } = useCompany()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-800 ring-1 ring-white/10">
          <span className="font-display text-base font-bold text-brand-500">C</span>
        </div>
        <div>
          <p className="font-display text-sm font-semibold tracking-wide text-white">Contatta</p>
          <p className="text-[11px] text-slate-400">central de operação</p>
        </div>
      </div>

      {/* Seletor de empresa (CNPJ) — só aparece quando há mais de uma empresa.
          Com uma só, não mostramos nada (info desnecessária por enquanto). */}
      {clients.length > 1 && (
        <div className="px-3 pb-4">
          <label className="block">
            <span className="sr-only">Empresa ativa</span>
            <select
              className="w-full rounded-md border border-white/10 bg-ink-800 px-2.5 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
              value={activeClient?.id ?? ''}
              onChange={(e) => setActiveClientId(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? formatCnpj(c.document)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 px-3 pt-2" aria-label="Navegação principal">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-600/15 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-4 w-4 ${isActive ? 'text-brand-500' : 'text-slate-400'}`} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}

        {SOON.length > 0 && (
          <p className="px-2.5 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Em breve
          </p>
        )}
        {SOON.map(({ label, icon: Icon }) => (
          <span
            key={label}
            className="flex cursor-not-allowed items-center gap-3 rounded-md px-2.5 py-2 text-sm text-slate-600"
            title="Disponível em uma próxima versão"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            <span className="ml-auto rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-slate-500">em breve</span>
          </span>
        ))}
      </nav>

      <div className="px-3 pb-1">
        <NavLink
          to="/configuracoes"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-brand-600/15 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Settings className={`h-4 w-4 ${isActive ? 'text-brand-500' : 'text-slate-400'}`} aria-hidden />
              Configurações
            </>
          )}
        </NavLink>
      </div>

      <div className="border-t border-white/10 px-3 py-3">
        <p className="mb-2 truncate px-2.5 text-xs text-slate-500" title={session?.user.email ?? ''}>
          {session?.user.email}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4 text-slate-400" aria-hidden />
          Sair
        </button>
      </div>
    </div>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 bg-ink-900 lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Topbar + drawer mobile */}
      <div className="flex items-center justify-between bg-ink-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-semibold text-white">Contatta</span>
        </div>
        <button
          type="button"
          className="rounded-md p-1.5 text-slate-300 hover:bg-white/10"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-ink-900 shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-4 rounded-md p-1.5 text-slate-400 hover:bg-white/10"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
