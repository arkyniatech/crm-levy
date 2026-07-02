/** Dígitos de um CPF possivelmente formatado; null se ausente ou mascarado (ex.: "******"). */
export function cpfDigits(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const digits = cpf.replace(/\D/g, '')
  return digits.length === 11 ? digits : null
}

/**
 * Máscara de exibição: mostra só os 3 primeiros e os 2 últimos dígitos
 * (123.***.***-00). CPF ausente ou mascarado pelo marketplace vira "—".
 */
export function maskCpf(cpf: string | null | undefined): string {
  const digits = cpfDigits(cpf)
  if (!digits) return '—'
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`
}

export function formatCurrency(value: number | null | undefined, currency = 'BRL'): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatCnpj(doc: string | null | undefined): string {
  if (!doc) return '—'
  const d = doc.replace(/\D/g, '')
  if (d.length !== 14) return doc
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export const MARKETPLACE_LABEL: Record<string, string> = {
  shopee: 'Shopee',
  mercado_livre: 'Mercado Livre',
  tiktok_shop: 'TikTok Shop',
}

export function marketplaceLabel(mp: string | null | undefined): string {
  if (!mp) return '—'
  return MARKETPLACE_LABEL[mp] ?? mp
}

const STATUS_LABEL: Record<string, string> = {
  connected: 'Conectada',
  disconnected: 'Desconectada',
  expired: 'Expirada',
}

export function storeStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Desconhecido'
  return STATUS_LABEL[status.toLowerCase()] ?? status
}

/** Um pedido cancelado não deve contar como receita. */
export function isCancelledStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return status.toLowerCase().includes('cancel')
}
