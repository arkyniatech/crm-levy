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
  const expirou = desde !== null && Date.now() - desde > RESUMO_TIMEOUT_MS

  return useQuery({
    queryKey: ['nfe-import', activeClient?.id, desde],
    enabled: Boolean(activeClient) && desde !== null && !expirou,
    // Enquanto não chegar resumo concluído, pergunta de novo
    refetchInterval: (query) => (query.state.data?.status === 'concluido' ? false : 3_000),
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
