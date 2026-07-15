import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCompany } from '../context/CompanyContext'

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
