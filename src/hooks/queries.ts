import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/fetchAll'
import { isCancelledStatus } from '../lib/format'
import { useCompany } from '../context/CompanyContext'
import type { Customer, CustomerWithStats, Order, OrderItem, Store } from '../types'

/** Lojas (stores) da empresa ativa — base para escopar orders por client_id */
export function useStores() {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['stores', activeClient?.id],
    enabled: Boolean(activeClient),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, client_id, marketplace, name, external_shop_id, status, created_at, updated_at')
        .eq('client_id', activeClient!.id)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as Store[]
    },
  })
}

export type Period = '30d' | 'month' | 'all'

export function periodStart(period: Period): string | null {
  const now = new Date()
  if (period === '30d') {
    const d = new Date(now)
    d.setDate(d.getDate() - 30)
    return d.toISOString()
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  }
  return null
}

interface OrderSlim {
  id: string
  customer_id: string | null
  total_amount: number | null
  ordered_at: string | null
  marketplace: string | null
  status: string | null
  store_id: string
}

/**
 * Pedidos "magros" (só colunas de agregação) das lojas da empresa ativa.
 * Carrega tudo do período paginando de 1000 em 1000 — volume de um seller
 * de marketplace é tranquilo para agregar no cliente.
 */
function useSlimOrders(period: Period) {
  const { activeClient } = useCompany()
  const { data: stores } = useStores()
  const storeIds = (stores ?? []).map((s) => s.id)
  return useQuery({
    queryKey: ['orders-slim', activeClient?.id, period, storeIds.join(',')],
    enabled: Boolean(activeClient) && stores !== undefined,
    queryFn: async () => {
      if (storeIds.length === 0) return [] as OrderSlim[]
      const start = periodStart(period)
      return fetchAllRows<OrderSlim>((from, to) => {
        let q = supabase
          .from('orders')
          .select('id, customer_id, total_amount, ordered_at, marketplace, status, store_id')
          .in('store_id', storeIds)
          .order('ordered_at', { ascending: false })
          .range(from, to)
        if (start) q = q.gte('ordered_at', start)
        return q
      })
    },
  })
}

export interface DashboardData {
  totalCustomers: number
  newThisMonth: number
  recurrentPct: number | null
  revenue: number
  orderCount: number
  revenueByMarketplace: { marketplace: string; revenue: number; orders: number }[]
  recentOrders: Order[]
  recentCustomers: Customer[]
}

export function useDashboard(period: Period) {
  const { activeClient } = useCompany()
  const { data: orders } = useSlimOrders(period)
  const { data: allOrders } = useSlimOrders('all')

  return useQuery({
    queryKey: ['dashboard', activeClient?.id, period, orders?.length, allOrders?.length],
    enabled: Boolean(activeClient) && orders !== undefined && allOrders !== undefined,
    queryFn: async (): Promise<DashboardData> => {
      const clientId = activeClient!.id
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

      const [totalRes, newRes, recentOrdersRes, recentCustomersRes] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .or(`first_seen_at.gte.${monthStart},and(first_seen_at.is.null,created_at.gte.${monthStart})`),
        supabase
          .from('orders')
          .select('*, stores!inner(client_id)')
          .eq('stores.client_id', clientId)
          .order('ordered_at', { ascending: false })
          .limit(8),
        supabase
          .from('customers')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(5),
      ])
      for (const res of [totalRes, newRes, recentOrdersRes, recentCustomersRes]) {
        if (res.error) throw new Error(res.error.message)
      }

      // Recorrência: clientes com 2+ pedidos (sobre todo o histórico)
      const byCustomer = new Map<string, number>()
      for (const o of allOrders!) {
        if (!o.customer_id || isCancelledStatus(o.status)) continue
        byCustomer.set(o.customer_id, (byCustomer.get(o.customer_id) ?? 0) + 1)
      }
      const identified = byCustomer.size
      const recurrent = [...byCustomer.values()].filter((n) => n >= 2).length
      const recurrentPct = identified > 0 ? (recurrent / identified) * 100 : null

      // Receita e gráfico por marketplace (período selecionado, sem cancelados)
      const valid = orders!.filter((o) => !isCancelledStatus(o.status))
      const revenue = valid.reduce((sum, o) => sum + (o.total_amount ?? 0), 0)
      const byMp = new Map<string, { revenue: number; orders: number }>()
      for (const o of valid) {
        const key = o.marketplace ?? 'outro'
        const cur = byMp.get(key) ?? { revenue: 0, orders: 0 }
        cur.revenue += o.total_amount ?? 0
        cur.orders += 1
        byMp.set(key, cur)
      }

      return {
        totalCustomers: totalRes.count ?? 0,
        newThisMonth: newRes.count ?? 0,
        recurrentPct,
        revenue,
        orderCount: valid.length,
        revenueByMarketplace: [...byMp.entries()]
          .map(([marketplace, v]) => ({ marketplace, ...v }))
          .sort((a, b) => b.revenue - a.revenue),
        recentOrders: (recentOrdersRes.data ?? []) as unknown as Order[],
        recentCustomers: (recentCustomersRes.data ?? []) as Customer[],
      }
    },
  })
}

export const CUSTOMERS_PAGE_SIZE = 25

