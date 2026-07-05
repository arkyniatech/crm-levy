export type Marketplace = 'shopee' | 'mercado_livre' | 'tiktok_shop' | string

export interface Client {
  id: string
  name: string | null
  document: string | null
  created_at: string | null
}

export interface Store {
  id: string
  client_id: string
  marketplace: Marketplace
  name: string | null
  external_shop_id: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

export interface Customer {
  id: string
  client_id: string
  cpf: string | null
  marketplace_buyer_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  birth_date: string | null
  city: string | null
  state: string | null
  first_seen_at: string | null
  created_at: string | null
}

export interface Order {
  id: string
  store_id: string
  customer_id: string | null
  marketplace: Marketplace
  external_order_id: string | null
  status: string | null
  total_amount: number | null
  currency: string | null
  buyer_cpf: string | null
  buyer_name: string | null
  buyer_email: string | null
  buyer_phone: string | null
  ship_address: Record<string, unknown> | null
  ordered_at: string | null
  created_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  external_item_id: string | null
  sku: string | null
  product_name: string | null
  quantity: number
  unit_price: number | null
  total_price: number | null
}

export interface WaConversation {
  id: string
  client_id: string
  customer_id: string | null
  wa_number: string
  profile_name: string | null
  status: string
  last_message_at: string | null
  last_inbound_at: string | null
  created_at: string
  customers?: { id: string; name: string | null } | null
  wa_messages?: { body: string | null; created_at: string; direction: string }[]
}

export interface WaMessage {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  body: string | null
  media_url: string | null
  media_content_type: string | null
  twilio_sid: string | null
  status: string | null
  error_code: string | null
  created_at: string
}

/** Linha da tabela de clientes com agregados calculados a partir de orders */
export interface CustomerWithStats extends Customer {
  orderCount: number
  totalSpent: number
  lastOrderAt: string | null
}
