import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCompany } from '../context/CompanyContext'

const CAMPAIGN_URL = import.meta.env.VITE_N8N_WA_CAMPAIGN_URL as string | undefined

export interface WaCampaign {
  id: string
  client_id: string
  name: string
  message_body: string
  media_url?: string | null
  audience: {
    type?: string
    segment?: string
    days?: number
    min_spent?: number
    numbers?: string[]
    customer_ids?: string[]
  }
  status: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  wa_campaign_recipients?: { status: string }[]
}

export interface CampaignCounts {
  total: number
  pending: number
  sent: number
  delivered: number
  read: number
  failed: number
}

export function campaignCounts(c: WaCampaign): CampaignCounts {
  const counts: CampaignCounts = { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 }
  for (const r of c.wa_campaign_recipients ?? []) {
    counts.total += 1
    if (r.status === 'pending') counts.pending += 1
    else if (r.status === 'sent') counts.sent += 1
    else if (r.status === 'delivered') counts.delivered += 1
    else if (r.status === 'read') counts.read += 1
    else if (r.status === 'failed' || r.status === 'undelivered') counts.failed += 1
  }
  return counts
}

export function useWaCampaigns() {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['wa-campaigns', activeClient?.id],
    enabled: Boolean(activeClient),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((c) => c.status === 'sending') ? 4_000 : 30_000,
    queryFn: async (): Promise<WaCampaign[]> => {
      const { data, error } = await supabase
        .from('wa_campaigns')
        .select('*, wa_campaign_recipients(status)')
        .eq('client_id', activeClient!.id)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as WaCampaign[]
    },
  })
}

export interface AudienceInput {
  type: 'test' | 'all' | 'recent' | 'segment' | 'manual'
  segment?: 'one_time' | 'recorrente' | 'vip' | 'inactive' | 'birthday'
  days?: number
  min_spent?: number
  numbers?: string[]
  customer_ids?: string[]
}

interface CampaignActionResponse {
  ok: boolean
  error?: string
  total?: number
  skipped_optout?: number
  sample?: { wa_number: string; name: string | null }[]
  campaign_id?: string
  sending?: number
}

/** Edita nome/mensagem de uma campanha (rascunho). Escrita direta via RLS. */
export async function updateCampaign(
  id: string,
  patch: { name?: string; message_body?: string },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('wa_campaigns').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Exclui uma campanha (os destinatários caem por cascade). Escrita direta via RLS. */
export async function deleteCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('wa_campaigns').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Sobe uma imagem de campanha para o storage e devolve a URL pública. */
export async function uploadCampaignImage(file: File): Promise<{ ok: boolean; url?: string; error?: string }> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('campaign-media').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (error) return { ok: false, error: error.message }
  const { data } = supabase.storage.from('campaign-media').getPublicUrl(path)
  return { ok: true, url: data.publicUrl }
}

export async function campaignAction(payload: {
  action: 'preview' | 'create' | 'start'
  name?: string
  message_body?: string
  media_url?: string | null
  audience?: AudienceInput
  campaign_id?: string
}): Promise<CampaignActionResponse> {
  if (!CAMPAIGN_URL) {
    return { ok: false, error: 'VITE_N8N_WA_CAMPAIGN_URL não está configurada no .env.' }
  }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Sessão expirada. Saia e entre de novo.' }
  try {
    const res = await fetch(CAMPAIGN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => null)) as CampaignActionResponse | null
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `Falha na operação (HTTP ${res.status}).` }
    }
    return json
  } catch {
    return { ok: false, error: 'Não foi possível falar com o serviço de campanhas.' }
  }
}
