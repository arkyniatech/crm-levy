import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Users, UserPlus, Repeat, Wallet, Sparkles, Phone, Megaphone, Send } from 'lucide-react'
import { useDashboard, useOutreachStats, type Period } from '../hooks/queries'
import { formatCurrency, formatDateTime, marketplaceLabel } from '../lib/format'
import { EmptyState, ErrorState, MarketplaceBadge, PageHeader } from '../components/ui'

const PERIODS: { value: Period; label: string }[] = [
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'all', label: 'Tudo' },
]

const MP_COLORS: Record<string, string> = {
  shopee: '#ee4d2d',
  mercado_livre: '#e6c700',
  tiktok_shop: '#111827',
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-gray-500">
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('30d')
  const { data, isLoading, error } = useDashboard(period)
  const { data: stats } = useOutreachStats()
  const enrichedPct = stats && stats.total > 0 ? Math.round((stats.enriched / stats.total) * 100) : 0

  return (
    <div>
      <PageHeader title="Visão Geral" subtitle="Resumo da operação em todos os canais">
        <div className="flex rounded-md border border-gray-300 bg-white p-0.5" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`rounded px-3 py-1.5 text-sm ${
                period === p.value ? 'bg-ink-900 font-medium text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorState message={(error as Error).message} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Users}
          label="Clientes"
          value={isLoading ? '…' : String(data?.totalCustomers ?? 0)}
          hint="identificados no total"
        />
        <Kpi
          icon={UserPlus}
          label="Novos no mês"
          value={isLoading ? '…' : String(data?.newThisMonth ?? 0)}
        />
        <Kpi
          icon={Repeat}
          label="Recorrentes"
          value={
            isLoading ? '…' : data?.recurrentPct != null ? `${data.recurrentPct.toFixed(0)}%` : '—'
          }
          hint="clientes com 2+ pedidos"
        />
        <Kpi
          icon={Wallet}
          label="Receita"
          value={isLoading ? '…' : formatCurrency(data?.revenue ?? 0)}
          hint={`${data?.orderCount ?? 0} pedidos no período (sem cancelados)`}
        />
      </div>

      <h2 className="mb-2 mt-6 font-display text-sm font-semibold text-gray-900">Base &amp; WhatsApp</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">Enriquecidos</span>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-gray-900">
            {stats ? `${enrichedPct}%` : '…'}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${enrichedPct}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {stats?.enriched ?? 0} de {stats?.total ?? 0} clientes
          </p>
        </div>
        <Kpi
          icon={Phone}
          label="Com telefone"
          value={stats ? String(stats.withPhone) : '…'}
          hint="prontos para WhatsApp"
        />
        <Kpi icon={Megaphone} label="Campanhas" value={stats ? String(stats.campaigns) : '…'} />
        <Kpi
          icon={Send}
          label="Mensagens enviadas"
          value={stats ? String(stats.messagesSent) : '…'}
          hint={stats ? `${stats.delivered} entregues · ${stats.replied} responderam` : undefined}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="card p-4 lg:col-span-3">
          <h2 className="font-display text-sm font-semibold text-gray-900">Vendas por marketplace</h2>
          {isLoading ? (
            <div className="mt-4 h-64 animate-pulse rounded bg-gray-100" />
          ) : !data || data.revenueByMarketplace.length === 0 ? (
            <EmptyState title="Nenhuma venda no período" hint="Assim que houver pedidos, o gráfico aparece aqui." />
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.revenueByMarketplace} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="marketplace"
                    tickFormatter={marketplaceLabel}
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatCurrency(v).replace(',00', '')}
                    tick={{ fontSize: 11 }}
                    width={90}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Receita']}
                    labelFormatter={marketplaceLabel}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={80}>
                    {data.revenueByMarketplace.map((entry) => (
                      <Cell key={entry.marketplace} fill={MP_COLORS[entry.marketplace] ?? '#4f46e5'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-4 lg:col-span-2">
          <h2 className="font-display text-sm font-semibold text-gray-900">Atividade recente</h2>
          {isLoading ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Últimos pedidos</h3>
              {!data || data.recentOrders.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">Nenhum pedido registrado ainda.</p>
              ) : (
                <ul className="mt-1 divide-y divide-gray-100">
                  {data.recentOrders.slice(0, 5).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-800">{o.buyer_name || 'Comprador não identificado'}</p>
                        <p className="text-xs tabular-nums text-gray-500">{formatDateTime(o.ordered_at)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <MarketplaceBadge marketplace={o.marketplace} />
                        <span className="text-sm font-medium tabular-nums">{formatCurrency(o.total_amount, o.currency ?? 'BRL')}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Novos clientes</h3>
              {!data || data.recentCustomers.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">Nenhum cliente identificado ainda.</p>
              ) : (
                <ul className="mt-1 divide-y divide-gray-100">
                  {data.recentCustomers.map((c) => (
                    <li key={c.id} className="py-2">
                      <Link
                        to={`/clientes/${c.id}`}
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        {c.name || 'Sem nome'}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {[c.city, c.state].filter(Boolean).join('/') || 'Localização não informada'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}