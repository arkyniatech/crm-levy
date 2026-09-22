import { supabase } from '../lib/supabase'

const ENRICH_URL = import.meta.env.VITE_N8N_ENRICH_URL as string | undefined

/** Dispara o enriquecimento NovaVida para até `limit` clientes ainda não processados. */
export async function enrichCustomers(
  limit: number,
  clientId?: string,
): Promise<{ ok: boolean; enriquecidos?: number; error?: string }> {
  if (!ENRICH_URL) return { ok: false, error: 'VITE_N8N_ENRICH_URL não está configurada no .env.' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Sessão expirada. Saia e entre de novo.' }
  try {
    const res = await fetch(ENRICH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ limit, client_id: clientId }),
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; enriquecidos?: number; error?: string } | null
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? `Falha (HTTP ${res.status}).` }
    return { ok: true, enriquecidos: json.enriquecidos ?? 0 }
  } catch {
    return { ok: false, error: 'Não foi possível falar com o serviço de enriquecimento.' }
  }
}


/* ---------------------------------------------------------------------------
 * Histórico de enriquecimentos.
 *
 * Quem registra é a própria tela, porque o enriquecimento é síncrono: ela
 * chama o fluxo e recebe o resultado na mesma requisição. A importação de
 * NF-e precisa do n8n para isso justamente por ser o contrário.
 * ------------------------------------------------------------------------- */

export interface EnrichRun {
  id: string
  email: string | null
  solicitados: number
  enriquecidos: number
  creditos_gastos: number
  status: 'concluido' | 'erro' | string
  erro: string | null
  created_at: string
}

/** Grava a corrida. Nunca lança: falhar o registro não pode derrubar a tela. */
export async function registrarEnriquecimento(input: {
  clientId: string
  solicitados: number
  enriquecidos: number
  erro?: string | null
}): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id
    if (!userId) return
    await supabase.from('enrich_runs').insert({
      client_id: input.clientId,
      user_id: userId,
      solicitados: input.solicitados,
      enriquecidos: input.enriquecidos,
      creditos_gastos: input.enriquecidos,
      status: input.erro ? 'erro' : 'concluido',
      erro: input.erro ?? null,
    })
  } catch {
    // histórico é registro, não operação: o enriquecimento já aconteceu
  }
}
