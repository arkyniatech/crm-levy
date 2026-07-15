import { Package } from 'lucide-react'
import { useTopProducts } from '../hooks/segments'
import { formatCurrency } from '../lib/format'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../components/ui'

export default function Products() {
  const { data, isLoading, error } = useTopProducts()
  const totalRevenue = (data ?? []).reduce((s, p) => s + p.revenue, 0)

  return (
    <div>
      <PageHeader title="Produtos" subtitle="O que mais vende — base para reposição e cross-sell" />

      {error && <ErrorState message={(error as Error).message} />}

      {!isLoading && data && data.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Produtos distintos</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{data.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Itens vendidos</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
              {data.reduce((s, p) => s + p.quantity, 0)}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Receita em itens</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>
      )}

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
        {!isLoading && (data ?? []).length === 0 && (
          <EmptyState
            title="Nenhum produto vendido ainda"
            hint="Os produtos aparecem aqui conforme os pedidos e itens são importados."
          />
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-gray-500">
        <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Ranking por receita somada dos itens (todas as lojas). Para ver o que um cliente específico comprou,
        abra o cliente em Clientes.
      </p>
    </div>
  )
}
