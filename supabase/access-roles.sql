-- Perfis de acesso do CRM Unificca
-- Rodar no Supabase: SQL Editor → New query → colar tudo → Run.
-- Roda DEPOIS de rls-policies.sql, whatsapp-schema.sql, whatsapp-campaigns-schema.sql
-- e app-settings-schema.sql. É idempotente: pode rodar de novo sem estragar nada.
--
-- MODELO
--   master      → global, fora de user_clients. Vê e faz tudo em TODAS as lojas.
--   admin       → por loja. Vê e faz tudo dentro da própria loja.
--   collaborator→ por loja. Só importa NF-e e opera campanhas. NÃO lê customers,
--                 orders, order_items, consents, conversas nem os destinatários
--                 (que carregam telefone) — só a contagem por status.
--
-- "Loja" aqui é uma linha de public.clients (empresa/CNPJ). As contas de
-- marketplace (public.stores) continuam penduradas na loja.
--
-- Substitui crm_user_roles, que era um papel GLOBAL por usuário e não dava
-- conta de "admin da loja A, colaborador da loja B". A tabela antiga não é
-- apagada aqui — ver o bloco 7 no fim.

-- ---------------------------------------------------------------------------
-- 1) Masters (globais)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_masters (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.crm_masters enable row level security;

-- Ninguém lê essa tabela pelo PostgREST: quem precisa saber se é master usa a
-- função crm_is_master(). Sem policy = sem acesso para anon/authenticated.

-- ---------------------------------------------------------------------------
-- 2) Papel por loja
-- ---------------------------------------------------------------------------
alter table public.user_clients
  add column if not exists role text not null default 'admin';

alter table public.user_clients
  drop constraint if exists user_clients_role_check;
alter table public.user_clients
  add constraint user_clients_role_check check (role in ('admin', 'collaborator'));

-- ---------------------------------------------------------------------------
-- 3) Funções de apoio
--    SECURITY DEFINER para não recair nas próprias policies (evita recursão)
--    e para poder ser usada dentro de USING/WITH CHECK sem abrir as tabelas.
-- ---------------------------------------------------------------------------
create or replace function public.crm_is_master()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.crm_masters where user_id = auth.uid());
$$;

-- Papel do usuário logado na loja informada: 'master' | 'admin' | 'collaborator' | null
create or replace function public.crm_role_in(p_client_id uuid)
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when public.crm_is_master() then 'master'
    else (
      select uc.role from public.user_clients uc
      where uc.user_id = auth.uid() and uc.client_id = p_client_id
    )
  end;
$$;

-- Enxerga dados de cliente (customers/orders/conversas) nessa loja?
create or replace function public.crm_sees_customer_data(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.crm_role_in(p_client_id) in ('master', 'admin');
$$;

-- Lojas em que o usuário enxerga dados de cliente (usado nas policies)
create or replace function public.crm_client_ids_with_customer_data()
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id from public.clients c where public.crm_is_master()
  union
  select uc.client_id from public.user_clients uc
  where uc.user_id = auth.uid() and uc.role = 'admin';
$$;

-- Lojas em que o usuário entra de algum jeito (qualquer papel)
create or replace function public.crm_client_ids()
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id from public.clients c where public.crm_is_master()
  union
  select uc.client_id from public.user_clients uc where uc.user_id = auth.uid();
$$;

grant execute on function public.crm_is_master() to authenticated;
grant execute on function public.crm_role_in(uuid) to authenticated;
grant execute on function public.crm_sees_customer_data(uuid) to authenticated;
grant execute on function public.crm_client_ids_with_customer_data() to authenticated;
grant execute on function public.crm_client_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Policies de leitura, agora cientes do papel
--    Todas substituem as versões antigas (que só olhavam user_clients).
-- ---------------------------------------------------------------------------

-- 4.1) A loja em si e as contas de marketplace
-- clients: todo mundo que entra na loja precisa dela (seletor de empresa).
drop policy if exists "crm select clients" on public.clients;
create policy "crm select clients"
  on public.clients for select to authenticated
  using (id in (select public.crm_client_ids()));

