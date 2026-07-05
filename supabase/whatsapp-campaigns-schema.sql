-- Campanhas de WhatsApp — CRM Unificca
-- Rodar no Supabase DEPOIS do whatsapp-schema.sql.
-- Mesmo padrão: n8n (service_role) escreve, frontend só lê via user_clients.

-- 1) Campanhas
create table if not exists public.wa_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  name text not null,
  message_body text not null,
  template_sid text,                    -- para quando o número definitivo tiver templates aprovados
  audience jsonb not null default '{}'::jsonb,  -- ex: {"type":"all"} | {"type":"recent","days":90} | {"type":"test","numbers":[...]}
  status text not null default 'draft', -- draft | sending | done | failed | canceled
  scheduled_at timestamptz,             -- reservado para agendamento (fase 2)
  created_by uuid,                      -- auth.users.id de quem criou
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- 2) Destinatários de cada campanha (um por número, com status individual)
create table if not exists public.wa_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.wa_campaigns (id) on delete cascade,
  customer_id uuid references public.customers (id),
  wa_number text not null,
  display_name text,
  status text not null default 'pending', -- pending | sent | delivered | read | failed | skipped
  twilio_sid text,
  error_code text,
  sent_at timestamptz,
  unique (campaign_id, wa_number)
);

create index if not exists idx_wa_camp_recipients_campaign on public.wa_campaign_recipients (campaign_id, status);
create index if not exists idx_wa_camp_recipients_sid on public.wa_campaign_recipients (twilio_sid);

-- 3) Opt-outs: quem respondeu SAIR/PARAR nunca mais entra em campanha
create table if not exists public.wa_optouts (
  wa_number text primary key,
  source text,
  created_at timestamptz not null default now()
);

-- 4) RLS: leitura para usuários mapeados; escrita só service_role (n8n)
alter table public.wa_campaigns enable row level security;
alter table public.wa_campaign_recipients enable row level security;
alter table public.wa_optouts enable row level security;

drop policy if exists "crm select wa_campaigns" on public.wa_campaigns;
create policy "crm select wa_campaigns"
  on public.wa_campaigns for select to authenticated
  using (
    client_id in (select client_id from public.user_clients where user_id = (select auth.uid()))
  );

drop policy if exists "crm select wa_campaign_recipients" on public.wa_campaign_recipients;
create policy "crm select wa_campaign_recipients"
  on public.wa_campaign_recipients for select to authenticated
  using (
    campaign_id in (
      select c.id
      from public.wa_campaigns c
      join public.user_clients uc on uc.client_id = c.client_id
      where uc.user_id = (select auth.uid())
    )
  );

drop policy if exists "crm select wa_optouts" on public.wa_optouts;
create policy "crm select wa_optouts"
  on public.wa_optouts for select to authenticated
  using (
    exists (select 1 from public.user_clients where user_id = (select auth.uid()))
  );
