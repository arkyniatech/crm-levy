import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Store } from '../types'

/** Uma linha de `clients` — o CLIENTE (empresa), com o resumo do que tem dentro. */
export interface ClientOverview {
  id: string
  name: string | null
  document: string | null
  created_at: string | null
  /** contas de marketplace (stores) */
  lojas: number
  /** pessoas com acesso (user_clients) */
  acessos: number
  /** tamanho da base de consumidores */
  clientes_base: number
  /** quantas instâncias de WhatsApp este cliente pode ter (master define) */
  wa_instance_limit: number
  /** quantas já existem */
  wa_instances: number
}

export function useClientsOverview() {
  return useQuery({
    queryKey: ['clients-overview'],
    queryFn: async (): Promise<ClientOverview[]> => {
      const { data, error } = await supabase.rpc('crm_clients_overview')
      if (error) throw new Error(error.message)
      return (data ?? []) as ClientOverview[]
    },
  })
}

/** Lojas (contas de marketplace) de um cliente. */
export function useClientStores(clientId: string | null) {
  return useQuery({
    queryKey: ['client-stores', clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<Store[]> => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, client_id, marketplace, name, external_shop_id, status, created_at, updated_at')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as Store[]
    },
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; document: string | null }) => {
      const { data, error } = await supabase
        .from('clients')
        .insert({ name: input.name, document: input.document })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return data as { id: string }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}

export function useUpdateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name: string
      document: string | null
      waInstanceLimit: number
    }) => {
      const { error } = await supabase
        .from('clients')
        .update({
          name: input.name,
          document: input.document,
          wa_instance_limit: input.waInstanceLimit,
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients-overview'] })
      // o seletor de empresa no topo também mostra o nome
      void queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}

export function useCreateStore() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      clientId: string
      marketplace: string
      name: string
      externalShopId: string
    }) => {
      const { error } = await supabase.from('stores').insert({
        client_id: input.clientId,
        marketplace: input.marketplace,
        name: input.name,
        external_shop_id: input.externalShopId || null,
        status: 'active',
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['client-stores', vars.clientId] })
      void queryClient.invalidateQueries({ queryKey: ['clients-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['stores'] })
    },
  })
}

export function useUpdateStore() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; clientId: string; patch: Partial<Store> }) => {
      const { error } = await supabase
        .from('stores')
        .update({ ...input.patch, updated_at: new Date().toISOString() })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['client-stores', vars.clientId] })
      void queryClient.invalidateQueries({ queryKey: ['stores'] })
    },
  })
}
