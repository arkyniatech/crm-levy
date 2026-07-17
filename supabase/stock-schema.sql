-- Estoque de produtos — CRM Contatta/Unificca (Levy)
-- Rodar no Supabase: SQL Editor → New query → colar → Run.
--
-- Modelo:
--  • products         = catálogo com saldo (stock), casado por SKU.
--  • stock_movements  = extrato de TODA mudança de saldo (entrada/saída/ajuste).
--    O saldo em products.stock é mantido AUTOMATICAMENTE por um trigger a cada
--    movimento — nunca se escreve stock direto; sempre insere um movimento.
--    Assim tudo fica auditável e reversível (basta lançar o movimento inverso).

-- A tabela products já existe neste banco (catálogo do Levy, com sku/name/
-- price/marketplace/...), mas sem saldo. Criamos se não existir e, de todo
-- jeito, garantimos a coluna stock (é o que faltava na 1ª execução).
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  sku text not null,
  name text,
  stock numeric not null default 0,
  price numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, sku)
);

alter table public.products add column if not exists stock numeric not null default 0;

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sku text,
  delta numeric not null,           -- + entrada, - saída
  reason text not null,             -- 'initial' | 'manual_in' | 'manual_out' | 'nfe' | 'file_in' | 'file_out' | 'adjust'
  ref text,                         -- nº/chave da NF, nome do arquivo, ou observação
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_mov_product on public.stock_movements (product_id, created_at desc);
create index if not exists idx_stock_mov_client on public.stock_movements (client_id, created_at desc);

-- Saldo mantido pelo trigger (SECURITY DEFINER: aplica mesmo que o usuário só
-- tenha permissão de inserir movimento, não de alterar products.stock).
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
    set stock = coalesce(stock, 0) + NEW.delta,
        updated_at = now()
  where id = NEW.product_id;
  return NEW;
end;
$$;

drop trigger if exists trg_apply_stock on public.stock_movements;
create trigger trg_apply_stock
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- RLS: leitura + escrita para o usuário logado, escopado por user_clients.
-- (Quando as permissões por papel entrarem, apertamos isto para checar o papel.)
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "crm select products" on public.products;
create policy "crm select products" on public.products for select to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = (select auth.uid())));

drop policy if exists "crm insert products" on public.products;
create policy "crm insert products" on public.products for insert to authenticated
  with check (client_id in (select client_id from public.user_clients where user_id = (select auth.uid())));

drop policy if exists "crm update products" on public.products;
create policy "crm update products" on public.products for update to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = (select auth.uid())))
  with check (client_id in (select client_id from public.user_clients where user_id = (select auth.uid())));

drop policy if exists "crm select stock_movements" on public.stock_movements;
create policy "crm select stock_movements" on public.stock_movements for select to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = (select auth.uid())));

drop policy if exists "crm insert stock_movements" on public.stock_movements;
create policy "crm insert stock_movements" on public.stock_movements for insert to authenticated
  with check (client_id in (select client_id from public.user_clients where user_id = (select auth.uid())));

-- Baixa de estoque de uma NF-e numa chamada só (casa por SKU, lança os
-- movimentos e devolve quantos baixaram + SKUs não encontrados).
-- Usada pelo fluxo n8n de import e reutilizável pelos arquivos futuros.
create or replace function public.deduct_stock_for_nfe(
  p_client uuid,
  p_items jsonb,
  p_ref text,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
  v_id uuid;
  qty numeric;
  deducted int := 0;
  unknown text[] := '{}';
begin
  -- se chamado por um usuário logado, só deixa mexer na própria empresa
  if auth.uid() is not null
     and not exists (select 1 from public.user_clients where user_id = auth.uid() and client_id = p_client) then
    raise exception 'sem permissão para esta empresa';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    qty := coalesce((it->>'qty')::numeric, 0);
    if qty <= 0 or coalesce(it->>'sku', '') = '' then continue; end if;
    select id into v_id from public.products
      where client_id = p_client and sku = (it->>'sku') and active limit 1;
    if v_id is null then
      unknown := array_append(unknown, it->>'sku');
      continue;
    end if;
    insert into public.stock_movements (client_id, product_id, sku, delta, reason, ref, created_by)
      values (p_client, v_id, it->>'sku', -qty, 'nfe', p_ref, p_created_by);
    deducted := deducted + 1;
  end loop;

  return jsonb_build_object('deducted', deducted, 'unknown', to_jsonb(unknown));
end;
$$;

grant execute on function public.deduct_stock_for_nfe(uuid, jsonb, text, uuid) to authenticated;

