import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      setError(
        error.message.toLowerCase().includes('invalid')
          ? 'Email ou senha incorretos. Confira e tente de novo.'
          : `Não foi possível entrar: ${error.message}`,
      )
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 ring-1 ring-white/10">
          <span className="font-display text-lg font-bold text-brand-500">U</span>
        </div>
        <div>
          <p className="font-display text-lg font-semibold tracking-wide text-white">Unificca</p>
          <p className="text-xs text-slate-400">Seus marketplaces, uma visão só</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h1 className="font-display text-base font-semibold text-gray-900">Entrar</h1>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            className="input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="mt-3 block">
          <span className="text-sm font-medium text-gray-700">Senha</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            className="input mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary mt-4 w-full" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-6 text-xs text-slate-500">Acesso restrito. Usuários são criados pelo administrador.</p>
    </div>
  )
}