-- stores: só quem enxerga dados de cliente (o colaborador não abre nenhuma
-- tela que dependa de stores).
drop policy if exists "crm select stores" on public.stores;
create policy "crm select stores"
  on public.stores for select to authenticated
  using (client_id in (select public.crm_client_ids_with_customer_data()));

-- 4.2) Base de clientes e vendas — fechada para o colaborador
drop policy if exists "crm select customers" on public.customers;
create policy "crm select customers"
  on public.customers for select to authenticated
  using (client_id in (select public.crm_client_ids_with_customer_data()));

drop policy if exists "crm select orders" on public.orders;
create policy "crm select orders"
  on public.orders for select to authenticated
  using (
    store_id in (
      select s.id from public.stores s
      where s.client_id in (select public.crm_client_ids_with_customer_data())
    )
  );

drop policy if exists "crm select order_items" on public.order_items;
create policy "crm select order_items"
  on public.order_items for select to authenticated
  using (
    order_id in (
      select o.id from public.orders o
      join public.stores s on s.id = o.store_id
      where s.client_id in (select public.crm_client_ids_with_customer_data())
    )
  );

drop policy if exists "crm select customer_consents" on public.customer_consents;
create policy "crm select customer_consents"
  on public.customer_consents for select to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      where c.client_id in (select public.crm_client_ids_with_customer_data())
    )
  );

-- 4.3) WhatsApp
-- Campanhas: o colaborador PRECISA ver (é o trabalho dele).
drop policy if exists "crm select wa_campaigns" on public.wa_campaigns;
create policy "crm select wa_campaigns"
  on public.wa_campaigns for select to authenticated
  using (client_id in (select public.crm_client_ids()));

-- Destinatários: carregam wa_number e display_name → fechado para colaborador.
-- Ele enxerga a contagem por status pela função crm_campaign_counts() abaixo.
drop policy if exists "crm select wa_campaign_recipients" on public.wa_campaign_recipients;
create policy "crm select wa_campaign_recipients"
  on public.wa_campaign_recipients for select to authenticated
  using (
    campaign_id in (
      select c.id from public.wa_campaigns c
      where c.client_id in (select public.crm_client_ids_with_customer_data())
    )
  );

-- Conversas e mensagens: dado de cliente.
drop policy if exists "crm select wa_conversations" on public.wa_conversations;
create policy "crm select wa_conversations"
  on public.wa_conversations for select to authenticated
  using (client_id in (select public.crm_client_ids_with_customer_data()));

drop policy if exists "crm select wa_messages" on public.wa_messages;
create policy "crm select wa_messages"
  on public.wa_messages for select to authenticated
  using (
    conversation_id in (
      select c.id from public.wa_conversations c
      where c.client_id in (select public.crm_client_ids_with_customer_data())
    )
  );

-- Opt-outs: a tabela é global (chave é o número, sem client_id), então a
-- policy antiga deixava QUALQUER usuário mapeado ler os números de opt-out de
-- TODAS as lojas. Com mais de uma loja isso vaza telefone entre tenants.
-- O frontend nunca lê essa tabela — quem aplica o opt-out é o n8n com a
-- service_role. Fechando para todo mundo, menos master.
drop policy if exists "crm select wa_optouts" on public.wa_optouts;
create policy "crm select wa_optouts"
  on public.wa_optouts for select to authenticated
  using (public.crm_is_master());

-- 4.4) Configurações
-- Ler: qualquer papel (o colaborador precisa de campaign_delay no disparo).
drop policy if exists "crm select app_settings" on public.app_settings;
create policy "crm select app_settings"
  on public.app_settings for select to authenticated
  using (client_id in (select public.crm_client_ids()));

-- Escrever: só admin/master, e a chave de créditos só master.
-- Antes qualquer usuário mapeado podia gravar QUALQUER chave, inclusive
-- enrichment_credits — dava para se dar créditos por chamada direta à API.
drop policy if exists "crm insert app_settings" on public.app_settings;
create policy "crm insert app_settings"
  on public.app_settings for insert to authenticated
  with check (
    public.crm_sees_customer_data(client_id)
    and (key <> 'enrichment_credits' or public.crm_is_master())
  );

