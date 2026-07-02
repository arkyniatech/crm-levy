-- Políticas de RLS para o CRM Unificca
-- Rodar no Supabase: SQL Editor → New query → colar tudo → Run.
--
-- Modelo: uma tabela de mapeamento user_clients diz quais usuários do Auth
-- podem ler quais empresas (clients). As políticas dão SELECT (só leitura)
-- escopado por esse mapeamento. Quem não estiver mapeado — incluindo os ~88
-- usuários antigos que existem neste projeto Supabase — não lê NADA.
--
-- store_tokens fica sem nenhuma política de propósito: segue inacessível
-- para anon e authenticated (só a service_role dos fluxos n8n usa).

-- 1) Mapeamento usuário → empresa
create table if not exists public.user_clients (
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

alter table public.user_clients enable row level security;

drop policy if exists "user reads own mappings" on public.user_clients;
create policy "user reads own mappings"
  on public.user_clients for select to authenticated
  using (user_id = (select auth.uid()));

-- 2) Garante RLS ligado nas tabelas lidas pelo CRM (no-op se já estiver)
alter table public.clients            enable row level security;
alter table public.stores             enable row level security;
alter table public.customers          enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.customer_consents  enable row level security;
alter table public.store_tokens       enable row level security;

-- 3) Políticas de leitura escopadas pelo mapeamento
drop policy if exists "crm select clients" on public.clients;
create policy "crm select clients"
  on public.clients for select to authenticated
  using (
    id in (select client_id from public.user_clients where user_id = (select auth.uid()))
  );

drop policy if exists "crm select stores" on public.stores;
create policy "crm select stores"
  on public.stores for select to authenticated
  using (
    client_id in (select client_id from public.user_clients where user_id = (select auth.uid()))
  );

drop policy if exists "crm select customers" on public.customers;
create policy "crm select customers"
  on public.customers for select to authenticated
  using (
    client_id in (select client_id from public.user_clients where user_id = (select auth.uid()))
  );

drop policy if exists "crm select orders" on public.orders;
create policy "crm select orders"
  on public.orders for select to authenticated
  using (
    store_id in (
      select s.id
      from public.stores s
      join public.user_clients uc on uc.client_id = s.client_id
      where uc.user_id = (select auth.uid())
    )
  );

drop policy if exists "crm select order_items" on public.order_items;
create policy "crm select order_items"
  on public.order_items for select to authenticated
  using (
    order_id in (
      select o.id
      from public.orders o
      join public.stores s on s.id = o.store_id
      join public.user_clients uc on uc.client_id = s.client_id
      where uc.user_id = (select auth.uid())
    )
  );

drop policy if exists "crm select customer_consents" on public.customer_consents;
create policy "crm select customer_consents"
  on public.customer_consents for select to authenticated
  using (
    customer_id in (
      select c.id
      from public.customers c
      join public.user_clients uc on uc.client_id = c.client_id
      where uc.user_id = (select auth.uid())
    )
  );

-- 4) Dá acesso ao usuário do CRM (contato@arkynia.com) a todas as empresas atuais
insert into public.user_clients (user_id, client_id)
select '45977b7d-1295-42c9-933f-5291ef0abc12', id
from public.clients
on conflict do nothing;
