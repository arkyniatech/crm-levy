-- Instâncias de WhatsApp (uazapi) — CRM Unificca
-- Rodar DEPOIS de access-roles.sql e admin-clientes-lojas.sql. Idempotente.
--
-- O cliente conecta o próprio número lendo um QR Code. Quem fala com a uazapi
-- é o n8n, nunca o navegador: o admintoken controla a conta inteira e o token
-- de instância controla o WhatsApp daquele cliente — os dois estariam a um
-- DevTools de distância se fossem para o build, que é estático e público.
--
-- Por isso aqui não existe policy de escrita: o CRM só LÊ status. Criar,
-- conectar, desconectar e apagar passam pelo webhook do n8n, que valida o
-- papel de quem pediu com crm_role_of() antes de chamar a uazapi.

-- ---------------------------------------------------------------------------
-- 1) Quantas instâncias cada cliente pode ter (master define)
--    Coluna em clients de propósito: a policy de update de clients já é
--    master-only, então o limite fica protegido sem regra nova. Em
--    app_settings um admin conseguiria aumentar o próprio teto.
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists wa_instance_limit integer not null default 1;

alter table public.clients
  drop constraint if exists clients_wa_instance_limit_check;
alter table public.clients
  add constraint clients_wa_instance_limit_check check (wa_instance_limit between 0 and 20);

-- ---------------------------------------------------------------------------
-- 2) As instâncias
-- ---------------------------------------------------------------------------
create table if not exists public.wa_instances (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  -- nome na uazapi; lá é único em toda a conta, por isso unique aqui também
  instance_name text not null unique,
  -- apelido que o usuário dá ("Vendas", "Suporte")
  label text,
  -- estados da uazapi. 'creating' é nosso: instância pedida, ainda sem retorno.
  status text not null default 'creating',
  -- número conectado, E.164, preenchido quando conecta
  phone text,
  profile_name text,
  -- última vez que o n8n confirmou o estado junto à uazapi
  last_status_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wa_instances
  drop constraint if exists wa_instances_status_check;
alter table public.wa_instances
  add constraint wa_instances_status_check check (status in (
    'creating',
    'disconnected',
    'connecting',
    'connected',
    'hibernated',
    'registering',
    'registration_conflict'
  ));

create index if not exists idx_wa_instances_client on public.wa_instances (client_id, created_at);

alter table public.wa_instances enable row level security;

-- Leitura para qualquer papel do cliente: o colaborador dispara campanha e
-- precisa saber se o número está conectado. Não há token nesta tabela.
drop policy if exists "crm select wa_instances" on public.wa_instances;
create policy "crm select wa_instances"
  on public.wa_instances for select to authenticated
  using (client_id in (select public.crm_client_ids()));

-- Sem insert/update/delete: tudo passa pelo n8n com service_role.

-- ---------------------------------------------------------------------------
-- 3) Os tokens, numa tabela à parte e SEM POLICY NENHUMA
--    Mesmo desenho de store_tokens: existe para a service_role e é invisível
--    para anon e authenticated. Nunca consulte isto do frontend.
-- ---------------------------------------------------------------------------
create table if not exists public.wa_instance_tokens (
  instance_id uuid primary key references public.wa_instances (id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now()
);

alter table public.wa_instance_tokens enable row level security;
-- (nenhuma policy — proposital)

-- ---------------------------------------------------------------------------
-- 4) Apoio para o n8n: pode criar mais uma instância neste cliente?
--    Devolve o limite e quantas já existem, para o fluxo responder com uma
--    mensagem clara em vez de estourar no banco.
-- ---------------------------------------------------------------------------
create or replace function public.crm_wa_instance_quota(p_client_id uuid)
returns table (limite integer, usadas bigint, pode_criar boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.wa_instance_limit,
         (select count(*) from public.wa_instances w where w.client_id = c.id),
         (select count(*) from public.wa_instances w where w.client_id = c.id) < c.wa_instance_limit
  from public.clients c
  where c.id = p_client_id;
$$;

grant execute on function public.crm_wa_instance_quota(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) A visão de clientes passa a trazer o limite, para o master editar na tela
--    "Clientes e lojas". Substitui a versão de admin-clientes-lojas.sql.
--
--    DROP antes do CREATE de propósito: a função ganhou duas colunas, e
--    "create or replace" não muda o tipo de retorno de uma função existente
--    ("cannot change return type of existing function"). Nenhuma policy
--    depende dela, então derrubar é seguro.
-- ---------------------------------------------------------------------------
drop function if exists public.crm_clients_overview();

create or replace function public.crm_clients_overview()
returns table (
  id uuid,
  name text,
  document text,
  created_at timestamptz,
  lojas bigint,
  acessos bigint,
  clientes_base bigint,
  wa_instance_limit integer,
  wa_instances bigint
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id, c.name, c.document, c.created_at,
         (select count(*) from public.stores s where s.client_id = c.id),
         (select count(*) from public.user_clients uc where uc.client_id = c.id),
         (select count(*) from public.customers cu where cu.client_id = c.id),
         c.wa_instance_limit,
         (select count(*) from public.wa_instances w where w.client_id = c.id)
  from public.clients c
  where c.id in (select public.crm_client_ids())
  order by c.created_at;
$$;

grant execute on function public.crm_clients_overview() to authenticated;
