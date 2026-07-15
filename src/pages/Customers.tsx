import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Search, Sparkles, UserPlus, X } from 'lucide-react'
import {
  CUSTOMERS_PAGE_SIZE,
  useAddCustomer,
  useCustomers,
  useOutreachStats,
  type ContactFilter,
  type EnrichFilter,
} from '../hooks/queries'
import { enrichCustomers } from '../hooks/enrich'
import { useEnrichmentCredits, useSpendCredits } from '../hooks/settings'
import { formatCurrency, formatDate, formatPhone, maskCpf, toE164 } from '../lib/format'
import { EmptyState, ErrorState, LoadingRows, PageHeader, Pagination, StatusBadge } from '../components/ui'

const TABS: { key: EnrichFilter; label: string }[] = [
  { key: 'pending', label: 'Pendentes' },
  { key: 'enriched', label: 'Enriquecidos' },
]

function EnrichControl() {
  const { data: credits } = useEnrichmentCredits()
  const spend = useSpendCredits()
  const balance = credits?.balance ?? 0
  const [limit, setLimit] = useState(10)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const queryClient = useQueryClient()

  const run = async () => {
    if (balance <= 0) {
      setMsg({ tone: 'err', text: 'Sem créditos. Recarregue para enriquecer.' })
      return
    }
    setBusy(true)
    setMsg(null)
    const res = await enrichCustomers(Math.max(1, Math.min(limit, balance)))
    setBusy(false)
    if (!res.ok) {
      setMsg({ tone: 'err', text: res.error ?? 'Falha ao enriquecer.' })
      return
    }
    const n = res.enriquecidos ?? 0
    if (n > 0) await spend(n)
    setMsg({ tone: 'ok', text: `${n} enriquecido(s). Restam ${Math.max(0, balance - n)} créditos.` })
    void queryClient.invalidateQueries({ queryKey: ['customers'] })
    void queryClient.invalidateQueries({ queryKey: ['outreach-stats'] })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        min={1}
        max={Math.max(1, balance)}
        className="input w-20"
        value={limit}
        onChange={(e) =>
          setLimit(Math.max(1, Math.min(balance > 0 ? balance : 1, Number(e.target.value) || 1)))
        }
        aria-label="Quantos clientes enriquecer"
        title="Quantos clientes buscar dados na NovaVida (limitado pelo saldo)"
      />
      <button
        type="button"
        className="btn-primary shrink-0"
        onClick={() => void run()}
        disabled={busy || balance <= 0}
        title="Busca nome, telefone, e-mail e endereço pelo CPF (NovaVida)"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        {busy ? 'Enriquecendo…' : 'Enriquecer dados'}
      </button>
      {credits && (
        <span className="text-xs text-gray-500">
          <span className={`font-medium tabular-nums ${balance <= 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {balance}
          </span>{' '}
          créditos
          {credits.validUntil && <span className="text-gray-400"> · até {formatDate(credits.validUntil)}</span>}
        </span>
      )}
      {msg && (
        <span className={`text-xs ${msg.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>
      )}
    </div>
  )
}

function initials(name: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function NewCustomerModal({ onClose }: { onClose: () => void }) {
  const add = useAddCustomer()
  const [form, setForm] = useState({ name: '', cpf: '', phone: '', email: '', city: '', state: '', birth_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Informe o nome.')
      return
    }
    let phone: string | undefined
    if (form.phone.trim()) {
      const e164 = toE164(form.phone)
      if (!e164) {
        setError('Telefone inválido. Use DDD + número.')
        return
      }
      phone = e164
    }
    setSaving(true)
    setError(null)
    const res = await add({
      name: form.name,
      cpf: form.cpf || undefined,
      phone,
      email: form.email || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      birth_date: form.birth_date || undefined,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao salvar.')
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-gray-900">
            <UserPlus className="h-4 w-4 text-brand-600" aria-hidden /> Novo cliente
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Nome *</span>
            <input className="input mt-1" value={form.name} onChange={set('name')} autoFocus />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">CPF</span>
            <input className="input mt-1" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Telefone</span>
            <input className="input mt-1" value={form.phone} onChange={set('phone')} placeholder="(11) 99999-8888" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">E-mail</span>
            <input className="input mt-1" type="email" value={form.email} onChange={set('email')} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Cidade</span>
            <input className="input mt-1" value={form.city} onChange={set('city')} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">UF</span>
            <input className="input mt-1" maxLength={2} value={form.state} onChange={set('state')} placeholder="SP" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Nascimento</span>
            <input className="input mt-1" type="date" value={form.birth_date} onChange={set('birth_date')} />
          </label>
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar cliente'}
          </button>
        </div>
      </div>
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
  const [tab, setTab] = useState<EnrichFilter>('pending')
  const [tabTouched, setTabTouched] = useState(false)
  const [contact, setContact] = useState<ContactFilter>('all')
  const [showAdd, setShowAdd] = useState(false)
  const navigate = useNavigate()
  const { data, isLoading, error, isFetching } = useCustomers(search, page, tab, contact)
  const { data: stats } = useOutreachStats()
  const pendingCount = stats ? Math.max(0, stats.total - stats.enriched) : null
  const enrichedCount = stats?.enriched ?? null
  const counts: Record<EnrichFilter, number | null> = {
    all: stats?.total ?? null,
    pending: pendingCount,
    enriched: enrichedCount,
  }

  // debounce da busca
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(input)
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [input])

  // Se não houver pendentes, abre já na aba com clientes (evita tela vazia)
  useEffect(() => {
    if (!tabTouched && stats && pendingCount === 0 && (enrichedCount ?? 0) > 0) {
      setTab('enriched')
    }
  }, [stats, tabTouched, pendingCount, enrichedCount])

  return (
    <div>
      <PageHeader title="Clientes" subtitle="Compradores identificados nos seus canais de venda">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => setShowAdd(true)}
          >
            <UserPlus className="h-4 w-4 text-brand-600" aria-hidden />
            Novo cliente
          </button>
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key)
                setTabTouched(true)
                setPage(0)
              }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {counts[t.key] != null && <span className="ml-1 tabular-nums text-gray-400">({counts[t.key]})</span>}
            </button>
          ))}
        </div>
        <select
          value={contact}
          onChange={(e) => {
            setContact(e.target.value as ContactFilter)
            setPage(0)
          }}
          className="input mb-1.5 w-auto py-1.5 text-sm"
          aria-label="Filtrar por telefone"
          title="Filtrar clientes por telefone"
        >
          <option value="all">Telefone: todos</option>
          <option value="with_phone">Só com telefone</option>
          <option value="without_phone">Só sem telefone</option>
        </select>
      </div>

      <div className={`card overflow-hidden ${isFetching && !isLoading ? 'opacity-70' : ''}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Cliente</th>
                <th className="th">Contato</th>
                <th className="th">Cidade/UF</th>
                <th className="th">Status</th>
                <th className="th text-right">Pedidos</th>
                <th className="th text-right">Total gasto</th>
                <th className="th">Última compra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <LoadingRows cols={7} />
              ) : (
                data?.customers.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                          {initials(c.name)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            to={`/clientes/${c.id}`}
                            className="block truncate font-medium text-gray-900 hover:text-brand-700 hover:underline"
                          >
                            {c.name || 'Sem nome'}
                          </Link>
                          <span className="text-xs tabular-nums text-gray-400">{maskCpf(c.cpf)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      {c.phone ? (
                        <span className="tabular-nums text-gray-700">{formatPhone(c.phone)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                      {c.email && (
                        <div className="max-w-[180px] truncate text-xs text-gray-400" title={c.email}>
                          {c.email}
                        </div>
                      )}
                    </td>
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

      {showAdd && <NewCustomerModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
