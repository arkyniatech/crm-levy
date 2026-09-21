import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCompany } from '../context/CompanyContext'

export interface NfeImport {
  id: string
  status: 'processando' | 'concluido' | 'erro' | string
  erro: string | null
  file_name: string | null
  total_nfes: number
  novos_pedidos: number
  pedidos_atualizados: number
  novos_clientes: number
  sem_cpf: number
  nota_de: string | null
  nota_ate: string | null
  created_at: string
  finished_at: string | null
}

/** Quanto tempo esperar pelo resumo antes de desistir (o fluxo roda em segundo plano). */
export const RESUMO_TIMEOUT_MS = 3 * 60 * 1000

/**
 * Acompanha o resumo da importação que acabou de ser enviada.
 *
 * `desde` é o instante do upload: só interessa linha criada a partir dali.
 * A margem de 2 min para trás cobre diferença de relógio entre o n8n e o banco
 * — sem ela, um resumo legítimo pode ser descartado por chegar "no passado".
 *
 * Passe `desde = null` para desligar (nenhum upload em andamento).
 */
export function useNfeImport(desde: number | null) {
  const { activeClient } = useCompany()

  return useQuery({
    queryKey: ['nfe-import', activeClient?.id, desde],
    // Fica habilitada mesmo depois da janela de espera: ao voltar de outra aba
    // a tela precisa reencontrar o resumo que já foi gravado.
    enabled: Boolean(activeClient) && desde !== null,
    refetchInterval: (query) => {
      if (query.state.data?.status === 'concluido') return false
      if (desde === null || Date.now() - desde > RESUMO_TIMEOUT_MS) return false
      return 3_000
    },
    queryFn: async (): Promise<NfeImport | null> => {
      const corte = new Date(desde! - 2 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('nfe_imports')
        .select('*')
        .eq('client_id', activeClient!.id)
        .gte('created_at', corte)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as NfeImport) ?? null
    },
  })
}

export interface NfeImportLog extends NfeImport {
  email: string | null
}

/** Importações anteriores do cliente ativo, para a aba Histórico. */
export function useNfeImportLog(limit = 50) {
  const { activeClient } = useCompany()
  return useQuery({
    queryKey: ['nfe-import-log', activeClient?.id, limit],
    enabled: Boolean(activeClient),
    queryFn: async (): Promise<NfeImportLog[]> => {
      const { data, error } = await supabase.rpc('crm_nfe_imports', {
        p_client_id: activeClient!.id,
        p_limit: limit,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as NfeImportLog[]
    },
  })
}

const PROGRESSO_KEY = 'unificca.nfeImportEmCurso'
/** Quanto tempo o resumo continua sendo reexibido ao voltar para a tela. */
const PROGRESSO_TTL_MS = 60 * 60 * 1000

export interface ImportacaoEmCurso {
  clientId: string
  startedAt: number
  lidas: number
  fileName: string | null
}

/**
 * O upload roda em segundo plano e a tela pode ser trocada no meio. Guardar o
 * que está em curso faz o status sobreviver a essa troca — sem isso o estado
 * morre junto com o componente e parece que a importação sumiu.
 */
export function lerImportacaoEmCurso(clientId: string | undefined): ImportacaoEmCurso | null {
  if (!clientId) return null
  try {
    const raw = localStorage.getItem(PROGRESSO_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as ImportacaoEmCurso
    if (p.clientId !== clientId) return null
    if (Date.now() - p.startedAt > PROGRESSO_TTL_MS) return null
    return p
  } catch {
    return null
  }
}

export function salvarImportacaoEmCurso(p: ImportacaoEmCurso): void {
  try {
    localStorage.setItem(PROGRESSO_KEY, JSON.stringify(p))
  } catch {
    // navegador sem storage: perde só a persistência entre telas
  }
}

export function limparImportacaoEmCurso(): void {
  try {
    localStorage.removeItem(PROGRESSO_KEY)
  } catch {
    // nada a fazer
  }
}
