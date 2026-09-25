-- Importação de NF-e feita pelo próprio CRM — Contatta
-- Rodar DEPOIS de access-roles.sql. Idempotente.
--
-- POR QUE
-- A importação vivia no n8n, que grava com service_role e por isso nunca
-- precisou de policy de escrita. Passando a acontecer no navegador, quem grava
-- é o usuário logado — e aí o RLS precisa deixar.
--
-- O QUE ISSO ABRE, E O QUE NÃO ABRE
-- Admin e master da loja passam a poder inserir e atualizar clientes, lojas,
-- pedidos e itens DA PRÓPRIA LOJA. Não é capacidade nova: a tela já deixava
-- criar cliente na mão, e quem é admin já enxerga tudo. O que muda é o volume.
--
-- Colaborador continua de fora: ele importa nota, mas quem vai gravar agora é
-- a tela dele... então ele PRECISA gravar. Ver a nota no fim do arquivo.

-- ---------------------------------------------------------------------------
-- 1) Quem pode gravar dado de importação nesta loja
--    Colaborador entra aqui porque importar NF-e é função dele. Ele grava
--    cliente e pedido, mas continua sem poder LER a base — as policies de
--    select seguem exigindo admin.
-- ---------------------------------------------------------------------------
create or replace function public.crm_pode_importar(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.crm_role_in(p_client_id) in ('master', 'admin', 'collaborator');
$$;

grant execute on function public.crm_pode_importar(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Clientes
-- ---------------------------------------------------------------------------
drop policy if exists "crm insert customers" on public.customers;
create policy "crm insert customers"
  on public.customers for insert to authenticated
  with check (public.crm_pode_importar(client_id));

drop policy if exists "crm update customers" on public.customers;
create policy "crm update customers"
  on public.customers for update to authenticated
  using (public.crm_pode_importar(client_id))
  with check (public.crm_pode_importar(client_id));

-- ---------------------------------------------------------------------------
-- 3) Lojas (contas de marketplace) — a nota cria a loja do emitente
-- ---------------------------------------------------------------------------
drop policy if exists "crm insert stores" on public.stores;
create policy "crm insert stores"
  on public.stores for insert to authenticated
  with check (public.crm_pode_importar(client_id));

-- O update de stores continua sendo de quem enxerga a loja (admin e master):
-- renomear ou desativar conta de marketplace não é tarefa de importação.

-- ---------------------------------------------------------------------------
-- 4) Pedidos e itens — escopados pela loja, que já é escopada pelo cliente
-- ---------------------------------------------------------------------------
drop policy if exists "crm insert orders" on public.orders;
create policy "crm insert orders"
  on public.orders for insert to authenticated
  with check (
    store_id in (
      select s.id from public.stores s where public.crm_pode_importar(s.client_id)
    )
  );

drop policy if exists "crm update orders" on public.orders;
create policy "crm update orders"
  on public.orders for update to authenticated
  using (
    store_id in (select s.id from public.stores s where public.crm_pode_importar(s.client_id))
  )
  with check (
    store_id in (select s.id from public.stores s where public.crm_pode_importar(s.client_id))
  );

drop policy if exists "crm insert order_items" on public.order_items;
create policy "crm insert order_items"
  on public.order_items for insert to authenticated
  with check (
    order_id in (
      select o.id from public.orders o
      join public.stores s on s.id = o.store_id
      where public.crm_pode_importar(s.client_id)
    )
  );

drop policy if exists "crm delete order_items" on public.order_items;
create policy "crm delete order_items"
  on public.order_items for delete to authenticated
  using (
    order_id in (
      select o.id from public.orders o
      join public.stores s on s.id = o.store_id
      where public.crm_pode_importar(s.client_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 5) O registro da importação passa a ser escrito pela tela
--    O gatilho de débito do saldo continua valendo: ele roda no insert,
--    não importa quem inseriu.
-- ---------------------------------------------------------------------------
drop policy if exists "crm insert nfe_imports" on public.nfe_imports;
create policy "crm insert nfe_imports"
  on public.nfe_imports for insert to authenticated
  with check (
    public.crm_pode_importar(client_id)
    and (user_id is null or user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- NOTA SOBRE O COLABORADOR
-- Ele grava cliente e pedido, mas não lê nenhum dos dois: as policies de
-- SELECT continuam exigindo admin. Na prática ele joga dado para dentro sem
-- conseguir consultá-lo — que é exatamente o desenho que você pediu.
--
-- O efeito colateral a conhecer: com poder de INSERT, ele consegue gravar um
-- cliente inventado na base da loja. Não é vazamento, é sujeira. Se isso
-- incomodar, troque crm_pode_importar por crm_sees_customer_data nas policies
-- de customers e orders — aí só admin importa.
-- ---------------------------------------------------------------------------
