import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCompany } from '../context/CompanyContext'
import type { WaConversation, WaMessage } from '../types'

const SEND_URL = import.meta.env.VITE_N8N_WA_SEND_URL as string | undefined

export function useWaConversations() {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['wa-conversations', activeClient?.id],
    enabled: Boolean(activeClient),
    // realtime cobre o grosso; o polling é rede de segurança
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_conversations')
        .select('*, customers(id, name), wa_messages(body, created_at, direction)')
        .eq('client_id', activeClient!.id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { referencedTable: 'wa_messages', ascending: false })
        .limit(1, { referencedTable: 'wa_messages' })
      if (error) throw new Error(error.message)
      return (data ?? []) as WaConversation[]
    },
  })
}

export function useWaMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['wa-messages', conversationId],
    enabled: Boolean(conversationId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as WaMessage[]
    },
  })
}

/** Assina inserts/updates das tabelas de WhatsApp e refresca as queries na hora */
export function useWaRealtime() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel('wa-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['wa-messages'] })
        void queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}

export async function sendWaMessage(
  conversationId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!SEND_URL) {
    return { ok: false, error: 'VITE_N8N_WA_SEND_URL não está configurada no .env.' }
  }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Sessão expirada. Saia e entre de novo.' }
  try {
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversation_id: conversationId, body }),
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `Falha no envio (HTTP ${res.status}).` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível falar com o serviço de envio. Confira sua conexão.' }
  }
}

/** Janela de 24h da Meta: aberta enquanto a última mensagem do cliente tiver < 24h */
export function windowInfo(lastInboundAt: string | null): { open: boolean; hoursLeft: number } {
  if (!lastInboundAt) return { open: false, hoursLeft: 0 }
  const left = 24 * 60 * 60 * 1000 - (Date.now() - new Date(lastInboundAt).getTime())
  return { open: left > 0, hoursLeft: Math.max(0, Math.ceil(left / 3_600_000)) }
}