export function useCustomers(search: string, page: number) {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['customers', activeClient?.id, search, page],
    enabled: Boolean(activeClient),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const from = page * CUSTOMERS_PAGE_SIZE
      let q = supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .eq('client_id', activeClient!.id)
        .order('created_at', { ascending: false })
        .range(from, from + CUSTOMERS_PAGE_SIZE - 1)
      const term = search.trim()
      if (term) {
        const like = `%${term}%`
        const digits = term.replace(/\D/g, '')
        const filters = [`name.ilike.${like}`, `city.ilike.${like}`]
        if (digits) filters.push(`cpf.ilike.%${digits}%`)
        q = q.or(filters.join(','))
      }
      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      const customers = (data ?? []) as Customer[]

      // Agregados de pedidos só para os clientes da página atual
      const ids = customers.map((c) => c.id)
      const stats = new Map<string, { orderCount: number; totalSpent: number; lastOrderAt: string | null }>()
      if (ids.length > 0) {
        const rows = await fetchAllRows<{ customer_id: string; total_amount: number | null; ordered_at: string | null; status: string | null }>(
          (f, t) =>
            supabase
              .from('orders')
              .select('customer_id, total_amount, ordered_at, status')
              .in('customer_id', ids)
              .range(f, t),
        )
        for (const r of rows) {
          if (isCancelledStatus(r.status)) continue
          const cur = stats.get(r.customer_id) ?? { orderCount: 0, totalSpent: 0, lastOrderAt: null }
          cur.orderCount += 1
          cur.totalSpent += r.total_amount ?? 0
          if (r.ordered_at && (!cur.lastOrderAt || r.ordered_at > cur.lastOrderAt)) cur.lastOrderAt = r.ordered_at
          stats.set(r.customer_id, cur)
        }
      }

      const withStats: CustomerWithStats[] = customers.map((c) => ({
        ...c,
        orderCount: stats.get(c.id)?.orderCount ?? 0,
        totalSpent: stats.get(c.id)?.totalSpent ?? 0,
        lastOrderAt: stats.get(c.id)?.lastOrderAt ?? null,
      }))
      return { customers: withStats, total: count ?? 0 }
    },
  })
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[]
  stores: { name: string | null; marketplace: string } | null
}

export function useCustomerDetail(customerId: string | undefined) {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['customer', customerId],
    enabled: Boolean(activeClient) && Boolean(customerId),
    queryFn: async () => {
      const [customerRes, ordersRes] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('id', customerId!)
          .eq('client_id', activeClient!.id)
          .maybeSingle(),
        supabase
          .from('orders')
          .select('*, order_items(*), stores(name, marketplace)')
          .eq('customer_id', customerId!)
          .order('ordered_at', { ascending: false }),
      ])
      if (customerRes.error) throw new Error(customerRes.error.message)
      if (ordersRes.error) throw new Error(ordersRes.error.message)
      return {
        customer: customerRes.data as Customer | null,
        orders: (ordersRes.data ?? []) as unknown as OrderWithItems[],
      }
    },
  })
}

export const ORDERS_PAGE_SIZE = 25

export interface OrdersFilter {
  marketplace: string
  status: string
  search: string
  from: string
  to: string
  page: number
}

export function useOrders({ marketplace, status, search, from: dateFrom, to: dateTo, page }: OrdersFilter) {
  const { activeClient } = useCompany()
  const { data: stores } = useStores()
  const storeIds = (stores ?? []).map((s) => s.id)
  return useQuery({
    queryKey: ['orders', activeClient?.id, marketplace, status, search, dateFrom, dateTo, page, storeIds.join(',')],
    enabled: Boolean(activeClient) && stores !== undefined,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      if (storeIds.length === 0) return { orders: [] as (Order & { customers: { id: string; name: string | null } | null })[], total: 0 }
      const from = page * ORDERS_PAGE_SIZE
      let q = supabase
        .from('orders')
        .select('*, customers(id, name)', { count: 'exact' })
        .in('store_id', storeIds)
        .order('ordered_at', { ascending: false })
        .range(from, from + ORDERS_PAGE_SIZE - 1)
      if (marketplace) q = q.eq('marketplace', marketplace)
      if (status) q = q.eq('status', status)
      if (dateFrom) q = q.gte('ordered_at', new Date(dateFrom + 'T00:00:00').toISOString())
      if (dateTo) q = q.lte('ordered_at', new Date(dateTo + 'T23:59:59').toISOString())
      const term = search.trim()
      if (term) {
        const like = `%${term}%`
        q = q.or(`external_order_id.ilike.${like},buyer_name.ilike.${like}`)
      }
      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      return {
        orders: (data ?? []) as unknown as (Order & { customers: { id: string; name: string | null } | null })[],
        total: count ?? 0,
      }
    },
  })
}

/** Valores de status realmente presentes no banco, para montar o filtro */
export function useOrderStatuses() {
  const { activeClient } = useCompany()
  const { data: stores } = useStores()
  const storeIds = (stores ?? []).map((s) => s.id)
  return useQuery({
    queryKey: ['order-statuses', activeClient?.id, storeIds.join(',')],
    enabled: Boolean(activeClient) && stores !== undefined,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (storeIds.length === 0) return [] as string[]
      const rows = await fetchAllRows<{ status: string | null }>((f, t) =>
        supabase.from('orders').select('status').in('store_id', storeIds).range(f, t),
      )
      return [...new Set(rows.map((r) => r.status).filter((s): s is string => Boolean(s)))].sort()
    },
  })
}

/** Contagem de pedidos dos últimos 30 dias por loja (card de Integrações) */
export function useStoreVolumes(storeIds: string[]) {
  return useQuery({
    queryKey: ['store-volumes', storeIds.join(',')],
    enabled: storeIds.length > 0,
    queryFn: async () => {
      const since = periodStart('30d')!
      const counts = await Promise.all(
        storeIds.map(async (id) => {
          const { count, error } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', id)
            .gte('ordered_at', since)
          if (error) throw new Error(error.message)
          return [id, count ?? 0] as const
        }),
      )
      return Object.fromEntries(counts) as Record<string, number>
    },
  })
}
