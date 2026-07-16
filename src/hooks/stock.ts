import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCompany } from '../context/CompanyContext'

export interface Product {
  id: string
  sku: string
  name: string | null
  stock: number
  price: number | null
  active: boolean
  updated_at: string
}

export interface StockMovement {
  id: string
  product_id: string
  sku: string | null
  delta: number
  reason: string
  ref: string | null
  created_at: string
  products?: { name: string | null; sku: string } | null
}

export function useProducts(search: string) {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['products', activeClient?.id, search],
    enabled: Boolean(activeClient),
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Product[]> => {
      let q = supabase
        .from('products')
        .select('id, sku, name, stock, price, active, updated_at')
        .eq('client_id', activeClient!.id)
        .order('name', { ascending: true })
      const term = search.trim()
      if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
      const { data, error } = await q.limit(500)
      if (error) throw new Error(error.message)
      return (data ?? []) as Product[]
    },
  })
}

export function useStockMovements() {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['stock-movements', activeClient?.id],
    enabled: Boolean(activeClient),
    queryFn: async (): Promise<StockMovement[]> => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, product_id, sku, delta, reason, ref, created_at, products(name, sku)')
        .eq('client_id', activeClient!.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as StockMovement[]
    },
  })
}

export function useStockActions() {
  const { activeClient } = useCompany()
  const queryClient = useQueryClient()

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['products'] })
    void queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
  }

  const createProduct = async (p: {
    sku: string
    name: string
    price: number | null
    initialStock: number
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!activeClient) return { ok: false, error: 'Empresa não carregada.' }
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('products')
      .insert({ client_id: activeClient.id, sku: p.sku.trim(), name: p.name.trim() || null, price: p.price })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    if (p.initialStock && p.initialStock !== 0) {
      const { error: mErr } = await supabase.from('stock_movements').insert({
        client_id: activeClient.id,
        product_id: data.id,
        sku: p.sku.trim(),
        delta: p.initialStock,
        reason: 'initial',
        ref: 'saldo inicial',
        created_by: userData.user?.id ?? null,
      })
      if (mErr) return { ok: false, error: mErr.message }
    }
    refresh()
    return { ok: true }
  }

  /** Lança um movimento de estoque (delta + = entrada, - = saída). O saldo é atualizado pelo trigger. */
  const move = async (
    product: Product,
    delta: number,
    reason: string,
    ref: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!activeClient) return { ok: false, error: 'Empresa não carregada.' }
    if (!delta) return { ok: false, error: 'Quantidade não pode ser zero.' }
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('stock_movements').insert({
      client_id: activeClient.id,
      product_id: product.id,
      sku: product.sku,
      delta,
      reason,
      ref: ref || null,
      created_by: userData.user?.id ?? null,
    })
    if (error) return { ok: false, error: error.message }
    refresh()
    return { ok: true }
  }

  return { createProduct, move }
}

export const REASON_LABEL: Record<string, string> = {
  initial: 'Saldo inicial',
  manual_in: 'Entrada manual',
  manual_out: 'Saída manual',
  nfe: 'Baixa por NF-e',
  file_in: 'Entrada por arquivo',
  file_out: 'Saída por arquivo',
  adjust: 'Ajuste',
}

// util reexport para tela de mais vendidos
export { useTopProducts } from './segments'
