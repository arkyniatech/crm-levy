import { useEffect, useState } from 'react'
import { Clock, Plug, Save, ShieldCheck, Sparkles, Trash2, UserPlus, Users } from 'lucide-react'
import {
  useCampaignDelay,
  useSaveCampaignDelay,
  useUserRole,
  useEnrichmentCredits,
  useSaveCredits,
} from '../hooks/settings'
import { listUsers, createUser, revokeUser, type AdminUser } from '../hooks/adminUsers'
import StoresGrid from '../components/StoresGrid'
import { formatDate } from '../lib/format'
import { PageHeader, StatusBadge } from '../components/ui'

function AdminUsersSection() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await listUsers()
    setLoading(false)
    if (res.ok) setUsers(res.users ?? [])
    else setMsg({ tone: 'err', text: res.error ?? 'Falha ao listar usuários.' })
  }
  useEffect(() => {
    void load()
  }, [])

  const add = async () => {
    if (!email.trim() || password.length < 6) {
      setMsg({ tone: 'err', text: 'Informe e-mail e uma senha de pelo menos 6 caracteres.' })
      return
    }
    setBusy(true)
    setMsg(null)
    const res = await createUser(email.trim(), password, role)
    setBusy(false)
    if (!res.ok) {
      setMsg({ tone: 'err', text: res.error ?? 'Falha ao criar usuário.' })
      return
    }
    setMsg({ tone: 'ok', text: 'Usuário criado com acesso.' })
    setEmail('')
    setPassword('')
    setRole('member')
    void load()
  }

  const revoke = async (u: AdminUser) => {
    if (!window.confirm(`Remover o acesso de ${u.email}? (o login não é apagado, só perde acesso a esta empresa)`)) return
    setMsg(null)
    const res = await revokeUser(u.id)
    if (!res.ok) {
      setMsg({ tone: 'err', text: res.error ?? 'Falha ao remover acesso.' })
      return
    }
    void load()
  }

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-brand-600" aria-hidden />
        <h2 className="font-display text-sm font-semibold text-gray-900">Usuários &amp; permissões (admin)</h2>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Crie logins de acesso ao CRM e defina o papel. <b>Admin</b> gerencia créditos e usuários; <b>Membro</b> só opera.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">E-mail</span>
          <input type="email" className="input mt-1 w-56" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Senha</span>
          <input
            type="password"
            className="input mt-1 w-40"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="mín. 6 caracteres"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Papel</span>
          <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}>
            <option value="member">Membro</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={() => void add()} disabled={busy}>
          <UserPlus className="h-4 w-4" aria-hidden />
          {busy ? 'Criando…' : 'Criar usuário'}
        </button>
        {msg && (
          <span className={`text-sm ${msg.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>
        )}
      </div>

      <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
        {loading ? (
          <p className="py-3 text-sm text-gray-400">Carregando usuários…</p>
        ) : users.length === 0 ? (
          <p className="py-3 text-sm text-gray-400">Nenhum usuário com acesso ainda.</p>
        ) : (
          users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{u.email}</p>
                {u.created_at && (
                  <p className="text-xs text-gray-400">desde {formatDate(u.created_at)}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={u.role === 'admin' ? 'Admin' : 'Membro'} tone={u.role === 'admin' ? 'ok' : 'neutral'} />
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => void revoke(u)}
                  title="Remover acesso"
                  aria-label={`Remover acesso de ${u.email}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

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
  const { data: role } = useUserRole()
  const isMaster = role === 'master'
  const canManageUsers = role === 'master' || role === 'admin'
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Ajustes da operação e status das integrações" />

      <div className="space-y-6">
        {isMaster && <AdminCreditsSection />}
        {canManageUsers && <AdminUsersSection />}
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
