import { supabase } from '../lib/supabase'

const ADMIN_URL = import.meta.env.VITE_N8N_ADMIN_USERS_URL as string | undefined

export interface AdminUser {
  id: string
  email: string
  /** 'admin' | 'collaborator' — papel NESTA loja. Master não aparece na lista. */
  role: string
  created_at?: string
}

/** Papéis que se pode conceder pela tela. `master` só no SQL, na mão. */
export type GrantableRole = 'admin' | 'collaborator'

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

/**
 * Todas as chamadas levam client_id: o acesso é concedido POR LOJA.
 * O n8n não deve confiar nesse valor — tem que conferir, pelo JWT, se quem
 * chamou é master ou admin daquela loja antes de gravar. Ver
 * docs/n8n-contrato-acessos.md.
 */
export function listUsers(clientId: string): Promise<AdminResponse> {
  return call({ action: 'list', client_id: clientId })
}

export function createUser(
  email: string,
  password: string,
  role: GrantableRole,
  clientId: string,
): Promise<AdminResponse> {
  return call({ action: 'create', email, password, role, client_id: clientId })
}

export function revokeUser(userId: string, clientId: string): Promise<AdminResponse> {
  return call({ action: 'revoke', user_id: userId, client_id: clientId })
}
