import { supabase } from '../lib/supabase'

const ADMIN_URL = import.meta.env.VITE_N8N_ADMIN_USERS_URL as string | undefined

export interface AdminUser {
  id: string
  email: string
  role: string
  created_at?: string
}

interface AdminResponse {
  ok: boolean
  error?: string
  users?: AdminUser[]
  id?: string
}

async function call(payload: Record<string, unknown>): Promise<AdminResponse> {
  if (!ADMIN_URL) return { ok: false, error: 'VITE_N8N_ADMIN_USERS_URL não configurada no .env.' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Sessão expirada. Saia e entre de novo.' }
  try {
    const res = await fetch(ADMIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => null)) as AdminResponse | null
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? `Falha (HTTP ${res.status}).` }
    return json
  } catch {
    return { ok: false, error: 'Não foi possível falar com o serviço de usuários.' }
  }
}

export function listUsers(): Promise<AdminResponse> {
  return call({ action: 'list' })
}

export function createUser(email: string, password: string, role: 'admin' | 'member'): Promise<AdminResponse> {
  return call({ action: 'create', email, password, role })
}

export function revokeUser(userId: string): Promise<AdminResponse> {
  return call({ action: 'revoke', user_id: userId })
}
