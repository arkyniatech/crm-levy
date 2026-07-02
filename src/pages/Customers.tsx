import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { CUSTOMERS_PAGE_SIZE, useCustomers } from '../hooks/queries'
import { formatCurrency, formatDate, maskCpf } from '../lib/format'
import { EmptyState, ErrorState, LoadingRows, PageHeader, Pagination } from '../components/ui'

export default function Customers() {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const { data, isLoading, error, isFetching } = useCustomers(search, page)

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
      </PageHeader>

      {error && <ErrorState message={(error as Error).message} />}

      <div className={`card overflow-hidden ${isFetching && !isLoading ? 'opacity-70' : ''}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Nome</th>
                <th className="th">CPF</th>
                <th className="th">Cidade/UF</th>
                <th className="th text-right">Pedidos</th>
                <th className="th text-right">Total gasto</th>
                <th className="th">Última compra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <LoadingRows cols={6} />
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
                    <td className="td text-right tabular-nums">{c.orderCount}</td>
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
            title={search ? `Nenhum cliente encontrado para "${search}"` : 'Nenhum cliente ainda'}
            hint={
              search
                ? 'Tente outro nome, CPF ou cidade.'
                : 'Os clientes aparecem aqui conforme os pedidos são importados dos marketplaces.'
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
