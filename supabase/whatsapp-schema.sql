-- Tabelas de conversas do WhatsApp (Twilio) — CRM Unificca
-- Rodar no Supabase: SQL Editor → New query → colar tudo → Run.
--
-- ATENÇÃO: os nomes têm prefixo wa_ de propósito — este projeto Supabase é
-- compartilhado e já existem tabelas "messages" e "crm_conversations" de
-- outro sistema. NÃO usar nomes genéricos aqui.
--
-- Modelo: o n8n (service_role) grava tudo; o frontend só LÊ, escopado por
-- user_clients — mesmo padrão do rls-policies.sql. O envio de mensagens sai
-- do CRM via webhook n8n (o token da Twilio nunca toca o frontend).

-- 1) Conversas: uma por número de WhatsApp do cliente final, por empresa
create table if not exists public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  customer_id uuid references public.customers (id),  -- vinculado quando o telefone casar
  wa_number text not null,                             -- E.164, ex: +5511999998888
  profile_name text,                                   -- nome do perfil no WhatsApp
  status text not null default 'open',                 -- open | closed
  last_message_at timestamptz,
  last_inbound_at timestamptz,                         -- base da janela de 24h da Meta
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, wa_number)
);

-- 2) Mensagens
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text,
  media_url text,
  media_content_type text,
  template_sid text,           -- preenchido quando enviada via template aprovado
  twilio_sid text unique,      -- MessageSid da Twilio (chave dos status callbacks)
  status text,                 -- received | queued | sent | delivered | read | failed | undelivered
  error_code text,
  sent_by uuid,                -- auth.users.id de quem enviou pelo CRM (outbound)
  created_at timestamptz not null default now()
);

create index if not exists idx_wa_messages_conversation on public.wa_messages (conversation_id, created_at);
create index if not exists idx_wa_conversations_client on public.wa_conversations (client_id, last_message_at desc);

-- 3) RLS: leitura para usuários mapeados em user_clients; escrita só service_role
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;

drop policy if exists "crm select wa_conversations" on public.wa_conversations;
create policy "crm select wa_conversations"
  on public.wa_conversations for select to authenticated
  using (
    client_id in (select client_id from public.user_clients where user_id = (select auth.uid()))
  );

drop policy if exists "crm select wa_messages" on public.wa_messages;
create policy "crm select wa_messages"
  on public.wa_messages for select to authenticated
  using (
    conversation_id in (
      select c.id
      from public.wa_conversations c
      join public.user_clients uc on uc.client_id = c.client_id
      where uc.user_id = (select auth.uid())
    )
  );

-- 4) Realtime: mensagens novas aparecem no CRM sem F5
alter publication supabase_realtime add table public.wa_conversations;
alter publication supabase_realtime add table public.wa_messages;
