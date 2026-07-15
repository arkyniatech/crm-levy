import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/fetchAll'
import { isCancelledStatus } from '../lib/format'
import { useCompany } from '../context/CompanyContext'
import { useStores } from './queries'
import {
  DEFAULT_SEGMENT_PARAMS,
  inSegment,
  SEGMENTS,
  type CustomerStat,
  type SegmentKey,
  type SegmentParams,
} from '../lib/segments'

export interface SegmentMember {
  id: string
  name: string | null
  cpf: string | null
  city: string | null
  state: string | null
  birth_date: string | null
  orderCount: number
  totalSpent: number
  lastOrderAt: string | null
  hasPhone: boolean
}

export interface SegmentResult {
  key: SegmentKey
  count: number
  withPhone: number
  members: SegmentMember[]
}

interface CustomerRow {
  id: string
  name: string | null
  cpf: string | null
  phone: string | null
  birth_date: string | null
  city: string | null
  state: string | null
}

interface OrderRow {
  customer_id: string | null
  total_amount: number | null
  ordered_at: string | null
  status: string | null
  buyer_phone: string | null
}

export function useSegments(params: SegmentParams = DEFAULT_SEGMENT_PARAMS) {
  const { activeClient } = useCompany()
  const { data: stores } = useStores()
  const storeIds = (stores ?? []).map((s) => s.id)

  return useQuery({
    queryKey: ['segments', activeClient?.id, storeIds.join(','), params.inactiveDays, params.vipMinSpent],
    enabled: Boolean(activeClient) && stores !== undefined,
    queryFn: async (): Promise<{ segments: SegmentResult[]; totalCustomers: number }> => {
      const [customers, orders] = await Promise.all([
        fetchAllRows<CustomerRow>((from, to) =>
          supabase
            .from('customers')
            .select('id, name, cpf, phone, birth_date, city, state')
            .eq('client_id', activeClient!.id)
            .range(from, to),
        ),
        storeIds.length === 0
          ? Promise.resolve([] as OrderRow[])
          : fetchAllRows<OrderRow>((from, to) =>
              supabase
                .from('orders')
                .select('customer_id, total_amount, ordered_at, status, buyer_phone')
                .in('store_id', storeIds)
                .range(from, to),
            ),
      ])

      // agrega pedidos por cliente (ignora cancelados)
      const stats = new Map<string, { count: number; total: number; last: string | null; phone: boolean }>()
      for (const o of orders) {
        if (!o.customer_id || isCancelledStatus(o.status)) continue
        const cur = stats.get(o.customer_id) ?? { count: 0, total: 0, last: null, phone: false }
        cur.count += 1
        cur.total += o.total_amount ?? 0
        if (o.ordered_at && (!cur.last || o.ordered_at > cur.last)) cur.last = o.ordered_at
        if (o.buyer_phone && o.buyer_phone.replace(/\D/g, '').length >= 10) cur.phone = true
        stats.set(o.customer_id, cur)
      }

      const results: SegmentResult[] = SEGMENTS.map((def) => ({ key: def.key, count: 0, withPhone: 0, members: [] }))
      const byKey = new Map(results.map((r) => [r.key, r]))

      for (const c of customers) {
        const st = stats.get(c.id) ?? { count: 0, total: 0, last: null, phone: false }
        const hasPhone = Boolean(c.phone && c.phone.replace(/\D/g, '').length >= 10) || st.phone
        const stat: CustomerStat = {
          orderCount: st.count,
          totalSpent: st.total,
          lastOrderAt: st.last,
          birthMonth: c.birth_date ? new Date(c.birth_date + 'T00:00:00').getMonth() + 1 : null,
          hasPhone,
        }
        for (const def of SEGMENTS) {
          if (!inSegment(def.key, stat, params)) continue
          const r = byKey.get(def.key)!
          r.count += 1
          if (hasPhone) r.withPhone += 1
          if (r.members.length < 200) {
            r.members.push({
              id: c.id,
              name: c.name,
              cpf: c.cpf,
              city: c.city,
              state: c.state,
              birth_date: c.birth_date,
              orderCount: st.count,
              totalSpent: st.total,
              lastOrderAt: st.last,
              hasPhone,
            })
          }
        }
      }

      // ordena membros por valor gasto (mais relevantes primeiro)
      for (const r of results) r.members.sort((a, b) => b.totalSpent - a.totalSpent)

      return { segments: results, totalCustomers: customers.length }
    },
  })
}

export interface TopProduct {
  name: string
  sku: string | null
  quantity: number
  revenue: number
  orders: number
}

export function useTopProducts() {
  const { activeClient } = useCompany()
  const { data: stores } = useStores()
  const storeIds = (stores ?? []).map((s) => s.id)

  return useQuery({
    queryKey: ['top-products', activeClient?.id, storeIds.join(',')],
    enabled: Boolean(activeClient) && stores !== undefined,
    queryFn: async (): Promise<TopProduct[]> => {
      if (storeIds.length === 0) return []
      // order_items -> orders (para escopar por loja do cliente)
      const rows = await fetchAllRows<{
        product_name: string | null
        sku: string | null
        quantity: number | null
        total_price: number | null
      }>((from, to) =>
        supabase
          .from('order_items')
          .select('product_name, sku, quantity, total_price, orders!inner(store_id)')
          .in('orders.store_id', storeIds)
          .range(from, to) as unknown as PromiseLike<{
          data: {
            product_name: string | null
            sku: string | null
            quantity: number | null
            total_price: number | null
          }[] | null
          error: { message: string } | null
        }>,
      )

      const map = new Map<string, TopProduct>()
      for (const r of rows) {
        const key = (r.sku || r.product_name || 'sem-nome').toLowerCase()
        const cur = map.get(key) ?? {
          name: r.product_name || 'Produto sem nome',
          sku: r.sku,
          quantity: 0,
          revenue: 0,
          orders: 0,
        }
        cur.quantity += r.quantity ?? 0
        cur.revenue += r.total_price ?? 0
        cur.orders += 1
        map.set(key, cur)
      }
      return [...map.values()].sort((a, b) => b.revenue - a.revenue)
    },
  })
}
