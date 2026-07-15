import { useEffect, useState } from 'react'
import { Clock, Plug, Save, ShieldCheck, Sparkles } from 'lucide-react'
import {
  useCampaignDelay,
  useSaveCampaignDelay,
  useIsAdmin,
  useEnrichmentCredits,
  useSaveCredits,
} from '../hooks/settings'
import StoresGrid from '../components/StoresGrid'
import { formatDate } from '../lib/format'
import { PageHeader } from '../components/ui'

function AdminCreditsSection() {
  const { data: credits } = useEnrichmentCredits()
  const save = useSaveCredits()
  const [balance, setBalance] = useState(0)
  const [validUntil, setValidUntil] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (credits) {
      setBalance(credits.balance)
      setValidUntil(credits.validUntil ?? '')
    }
  }, [credits])

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    const res = await save({ balance, validUntil: validUntil || null })
    setSaving(false)
    setMsg(res.ok ? { tone: 'ok', text: 'Saldo atualizado.' } : { tone: 'err', text: res.error ?? 'Falha ao salvar.' })
  }

  return (
    <section className="card border-brand-100 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />
        <h2 className="font-display text-sm font-semibold text-gray-900">Créditos de enriquecimento (admin)</h2>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Saldo de créditos NovaVida — 1 crédito = 1 enriquecimento. Cada enriquecimento desconta automaticamente.
        Recarregue aqui quando comprar mais.
      </p>

      <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm">
        <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
        <span className="text-gray-700">
          Saldo atual:{' '}
          <span className="font-semibold tabular-nums">{credits ? credits.balance : '…'}</span> créditos
          {credits?.validUntil && (
            <span className="text-gray-500"> · válido até {formatDate(credits.validUntil)}</span>
          )}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Novo saldo (créditos)</span>
          <input
            type="number"
            min={0}
            className="input mt-1 w-32"
            value={balance}
            onChange={(e) => setBalance(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Válido até</span>
          <input
            type="date"
            className="input mt-1"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </label>
        <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
          <Save className="h-4 w-4" aria-hidden />
          {saving ? 'Salvando…' : 'Salvar saldo'}
        </button>
        {msg && (
          <span className={`text-sm ${msg.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>
        )}
      </div>
    </section>
  )
}

function CampaignDelaySection() {
  const { data: delay, isLoading } = useCampaignDelay()
  const save = useSaveCampaignDelay()
  const [min, setMin] = useState(2)
  const [max, setMax] = useState(6)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (delay) {
      setMin(delay.min)
      setMax(delay.max)
    }
  }, [delay])

  const handleSave = async () => {
    if (min < 1 || max < min) {
      setMsg({ tone: 'err', text: 'O mínimo deve ser ≥ 1 e o máximo ≥ mínimo.' })
      return
    }
    setSaving(true)
    setMsg(null)
    const res = await save({ min, max })
    setSaving(false)
    setMsg(res.ok ? { tone: 'ok', text: 'Salvo.' } : { tone: 'err', text: res.error ?? 'Falha ao salvar.' })
  }

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-brand-600" aria-hidden />
        <h2 className="font-display text-sm font-semibold text-gray-900">Ritmo de disparo das campanhas</h2>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Intervalo aleatório entre cada mensagem, em segundos. Valores mais altos protegem melhor o número
        contra bloqueio; valores baixos disparam mais rápido.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Mínimo (s)</span>
          <input
            type="number"
            min={1}
            max={120}
            className="input mt-1 w-28"
            value={min}
            disabled={isLoading}
            onChange={(e) => setMin(Number(e.target.value) || 1)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Máximo (s)</span>
          <input
            type="number"
            min={1}
            max={300}
            className="input mt-1 w-28"
            value={max}
            disabled={isLoading}
            onChange={(e) => setMax(Number(e.target.value) || 1)}
          />
        </label>
        <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving || isLoading}>
          <Save className="h-4 w-4" aria-hidden />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {msg && (
          <span className={`text-sm ${msg.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>
        )}
      </div>
    </section>
  )
}

export default function Settings() {
  const { data: isAdmin } = useIsAdmin()
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Ajustes da operação e status das integrações" />

      <div className="space-y-6">
        {isAdmin && <AdminCreditsSection />}
        <CampaignDelaySection />

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Plug className="h-4 w-4 text-brand-600" aria-hidden />
            <h2 className="font-display text-sm font-semibold text-gray-900">Integrações</h2>
          </div>
          <StoresGrid />
        </section>
      </div>
    </div>
  )
}
