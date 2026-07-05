import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  MessageSquare,
  Send,
  User,
} from 'lucide-react'
import {
  sendWaMessage,
  useWaConversations,
  useWaMessages,
  useWaRealtime,
  windowInfo,
} from '../hooks/whatsapp'
import { formatDateTime } from '../lib/format'
import { EmptyState, ErrorState } from '../components/ui'
import type { WaConversation, WaMessage } from '../types'

function conversationTitle(c: WaConversation): string {
  return c.customers?.name || c.profile_name || c.wa_number
}

function StatusTicks({ m }: { m: WaMessage }) {
  if (m.direction !== 'outbound') return null
  const s = (m.status ?? '').toLowerCase()
  if (s === 'failed' || s === 'undelivered') {
    return (
      <AlertCircle
        className="h-3.5 w-3.5 text-red-200"
        aria-label={`Falhou${m.error_code ? ` (código ${m.error_code})` : ''}`}
      />
    )
  }
  if (s === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-200" aria-label="Lida" />
  if (s === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-white/80" aria-label="Entregue" />
  return <Check className="h-3.5 w-3.5 text-white/70" aria-label="Enviada" />
}

function Thread({ conversation, onBack }: { conversation: WaConversation; onBack: () => void }) {
  const { data: messages, isLoading, error } = useWaMessages(conversation.id)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const janela = windowInfo(conversation.last_inbound_at)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length])

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    const texto = draft.trim()
    if (!texto || sending) return
    setSending(true)
    setSendError(null)
    const result = await sendWaMessage(conversation.id, texto)
    setSending(false)
    if (!result.ok) {
      setSendError(result.error ?? 'Falha ao enviar.')
      return
    }
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabeçalho da conversa */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 lg:hidden"
          aria-label="Voltar para a lista de conversas"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <User className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{conversationTitle(conversation)}</p>
          <p className="truncate text-xs tabular-nums text-gray-500">
            {conversation.wa_number}
            {conversation.customers?.name && conversation.customer_id && (
              <>
                {' · '}
                <Link to={`/clientes/${conversation.customer_id}`} className="text-brand-700 hover:underline">
                  ver cliente
                </Link>
              </>
            )}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
            janela.open
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-gray-200 bg-gray-100 text-gray-600'
          }`}
        >
          <Clock className="h-3 w-3" aria-hidden />
          {janela.open ? `Janela aberta · ${janela.hoursLeft}h restantes` : 'Janela fechada'}
        </span>
      </div>

      {/* Mensagens */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-gray-100 px-4 py-4">
        {error && <ErrorState message={(error as Error).message} />}
        {isLoading && <p className="py-8 text-center text-sm text-gray-500">Carregando conversa…</p>}
        {messages?.map((m) => (
          <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[65%] ${
                m.direction === 'outbound'
                  ? 'rounded-br-md bg-brand-600 text-white'
                  : 'rounded-bl-md border border-gray-200 bg-white text-gray-900'
              }`}
            >
              {m.media_url && (
                <p className={`mb-1 text-xs italic ${m.direction === 'outbound' ? 'text-white/80' : 'text-gray-500'}`}>
                  [anexo: {m.media_content_type ?? 'mídia'}]
                </p>
              )}
              <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
              <div
                className={`mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums ${
                  m.direction === 'outbound' ? 'text-white/70' : 'text-gray-400'
                }`}
              >
                {formatDateTime(m.created_at)}
                <StatusTicks m={m} />
              </div>
            </div>
          </div>
        ))}
        {messages?.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">Nenhuma mensagem nesta conversa ainda.</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Caixa de envio */}
      <form onSubmit={handleSend} className="border-t border-gray-200 bg-white p-3">
        {sendError && (
          <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {sendError}
          </p>
        )}
        {!janela.open && (
          <p className="mb-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            Janela de 24h fechada — o cliente precisa mandar uma mensagem antes de você poder responder
            com texto livre. (Envio por template entra com o número definitivo.)
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-1"
            placeholder={janela.open ? 'Escreva sua mensagem…' : 'Janela fechada — aguardando o cliente'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!janela.open || sending}
            aria-label="Mensagem"
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!janela.open || sending || !draft.trim()}>
            <Send className="h-4 w-4" aria-hidden />
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Messages() {
  useWaRealtime()
  const { data: conversations, isLoading, error } = useWaConversations()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = conversations?.find((c) => c.id === selectedId) ?? null

  // seleciona a primeira conversa automaticamente no desktop
  useEffect(() => {
    if (!selectedId && conversations && conversations.length > 0 && window.innerWidth >= 1024) {
      setSelectedId(conversations[0].id)
    }
  }, [conversations, selectedId])

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[24rem] flex-col lg:h-[calc(100vh-3rem)]">
      <div className="mb-4">
        <h1 className="font-display text-xl font-semibold tracking-tight text-gray-900">Mensagens</h1>
        <p className="mt-0.5 text-sm text-gray-500">Conversas de WhatsApp com seus clientes, em tempo real</p>
      </div>

      {error && <ErrorState message={(error as Error).message} />}

      <div className="card flex min-h-0 flex-1 overflow-hidden">
        {/* Lista de conversas */}
        <div
          className={`w-full flex-col border-r border-gray-200 lg:flex lg:w-80 lg:shrink-0 ${
            selected ? 'hidden' : 'flex'
          }`}
        >
          <div className="overflow-y-auto">
            {isLoading && (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-md bg-gray-100" />
                ))}
              </div>
            )}
            {!isLoading && conversations?.length === 0 && (
              <EmptyState
                title="Nenhuma conversa ainda"
                hint="Quando um cliente mandar mensagem no WhatsApp conectado, ela aparece aqui."
              />
            )}
            {conversations?.map((c) => {
              const last = c.wa_messages?.[0]
              const janela = windowInfo(c.last_inbound_at)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
                    selectedId === c.id ? 'bg-brand-50' : ''
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <MessageSquare className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">{conversationTitle(c)}</p>
                      <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                        {c.last_message_at ? formatDateTime(c.last_message_at) : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {last ? `${last.direction === 'outbound' ? 'Você: ' : ''}${last.body ?? '[anexo]'}` : '—'}
                    </p>
                  </div>
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${janela.open ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    title={janela.open ? 'Janela de 24h aberta' : 'Janela de 24h fechada'}
                  />
                </button>
              )
            })}
          </div>
        </div>

        {/* Thread */}
        <div className={`min-h-0 min-w-0 flex-1 flex-col lg:flex ${selected ? 'flex' : 'hidden'}`}>
          {selected ? (
            <Thread conversation={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="hidden h-full items-center justify-center lg:flex">
              <EmptyState title="Escolha uma conversa" hint="Selecione uma conversa na lista ao lado." />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
