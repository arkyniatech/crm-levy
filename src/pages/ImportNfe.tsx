import { useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileArchive, FileCode2, Loader2, UploadCloud, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDateTime, maskCpf } from '../lib/format'
import { ErrorState, PageHeader } from '../components/ui'

const WEBHOOK_URL = import.meta.env.VITE_N8N_NFE_WEBHOOK_URL as string | undefined

interface NotaResumo {
  chave_acesso: string
  numero_nf: string
  data_emissao: string
  buyer_name: string
  buyer_cpf: string
  valor_total_nf: number
  order_ref: string
  itens: number
}

interface UploadResult {
  ok: boolean
  error?: string
  total_nfes?: number
  com_cpf?: number
  sem_cpf?: number
  valor_total?: number
  notas?: NotaResumo[]
}

export default function ImportNfe() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const handleFile = async (file: File) => {
    setError(null)
    setResult(null)
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.zip') && !lower.endsWith('.xml')) {
      setError(`"${file.name}" não é um .zip nem um .xml.`)
      return
    }
    if (!WEBHOOK_URL) {
      setError('VITE_N8N_NFE_WEBHOOK_URL não está configurada no .env — configure e reinicie o servidor.')
      return
    }

    setFileName(file.name)
    setUploading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setError('Sessão expirada. Saia e entre de novo.')
        return
      }
      const form = new FormData()
      form.append('data', file)
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const body = (await res.json().catch(() => null)) as UploadResult | null
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? `O processamento falhou (HTTP ${res.status}). Tente de novo.`)
        return
      }
      setResult(body)
      // Se o fluxo passar a gravar no banco, os dados novos aparecem sem F5
      void queryClient.invalidateQueries()
    } catch {
      setError('Não foi possível falar com o serviço de importação. Confira sua conexão e tente de novo.')
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  return (
    <div>
      <PageHeader
        title="Importar NF-e"
        subtitle="Envie um ZIP de notas (pode ter pastas e ZIPs internos) ou um XML avulso"
      />

      <div
        role="button"
        tabIndex={0}
        aria-label="Enviar arquivo ZIP ou XML de NF-e"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? 'border-brand-600 bg-brand-50' : 'border-gray-300 hover:border-brand-600'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden />
            <p className="text-sm font-medium text-gray-700">Processando {fileName}…</p>
            <p className="text-xs text-gray-500">ZIPs grandes podem levar alguns segundos.</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-gray-400" aria-hidden />
            <p className="text-sm font-medium text-gray-700">
              Arraste o arquivo aqui ou <span className="text-brand-700 underline">clique para escolher</span>
            </p>
            <p className="flex items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <FileArchive className="h-3.5 w-3.5" aria-hidden /> .zip em lote
              </span>
              <span className="inline-flex items-center gap-1">
                <FileCode2 className="h-3.5 w-3.5" aria-hidden /> .xml avulso
              </span>
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.xml"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <div className="mt-4">
          <ErrorState message={error} />
        </div>
      )}

      {result && (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
            <h2 className="font-display text-base font-semibold text-gray-900">
              {fileName} processado
            </h2>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Notas lidas</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{result.total_nfes}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Com CPF</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-emerald-700">
                {result.com_cpf}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Sem CPF</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-amber-700">
                {result.sem_cpf}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Valor total</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                {formatCurrency(result.valor_total ?? 0)}
              </p>
            </div>
          </div>

          <div className="card mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="th">NF</th>
                    <th className="th">Emissão</th>
                    <th className="th">Comprador</th>
                    <th className="th">CPF</th>
                    <th className="th">Pedido (ref.)</th>
                    <th className="th text-right">Itens</th>
                    <th className="th text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(result.notas ?? []).map((n) => (
                    <tr key={n.chave_acesso || n.numero_nf} className="hover:bg-gray-50">
                      <td className="td tabular-nums">{n.numero_nf || '—'}</td>
                      <td className="td tabular-nums">{formatDateTime(n.data_emissao)}</td>
                      <td className="td">{n.buyer_name || '—'}</td>
                      <td className="td tabular-nums">
                        {n.buyer_cpf ? (
                          maskCpf(n.buyer_cpf)
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <XCircle className="h-3.5 w-3.5" aria-hidden /> sem CPF
                          </span>
                        )}
                      </td>
                      <td className="td tabular-nums">{n.order_ref || '—'}</td>
                      <td className="td text-right tabular-nums">{n.itens}</td>
                      <td className="td text-right font-medium tabular-nums">
                        {formatCurrency(n.valor_total_nf)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
