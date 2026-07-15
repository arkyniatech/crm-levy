import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCompany } from '../context/CompanyContext'
import { useAuth } from '../context/AuthContext'

/** true se o usuário logado tem papel 'admin' em user_roles. */
export function useIsAdmin() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['user-role', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) return false // tabela ainda não existe → trata como não-admin
      return data?.role === 'admin'
    },
  })
}

/** Recarrega/ajusta o saldo de créditos (uso do admin). */
export function useSaveCredits() {
  const { activeClient } = useCompany()
  const queryClient = useQueryClient()
  return async (patch: { balance: number; validUntil: string | null }): Promise<{ ok: boolean; error?: string }> => {
    if (!activeClient) return { ok: false, error: 'Empresa não carregada.' }
    const value: Record<string, unknown> = { balance: Math.max(0, Math.round(patch.balance)) }
    if (patch.validUntil) value.valid_until = patch.validUntil
    const { error } = await supabase.from('app_settings').upsert(
      { client_id: activeClient.id, key: 'enrichment_credits', value, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,key' },
    )
    if (error) return { ok: false, error: error.message }
    void queryClient.invalidateQueries({ queryKey: ['settings', 'enrichment_credits'] })
    return { ok: true }
  }
}

export interface CampaignDelay {
  min: number
  max: number
}

const DEFAULT_DELAY: CampaignDelay = { min: 2, max: 6 }

export function useCampaignDelay() {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['settings', 'campaign_delay', activeClient?.id],
    enabled: Boolean(activeClient),
    queryFn: async (): Promise<CampaignDelay> => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('client_id', activeClient!.id)
        .eq('key', 'campaign_delay')
        .maybeSingle()
      if (error) throw new Error(error.message)
      const v = (data?.value ?? {}) as Partial<CampaignDelay>
      return { min: Number(v.min) || DEFAULT_DELAY.min, max: Number(v.max) || DEFAULT_DELAY.max }
    },
  })
}

export interface EnrichmentCredits {
  balance: number
  validUntil: string | null
}

/** Saldo de créditos de enriquecimento (1 crédito = 1 enriquecimento). */
export function useEnrichmentCredits() {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['settings', 'enrichment_credits', activeClient?.id],
    enabled: Boolean(activeClient),
    queryFn: async (): Promise<EnrichmentCredits> => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('client_id', activeClient!.id)
        .eq('key', 'enrichment_credits')
        .maybeSingle()
      if (error) throw new Error(error.message)
      const v = (data?.value ?? {}) as { balance?: number; valid_until?: string }
      return { balance: Math.max(0, Number(v.balance) || 0), validUntil: v.valid_until ?? null }
    },
  })
}

/** Desconta `amount` créditos do saldo (chamado após um enriquecimento). */
export function useSpendCredits() {
  const { activeClient } = useCompany()
  const queryClient = useQueryClient()
  return async (amount: number): Promise<void> => {
    if (!activeClient || amount <= 0) return
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('client_id', activeClient.id)
      .eq('key', 'enrichment_credits')
      .maybeSingle()
    const v = (data?.value ?? {}) as { balance?: number; valid_until?: string }
    const next = { ...v, balance: Math.max(0, (Number(v.balance) || 0) - amount) }
    await supabase.from('app_settings').upsert(
      {
        client_id: activeClient.id,
        key: 'enrichment_credits',
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,key' },
    )
    void queryClient.invalidateQueries({ queryKey: ['settings', 'enrichment_credits'] })
  }
}

export interface BirthdaySettings {
  enabled: boolean
  message: string
}

const DEFAULT_BIRTHDAY: BirthdaySettings = {
  enabled: false,
  message:
    'Feliz aniversário! 🎉 Passando pra te desejar um dia incrível — e preparamos um mimo especial só pra hoje. 🎁',
}

export function useBirthdaySettings() {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['settings', 'birthday_campaign', activeClient?.id],
    enabled: Boolean(activeClient),
    queryFn: async (): Promise<BirthdaySettings> => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('client_id', activeClient!.id)
        .eq('key', 'birthday_campaign')
        .maybeSingle()
      if (error) throw new Error(error.message)
      const v = (data?.value ?? {}) as Partial<BirthdaySettings>
      return {
        enabled: Boolean(v.enabled),
        message: typeof v.message === 'string' && v.message.trim() ? v.message : DEFAULT_BIRTHDAY.message,
      }
    },
  })
}

export function useSaveBirthdaySettings() {
  const { activeClient } = useCompany()
  const queryClient = useQueryClient()
  return async (settings: BirthdaySettings): Promise<{ ok: boolean; error?: string }> => {
    if (!activeClient) return { ok: false, error: 'Empresa não carregada.' }
    const { error } = await supabase.from('app_settings').upsert(
      {
        client_id: activeClient.id,
        key: 'birthday_campaign',
        value: settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,key' },
    )
    if (error) return { ok: false, error: error.message }
    void queryClient.invalidateQueries({ queryKey: ['settings', 'birthday_campaign'] })
    return { ok: true }
  }
}

export function useSaveCampaignDelay() {
  const { activeClient } = useCompany()
  const queryClient = useQueryClient()
  return async (delay: CampaignDelay): Promise<{ ok: boolean; error?: string }> => {
    if (!activeClient) return { ok: false, error: 'Empresa não carregada.' }
    const { error } = await supabase.from('app_settings').upsert(
      {
        client_id: activeClient.id,
        key: 'campaign_delay',
        value: delay,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,key' },
    )
    if (error) return { ok: false, error: error.message }
    void queryClient.invalidateQueries({ queryKey: ['settings', 'campaign_delay'] })
    return { ok: true }
  }
}
