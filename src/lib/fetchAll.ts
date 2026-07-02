import { supabase } from './supabase'

const PAGE_SIZE = 1000
const MAX_ROWS = 50_000

/**
 * Pagina por todas as linhas de uma query (o PostgREST limita cada resposta
 * a 1000 linhas). `build` recebe o intervalo e devolve a query já filtrada.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

export { supabase }
