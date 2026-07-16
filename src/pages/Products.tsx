import { useEffect, useState, type FormEvent } from 'react'
import { Minus, Package, Plus, Search } from 'lucide-react'
import {
  REASON_LABEL,
  useProducts,
  useStockActions,
  useStockMovements,
  useTopProducts,
  type Product,
} from '../hooks/stock'
import { formatCurrency, formatDateTime } from '../lib/format'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../components/ui'

type Tab = 'estoque' | 'vendidos' | 'movimentacoes'

function NewProductForm({ onDone }: { onDone: () => void }) {
  const { createProduct } = useStockActions()
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!sku.trim()) {
      setError('Informe o SKU (é a chave que casa com as notas).')
      return
    }
    setBusy(true)
    setError(null)
    const res = await createProduct({
      sku,
      name,
      price: price ? Number(price) : null,
      initialStock: stock ? Number(stock) : 0,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao criar o produto.')
      return
    }
    setSku('')
    setName('')
    setPrice('')
    setStock('')
    onDone()
  }

  return (
    <form onSubmit={submit} className="card mb-4 p-4">
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-gray-900">
        <Plus className="h-4 w-4 text-brand-600" aria-hidden /> Novo produto
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">SKU *</span>
          <input className="input mt-1" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ex.: ABC-123" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-gray-700">Nome</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Preço (R$)</span>
          <input type="number" step="0.01" className="input mt-1" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Estoque inicial</span>
          <input type="number" className="input mt-1" value={stock} onChange={(e) => setStock(e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" className="btn-primary mt-3" disabled={busy}>
        {busy ? 'Salvando…' : 'Criar produto'}
      </button>
    </form>
  )
}

function StockRow({ product }: { product: Product }) {
  const { move } = useStockActions()
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState<'in' | 'out' | null>(null)

  const doMove = async (dir: 'in' | 'out') => {
    const n = Number(qty)
    if (!n || n <= 0) return
    setBusy(dir)
    await move(product, dir === 'in' ? n : -n, dir === 'in' ? 'manual_in' : 'manual_out', '')
    setBusy(null)
    setQty('')
  }

  const low = product.stock <= 0
  return (
    <tr className="hover:bg-gray-50">
      <td className="td font-medium text-gray-800">{product.name || 'Sem nome'}</td>
      <td className="td tabular-nums text-gray-500">{product.sku}</td>
      <td className={`td text-right font-semibold tabular-nums ${low ? 'text-red-600' : 'text-gray-900'}`}>
        {product.stock}
      </td>
      <td className="td text-right tabular-nums">{product.price != null ? formatCurrency(product.price) : '—'}</td>
      <td className="td">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            min={1}
            className="input w-20 py-1"
            placeholder="qtd"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-label={`Quantidade para ${product.name}`}
          />
          <button
            type="button"
            className="rounded-md border border-emerald-300 p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            onClick={() => void doMove('in')}
            disabled={busy !== null || !qty}
            title="Entrada (somar ao estoque)"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md border border-red-300 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
            onClick={() => void doMove('out')}
            disabled={busy !== null || !qty}
            title="Saída (consumir do estoque)"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function EstoqueTab() {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const { data, isLoading, error } = useProducts(search)

  useEffect(() => {
    const t = setTimeout(() => setSearch(input), 300)
    return () => clearTimeout(t)
  }, [input])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            className="input pl-9"
            placeholder="Buscar por nome ou SKU…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowNew((v) => !v)}>
          <Plus className="h-4 w-4" aria-hidden /> Novo produto
        </button>
      </div>

      {showNew && <NewProductForm onDone={() => setShowNew(false)} />}
      {error && <ErrorState message={(error as Error).message} />}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Produto</th>
                <th className="th">SKU</th>
                <th className="th text-right">Estoque</th>
                <th className="th text-right">Preço</th>
                <th className="th text-right">Entrada / Saída</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? <LoadingRows cols={5} /> : (data ?? []).map((p) => <StockRow key={p.id} product={p} />)}
            </tbody>
          </table>
        </div>
        {!isLoading && (data ?? []).length === 0 && (
          <EmptyState
            title={search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
            hint={search ? undefined : 'Crie o primeiro produto para começar a controlar o estoque.'}
          />
        )}
      </div>
    </div>
  )
}

function VendidosTab() {
  const { data, isLoading, error } = useTopProducts()
  return (
    <div>
      {error && <ErrorState message={(error as Error).message} />}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th w-10 text-right">#</th>
                <th className="th">Produto</th>
                <th className="th">SKU</th>
                <th className="th text-right">Qtd. vendida</th>
                <th className="th text-right">Nº de pedidos</th>
                <th className="th text-right">Receita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <LoadingRows cols={6} />
              ) : (
                (data ?? []).map((p, i) => (
                  <tr key={(p.sku ?? '') + p.name} className="hover:bg-gray-50">
                    <td className="td text-right tabular-nums text-gray-400">{i + 1}</td>
                    <td className="td font-medium text-gray-800">{p.name}</td>
                    <td className="td tabular-nums text-gray-500">{p.sku || '—'}</td>
                    <td className="td text-right tabular-nums">{p.quantity}</td>
                    <td className="td text-right tabular-nums">{p.orders}</td>
                    <td className="td text-right font-medium tabular-nums">{formatCurrency(p.revenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && (data ?? []).length === 0 && <EmptyState title="Nenhum produto vendido ainda" />}
      </div>
    </div>
  )
}

function MovimentacoesTab() {
  const { data, isLoading, error } = useStockMovements()
  return (
    <div>
      {error && <ErrorState message={(error as Error).message} />}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Quando</th>
                <th className="th">Produto</th>
                <th className="th">Motivo</th>
                <th className="th">Ref.</th>
                <th className="th text-right">Movimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <LoadingRows cols={5} />
              ) : (
                (data ?? []).map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="td tabular-nums text-gray-500">{formatDateTime(m.created_at)}</td>
                    <td className="td text-gray-800">{m.products?.name || m.sku || '—'}</td>
                    <td className="td">{REASON_LABEL[m.reason] ?? m.reason}</td>
                    <td className="td text-gray-500">{m.ref || '—'}</td>
                    <td
                      className={`td text-right font-semibold tabular-nums ${m.delta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                    >
                      {m.delta >= 0 ? '+' : ''}
                      {m.delta}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && (data ?? []).length === 0 && (
          <EmptyState title="Nenhuma movimentação ainda" hint="Entradas, saídas e baixas por NF aparecem aqui." />
        )}
      </div>
    </div>
  )
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'estoque', label: 'Estoque' },
  { key: 'vendidos', label: 'Mais vendidos' },
  { key: 'movimentacoes', label: 'Movimentações' },
]

export default function Products() {
  const [tab, setTab] = useState<Tab>('estoque')

  return (
    <div>
      <PageHeader title="Produtos" subtitle="Catálogo, estoque e o que mais vende">
        <Package className="h-5 w-5 text-gray-300" aria-hidden />
      </PageHeader>

      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'estoque' && <EstoqueTab />}
      {tab === 'vendidos' && <VendidosTab />}
      {tab === 'movimentacoes' && <MovimentacoesTab />}
    </div>
  )
}