drop policy if exists "crm update app_settings" on public.app_settings;
create policy "crm update app_settings"
  on public.app_settings for update to authenticated
  using (
    public.crm_sees_customer_data(client_id)
    and (key <> 'enrichment_credits' or public.crm_is_master())
  )
  with check (
    public.crm_sees_customer_data(client_id)
    and (key <> 'enrichment_credits' or public.crm_is_master())
  );

-- ---------------------------------------------------------------------------
-- 5) Progresso da campanha sem expor telefone
--    O colaborador não lê wa_campaign_recipients, mas precisa ver
--    "120 enviadas, 3 falharam". Esta função devolve só a contagem.
-- ---------------------------------------------------------------------------
create or replace function public.crm_campaign_counts(p_client_id uuid)
returns table (campaign_id uuid, status text, total bigint)
language sql stable security definer set search_path = public, pg_temp
as $$
  select r.campaign_id, r.status, count(*)::bigint
  from public.wa_campaign_recipients r
  join public.wa_campaigns c on c.id = r.campaign_id
  where c.client_id = p_client_id
    and public.crm_role_in(p_client_id) is not null   -- barra quem não é da loja
  group by r.campaign_id, r.status;
$$;

grant execute on function public.crm_campaign_counts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Semente: Mohamad e Levy como master
--    Por e-mail, para não depender de colar uuid na mão.
--    >>> TROQUE o e-mail do Levy antes de rodar. <<<
-- ---------------------------------------------------------------------------
insert into public.crm_masters (user_id)
select id from auth.users
where lower(email) in (
  'contato@arkynia.com',
  'levy@exemplo.com.br'   -- <<< e-mail real do Levy aqui
)
on conflict do nothing;

-- Confere quem ficou master (rode e olhe o resultado):
--   select u.email from public.crm_masters m join auth.users u on u.id = m.user_id;

-- Herda os masters que já existiam no modelo antigo, se a tabela ainda estiver lá
do $$
begin
  if to_regclass('public.crm_user_roles') is not null then
    insert into public.crm_masters (user_id)
    select user_id from public.crm_user_roles where role = 'master'
    on conflict do nothing;
  end if;
end
$$;

-- ATENÇÃO à herança de papel: a coluna role nasce com default 'admin', então
-- TODO mundo que já estava em user_clients virou admin da loja — inclusive
-- quem era 'member' no modelo antigo. Este bloco rebaixa esses para
-- colaborador, que é o equivalente mais próximo.
do $$
begin
  if to_regclass('public.crm_user_roles') is not null then
    update public.user_clients uc
    set role = 'collaborator'
    from public.crm_user_roles r
    where r.user_id = uc.user_id
      and r.role = 'member'
      and not exists (select 1 from public.crm_masters m where m.user_id = uc.user_id);
  end if;
end
$$;

-- Confira quem ficou com o quê ANTES de liberar para o time:
--   select u.email, c.name, uc.role
--   from public.user_clients uc
--   join auth.users u on u.id = uc.user_id
--   join public.clients c on c.id = uc.client_id
--   order by u.email;

-- ---------------------------------------------------------------------------
-- 7) crm_user_roles (modelo antigo)
--    Não apago aqui de propósito: rode o bloco 6, confirme no CRM que você e o
--    Levy entram como master e que um colaborador de teste não vê Clientes, e
--    só então rode:
--        drop table public.crm_user_roles;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 8) Função para o n8n
--    Os fluxos rodam com service_role, onde auth.uid() é nulo — então eles
--    precisam de uma versão que receba o user_id extraído do JWT.
--    Uso no n8n (Supabase node → RPC):
--        crm_role_of(p_user_id, p_client_id) → 'master'|'admin'|'collaborator'|null
-- ---------------------------------------------------------------------------
create or replace function public.crm_role_of(p_user_id uuid, p_client_id uuid)
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from public.crm_masters where user_id = p_user_id) then 'master'
    else (
      select uc.role from public.user_clients uc
      where uc.user_id = p_user_id and uc.client_id = p_client_id
    )
  end;
$$;

-- Só o n8n (service_role) chama esta. Revogar de anon/authenticated NÃO basta:
-- o Postgres concede execute a PUBLIC por padrão, e os dois herdam de lá — sem
-- tirar de PUBLIC a função continua exposta como RPC para quem estiver logado.
revoke execute on function public.crm_role_of(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_role_of(uuid, uuid) to service_role;
