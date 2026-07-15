import { useEffect, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Copy, Eye, Megaphone, Plus, Rocket, Users } from 'lucide-react'
import {
  campaignAction,
  campaignCounts,
  useWaCampaigns,
  type AudienceInput,
  type WaCampaign,
} from '../hooks/campaigns'
import { SEGMENTS, segmentLabel } from '../lib/segments'
import { formatDateTime } from '../lib/format'
import { EmptyState, ErrorState, PageHeader, StatusBadge } from '../components/ui'

const STATUS_LABEL: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  sending: { label: 'Enviando…', tone: 'warn' },
  done: { label: 'Concluída', tone: 'ok' },
  failed: { label: 'Falhou', tone: 'bad' },
  canceled: { label: 'Cancelada', tone: 'neutral' },
}

const AUDIENCE_LABEL: Record<string, string> = {
  test: 'Números de teste',
  all: 'Todos os clientes com telefone',
  recent: 'Compradores recentes',
}

function audienceDescription(a: WaCampaign['audience']): string {
  if (a?.type === 'segment') return `Segmento: ${segmentLabel(a.segment ?? '')}`
  return AUDIENCE_LABEL[a?.type ?? ''] ?? 'Público personalizado'
}

interface CampaignPreset {
  presetName?: string
  presetMessage?: string
  presetAudience?: AudienceInput
}

/** valores possíveis do seletor de público (inclui os segmentos) */
type AudienceChoice = 'test' | 'all' | 'recent' | AudienceInput['segment']

