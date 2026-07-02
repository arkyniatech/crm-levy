import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Só a chave anon (pública, protegida por RLS) pode ser usada no frontend.
// A tabela store_tokens contém segredos e NUNCA deve ser consultada daqui.
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder',
)
