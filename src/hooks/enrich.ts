import { supabase } from '../lib/supabase'

const ENRICH_URL = import.meta.env.VITE_N8N_ENRICH_URL as string | undefined

/** Dispara o enriquecimento NovaVida para até `limit` clientes ainda não processados. */
export async function enrichCustomers(limit: number): Promise<{ ok: boolean; enriquecidos?: number; error?: string }> {
  if (!ENRICH_URL) return { ok: false, error: 'VITE_N8N_ENRICH_URL não está configurada no .env.' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Sessão expirada. Saia e entre de novo.' }
  try {
    const res = await fetch(ENRICH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ limit }),
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; enriquecidos?: number; error?: string } | null
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? `Falha (HTTP ${res.status}).` }
    return { ok: true, enriquecidos: json.enriquecidos ?? 0 }
  } catch {
    return { ok: false, error: 'Não foi possível falar com o serviço de enriquecimento.' }
  }
}
