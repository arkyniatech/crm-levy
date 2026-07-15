import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Search, Sparkles } from 'lucide-react'
import { CUSTOMERS_PAGE_SIZE, useCustomers, type EnrichFilter } from '../hooks/queries'
import { enrichCustomers } from '../hooks/enrich'
import { formatCurrency, formatDate, maskCpf } from '../lib/format'
import { EmptyState, ErrorState, LoadingRows, PageHeader, Pagination, StatusBadge } from '../components/ui'

const TABS: { key: EnrichFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'enriched', label: 'Enriquecidos' },
]

function EnrichControl() {
  const [limit, setLimit] = useState(10)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const queryClient = useQueryClient()

  const run = async () => {
    setBusy(true)
    setMsg(null)
    const res = await enrichCustomers(limit)
    setBusy(false)
    if (!res.ok) {
      setMsg({ tone: 'err', text: res.error ?? 'Falha ao enriquecer.' })
      return
    }
    setMsg({ tone: 'ok', text: `${res.enriquecidos} cliente(s) enriquecido(s) via NovaVida.` })
    void queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        min={1}
        max={500}
        className="input w-20"
        value={limit}
        onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
        aria-label="Quantos clientes enriquecer"
        title="Quantos clientes buscar dados na NovaVida"
      />
      <button
        type="button"
        className="btn-primary shrink-0"
        onClick={() => void run()}
        disabled={busy}
        title="Busca nome, telefone, e-mail e endereço pelo CPF (NovaVida)"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        {busy ? 'Enriquecendo…' : 'Enriquecer dados'}
      </button>
      {msg && (
        <span className={`text-xs ${msg.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>
      )}
    </div>
  )
}

function WaBadge({ status }: { status: 'respondeu' | 'enviada' | 'nenhuma' }) {
  if (status === 'respondeu') return <StatusBadge status="Respondeu" tone="ok" />
  if (status === 'enviada') return <StatusBadge status="Msg enviada" tone="neutral" />
  return <span className="text-gray-300">—</span>
}

export default function Customers() {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [tab, setTab] = useState<EnrichFilter>('all')
  const { data, isLoading, error, isFetching } = useCustomers(search, page, tab)

  // debounce da busca
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(input)
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [input])

  return (
    <div>
      <PageHeader title="Clientes" subtitle="Compradores identificados nos seus canais de venda">
        <div className="flex flex-wrap items-center gap-3">
          <EnrichControl />
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="search"
              className="input pl-9"
              placeholder="Buscar por nome, CPF ou cidade…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Buscar clientes"
            />
          </div>
        </div>
      </PageHeader>

      {error && <ErrorState message={(error as Error).message} />}

      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key)
              setPage(0)
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`card overflow-hidden ${isFetching && !isLoading ? 'opacity-70' : ''}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Nome</th>
                <th className="th">CPF</th>
                <th className="th">Cidade/UF</th>
                <th className="th">Status</th>
                <th className="th text-right">Pedidos</th>
                <th className="th text-right">Total gasto</th>
                <th className="th">Última compra</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <LoadingRows cols={8} />
              ) : (
                data?.customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="td">
                      <Link to={`/clientes/${c.id}`} className="font-medium text-brand-700 hover:underline">
                        {c.name || 'Sem nome'}
                      </Link>
                    </td>
                    <td className="td tabular-nums">{maskCpf(c.cpf)}</td>
                    <td className="td">{[c.city, c.state].filter(Boolean).join('/') || '—'}</td>
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-1">
                        {c.enriched ? (
                          <StatusBadge status="Enriquecido" tone="ok" />
                        ) : (
                          <StatusBadge status="Pendente" tone="warn" />
                        )}
                        <WaBadge status={c.waStatus} />
                      </div>
                    </td>
                    <td className="td text-right tabular-nums">
                      {c.orderCount > 0 ? (
                        <Link
                          to={`/clientes/${c.id}`}
                          className="font-medium text-brand-700 hover:underline"
                          title="Ver os produtos que comprou"
                        >
                          {c.orderCount}
                        </Link>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="td text-right font-medium tabular-nums">{formatCurrency(c.totalSpent)}</td>
                    <td className="td tabular-nums">{formatDate(c.lastOrderAt)}</td>
                    <td className="td text-right">
                      <Link to={`/clientes/${c.id}`} className="text-sm text-brand-700 hover:underline">
                        Ver pedidos
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && data?.customers.length === 0 && (
          <EmptyState
            title={
              search
                ? `Nenhum cliente encontrado para "${search}"`
                : tab === 'pending'
                  ? 'Nenhum cliente pendente'
                  : tab === 'enriched'
                    ? 'Nenhum cliente enriquecido ainda'
                    : 'Nenhum cliente ainda'
            }
            hint={
              search
                ? 'Tente outro nome, CPF ou cidade.'
                : tab === 'enriched'
                  ? 'Use "Enriquecer dados" para buscar telefone, e-mail e endereço na NovaVida.'
                  : 'Os clientes aparecem aqui conforme as NF-e são importadas.'
            }
          />
        )}

        <Pagination
          page={page}
          pageSize={CUSTOMERS_PAGE_SIZE}
          total={data?.total ?? 0}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
