-- Cadastro de clientes e lojas pela tela — CRM Unificca
-- Rodar no Supabase DEPOIS de access-roles.sql. Idempotente.
--
-- Até aqui `clients` e `stores` eram só leitura no frontend: cliente novo
-- nascia por INSERT na mão e loja só aparecia quando o fluxo de NF-e a criava
-- sozinho (Upsert loja, chaveado por marketplace + external_shop_id).
--
-- VOCABULÁRIO — os dois níveis não são a mesma coisa:
--   clients → o CLIENTE, a empresa com quem vocês fecham (o tenant; é o que
--             escopa papel e RLS)
--   stores  → as LOJAS dele, uma por conta de marketplace (Shopee, ML, TikTok)
--
-- Quem pode o quê:
--   master → cria e edita cliente; cria e edita loja de qualquer cliente
--   admin  → edita as lojas do próprio cliente (nome e status); não cria
--            cliente nem mexe em outro
--   collaborator → nada aqui

-- ---------------------------------------------------------------------------
-- 1) Clientes: só master cria e edita
-- ---------------------------------------------------------------------------
drop policy if exists "crm insert clients" on public.clients;
create policy "crm insert clients"
  on public.clients for insert to authenticated
  with check (public.crm_is_master());

drop policy if exists "crm update clients" on public.clients;
create policy "crm update clients"
  on public.clients for update to authenticated
  using (public.crm_is_master())
  with check (public.crm_is_master());

-- Sem policy de delete: cliente com venda no histórico não se apaga por tela.

-- ---------------------------------------------------------------------------
-- 2) Lojas: master cria em qualquer cliente; admin edita as do seu
-- ---------------------------------------------------------------------------
drop policy if exists "crm insert stores" on public.stores;
create policy "crm insert stores"
  on public.stores for insert to authenticated
  with check (public.crm_is_master());

drop policy if exists "crm update stores" on public.stores;
create policy "crm update stores"
  on public.stores for update to authenticated
  using (public.crm_sees_customer_data(client_id))
  with check (public.crm_sees_customer_data(client_id));

-- ---------------------------------------------------------------------------
-- 3) Acesso de quem já tem login: master concede e revoga pela tela
--    Criar usuário NOVO continua sendo pelo n8n (só a service_role cria conta
--    no Auth). Isto aqui é para ligar/desligar um login existente a um cliente.
-- ---------------------------------------------------------------------------
drop policy if exists "crm insert user_clients" on public.user_clients;
create policy "crm insert user_clients"
  on public.user_clients for insert to authenticated
  with check (public.crm_is_master());

drop policy if exists "crm update user_clients" on public.user_clients;
create policy "crm update user_clients"
  on public.user_clients for update to authenticated
  using (public.crm_is_master())
  with check (public.crm_is_master());

drop policy if exists "crm delete user_clients" on public.user_clients;
create policy "crm delete user_clients"
  on public.user_clients for delete to authenticated
  using (public.crm_is_master());

-- ---------------------------------------------------------------------------
-- 4) Lojas com a contagem de acessos e vendas, para a tela de gestão
--    Função em vez de view: precisa rodar como definer para contar linhas de
--    outros clientes (o master vê tudo, mas a policy de orders é por cliente).
-- ---------------------------------------------------------------------------
create or replace function public.crm_clients_overview()
returns table (
  id uuid,
  name text,
  document text,
  created_at timestamptz,
  lojas bigint,
  acessos bigint,
  clientes_base bigint
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id, c.name, c.document, c.created_at,
         (select count(*) from public.stores s where s.client_id = c.id),
         (select count(*) from public.user_clients uc where uc.client_id = c.id),
         (select count(*) from public.customers cu where cu.client_id = c.id)
  from public.clients c
  where c.id in (select public.crm_client_ids())
  order by c.created_at;
$$;

grant execute on function public.crm_clients_overview() to authenticated;