function parseTestNumbers(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const SEGMENT_KEYS = SEGMENTS.map((s) => s.key)

function NewCampaignForm({ onCreated, preset }: { onCreated: () => void; preset?: CampaignPreset }) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [choice, setChoice] = useState<AudienceChoice>('test')
  const [days, setDays] = useState(90)
  const [minSpent, setMinSpent] = useState(300)
  const [testNumbers, setTestNumbers] = useState('')
  const [preview, setPreview] = useState<{ total: number; skipped: number; sample: string[] } | null>(null)
  const [busy, setBusy] = useState<'preview' | 'create' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Preenche o formulário quando vem um preset (ex.: da tela de Segmentos)
  useEffect(() => {
    if (!preset) return
    if (preset.presetName) setName(preset.presetName)
    if (preset.presetMessage) setMessage(preset.presetMessage)
    const a = preset.presetAudience
    if (a?.type === 'segment' && a.segment) setChoice(a.segment)
    else if (a?.type) setChoice(a.type as AudienceChoice)
    if (a?.days) setDays(a.days)
    if (a?.min_spent) setMinSpent(a.min_spent)
  }, [preset])

  const isSegment = (SEGMENT_KEYS as string[]).includes(choice as string)

  const buildAudience = (): AudienceInput => {
    if (choice === 'test') return { type: 'test', numbers: parseTestNumbers(testNumbers) }
    if (choice === 'recent') return { type: 'recent', days }
    if (choice === 'all') return { type: 'all' }
    // segmentos
    return { type: 'segment', segment: choice, days, min_spent: minSpent }
  }

  const handlePreview = async () => {
    setBusy('preview')
    setError(null)
    const res = await campaignAction({ action: 'preview', audience: buildAudience() })
    setBusy(null)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao calcular o alcance.')
      return
    }
    setPreview({
      total: res.total ?? 0,
      skipped: res.skipped_optout ?? 0,
      sample: (res.sample ?? []).map((s) => (s.name ? `${s.name} (${s.wa_number})` : s.wa_number)),
    })
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !message.trim()) {
      setError('Dê um nome e escreva a mensagem da campanha.')
      return
    }
    setBusy('create')
    setError(null)
    const res = await campaignAction({
      action: 'create',
      name: name.trim(),
      message_body: message.trim(),
      audience: buildAudience(),
    })
    setBusy(null)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao criar a campanha.')
      return
    }
    setName('')
    setMessage('')
    setTestNumbers('')
    setChoice('test')
    setPreview(null)
    onCreated()
  }

  return (
    <form onSubmit={handleCreate} className="card p-4">
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-gray-900">
        <Plus className="h-4 w-4 text-brand-600" aria-hidden /> Nova campanha
      </h2>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Nome (interno)</span>
          <input
            type="text"
            className="input mt-1"
            placeholder="Ex.: Oferta de julho — clientes recentes"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Público</span>
          <select
            className="input mt-1"
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value as AudienceChoice)
              setPreview(null)
            }}
          >
            <optgroup label="Básico">
              <option value="test">Números de teste (recomendado antes de disparar de verdade)</option>
              <option value="all">Todos os clientes com telefone</option>
              <option value="recent">Compradores dos últimos X dias</option>
            </optgroup>
            <optgroup label="Segmentos">
              {SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      {choice === 'test' && (
        <label className="mt-3 block">
          <span className="text-sm font-medium text-gray-700">Números de teste (um por linha)</span>
          <textarea
            className="input mt-1"
            rows={2}
            placeholder={'+55 11 99999-8888\n+55 21 98888-7777'}
            value={testNumbers}
            onChange={(e) => setTestNumbers(e.target.value)}
          />
        </label>
      )}
      {(choice === 'recent' || choice === 'inactive') && (
        <label className="mt-3 block w-56">
          <span className="text-sm font-medium text-gray-700">
            {choice === 'recent' ? 'Compraram nos últimos X dias' : 'Sem comprar há mais de X dias'}
          </span>
          <input
            type="number"
            min={1}
            max={730}
            className="input mt-1"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 90)}
          />
        </label>
      )}
      {choice === 'vip' && (
        <label className="mt-3 block w-56">
          <span className="text-sm font-medium text-gray-700">Gasto total mínimo (R$)</span>
          <input
            type="number"
            min={1}
            className="input mt-1"
            value={minSpent}
            onChange={(e) => setMinSpent(Number(e.target.value) || 300)}
          />
        </label>
      )}
      {isSegment && (
        <p className="mt-2 text-xs text-gray-500">
          O público é recalculado no momento do disparo, a partir dos pedidos e dados dos clientes.
        </p>
      )}

      <label className="mt-3 block">
        <span className="text-sm font-medium text-gray-700">Mensagem</span>
        <textarea
          className="input mt-1"
          rows={4}
          placeholder="Escreva a mensagem que os clientes vão receber no WhatsApp…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <span className="mt-1 block text-xs text-gray-500">
          A mensagem sai pelo número de WhatsApp conectado no uazapi, como texto normal.
        </span>
      </label>

      {preview && (
        <div className="mt-3 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-gray-800">
          <p className="font-medium">
            Alcance: {preview.total} contato{preview.total === 1 ? '' : 's'}
            {preview.skipped > 0 && (
              <span className="font-normal text-gray-600"> · {preview.skipped} fora por pedido de saída (opt-out)</span>
            )}
          </p>
          {preview.sample.length > 0 && (
            <p className="mt-0.5 text-xs text-gray-600">Ex.: {preview.sample.slice(0, 5).join(' · ')}</p>
          )}
          {preview.total === 0 && (
            <p className="mt-0.5 text-xs text-amber-700">
              Nenhum contato com telefone nesse público — confira se os clientes têm telefone cadastrado.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          onClick={() => void handlePreview()}
          disabled={busy !== null}
        >
          <Eye className="h-4 w-4" aria-hidden />
          {busy === 'preview' ? 'Calculando…' : 'Ver alcance'}
        </button>
        <button type="submit" className="btn-primary" disabled={busy !== null}>
          {busy === 'create' ? 'Criando…' : 'Criar campanha'}
        </button>
      </div>
    </form>
  )
}

function CampaignCard({ campaign, onChanged }: { campaign: WaCampaign; onChanged: () => void }) {
  const [starting, setStarting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const counts = campaignCounts(campaign)
  const statusInfo = STATUS_LABEL[campaign.status] ?? { label: campaign.status, tone: 'neutral' as const }
  const progress = counts.total > 0 ? Math.round(((counts.total - counts.pending) / counts.total) * 100) : 0

  const handleStart = async () => {
    if (
      !window.confirm(
        `Disparar "${campaign.name}" agora para ${counts.total} contato${counts.total === 1 ? '' : 's'}?`,
      )
    )
      return
    setStarting(true)
    setError(null)
    const res = await campaignAction({ action: 'start', campaign_id: campaign.id })
    setStarting(false)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao iniciar o disparo.')
      return
    }
    onChanged()
  }

  // Reusar uma campanha: recria como novo rascunho com o mesmo texto/público,
  // recalculando a lista de destinatários na hora (ex.: repetir a "Natal").
  const handleDuplicate = async () => {
    setDuplicating(true)
    setError(null)
    const res = await campaignAction({
      action: 'create',
      name: `${campaign.name} (cópia)`,
      message_body: campaign.message_body,
      audience: campaign.audience as AudienceInput,
    })
    setDuplicating(false)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao duplicar.')
      return
    }
    onChanged()
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-gray-900">{campaign.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {audienceDescription(campaign.audience)}
            {campaign.audience?.type === 'recent' && ` (${campaign.audience.days ?? 90} dias)`}
            {' · criada em '}
            <span className="tabular-nums">{formatDateTime(campaign.created_at)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={statusInfo.label} tone={statusInfo.tone} />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            onClick={() => void handleDuplicate()}
            disabled={duplicating}
            title="Recriar como novo rascunho para disparar de novo"
          >
            <Copy className="h-4 w-4" aria-hidden />
            {duplicating ? 'Duplicando…' : 'Duplicar'}
          </button>
          {campaign.status === 'draft' && (
            <button type="button" className="btn-primary !py-1.5" onClick={() => void handleStart()} disabled={starting}>
              <Rocket className="h-4 w-4" aria-hidden />
              {starting ? 'Iniciando…' : 'Disparar'}
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 line-clamp-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
        {campaign.message_body}
      </p>

      {counts.total > 0 && (
        <div className="mt-3">
          {(campaign.status === 'sending' || campaign.status === 'done') && (
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-gray-600">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden /> {counts.total} contatos
            </span>
            <span>{counts.pending} pendentes</span>
            <span>{counts.sent} enviadas</span>
            <span className="inline-flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              {counts.delivered + counts.read} entregues
            </span>
            <span>{counts.read} lidas</span>
            {counts.failed > 0 && <span className="text-red-600">{counts.failed} falhas</span>}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export default function Campaigns() {
  const { data: campaigns, isLoading, error } = useWaCampaigns()
  const queryClient = useQueryClient()
  const location = useLocation()
  const preset = (location.state ?? undefined) as CampaignPreset | undefined
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['wa-campaigns'] })

  return (
    <div>
      <PageHeader
        title="Campanhas"
        subtitle="Disparos de WhatsApp para grupos de clientes — com ritmo controlado e opt-out automático"
      />

      <NewCampaignForm onCreated={refresh} preset={preset} />

      {error && (
        <div className="mt-4">
          <ErrorState message={(error as Error).message} />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="card h-28 animate-pulse" />
            ))}
          </div>
        )}
        {!isLoading && campaigns?.length === 0 && (
          <div className="card">
            <EmptyState
              title="Nenhuma campanha ainda"
              hint="Crie a primeira acima — comece com um número de teste antes do disparo de verdade."
            />
          </div>
        )}
        {campaigns?.map((c) => <CampaignCard key={c.id} campaign={c} onChanged={refresh} />)}
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-gray-500">
        <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Quem responde SAIR, PARAR ou CANCELAR é excluído automaticamente das próximas campanhas. O envio
        usa ritmo espaçado e aleatório entre mensagens para proteger o número — em bases grandes, prefira
        disparar em lotes ao longo do dia.
      </p>
    </div>
  )
}
