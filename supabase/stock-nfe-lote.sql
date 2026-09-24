-- Baixa de estoque de várias notas numa chamada — CRM Contatta
-- Rodar DEPOIS de stock-nfe-idempotente.sql. Idempotente.
--
-- O fluxo de importação chamava deduct_stock_for_nfe uma vez por nota. Com
-- 1000 notas são 1000 idas e voltas ao banco só para o estoque. Esta versão
-- recebe o lote inteiro e resolve tudo do lado de cá.
--
-- Mantém a regra de não baixar duas vezes a mesma nota, que é o motivo de
-- existir o p_ref.

create or replace function public.deduct_stock_for_nfes(
  p_client uuid,
  p_notas jsonb,            -- [{ "ref": "<chave>", "items": [{ "sku": "...", "qty": 2 }] }]
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nota jsonb;
  it jsonb;
  v_ref text;
  v_id uuid;
  qty numeric;
  deducted int := 0;
  repeated int := 0;
  unknown text[] := '{}';
begin
  if auth.uid() is not null
     and not exists (select 1 from public.user_clients where user_id = auth.uid() and client_id = p_client) then
    raise exception 'sem permissão para esta empresa';
  end if;

  for nota in select * from jsonb_array_elements(coalesce(p_notas, '[]'::jsonb)) loop
    v_ref := coalesce(nota->>'ref', '');

    for it in select * from jsonb_array_elements(coalesce(nota->'items', '[]'::jsonb)) loop
      qty := coalesce((it->>'qty')::numeric, 0);
      if qty <= 0 or coalesce(it->>'sku', '') = '' then continue; end if;

      -- mesma nota, mesmo SKU: já baixou antes, não baixa de novo
      if v_ref <> '' and exists (
        select 1 from public.stock_movements
        where client_id = p_client and reason = 'nfe'
          and ref = v_ref and sku = (it->>'sku')
      ) then
        repeated := repeated + 1;
        continue;
      end if;

      select id into v_id from public.products
        where client_id = p_client and sku = (it->>'sku') and active limit 1;
      if v_id is null then
        unknown := array_append(unknown, it->>'sku');
        continue;
      end if;

      insert into public.stock_movements (client_id, product_id, sku, delta, reason, ref, created_by)
        values (p_client, v_id, it->>'sku', -qty, 'nfe', v_ref, p_created_by);
      deducted := deducted + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'deducted', deducted,
    'repeated', repeated,
    'unknown', to_jsonb(unknown)
  );
end;
$$;

grant execute on function public.deduct_stock_for_nfes(uuid, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Substituir os itens de vários pedidos numa chamada
--
-- O fluxo antigo fazia, por nota: um DELETE dos itens e um INSERT dos novos.
-- Em lote isso viraria uma URL com todos os uuids em "order_id=in.(...)" —
-- 37 KB para 1000 pedidos, acima do limite de praticamente qualquer proxy.
--
-- Aqui o array vai no corpo, o delete e o insert acontecem na mesma transação,
-- e não existe janela em que o pedido fique sem itens.
-- ---------------------------------------------------------------------------
create or replace function public.crm_replace_order_items(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordens uuid[];
  v_inseridos int;
begin
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    return jsonb_build_object('ok', true, 'inseridos', 0);
  end if;

  select array_agg(distinct (x->>'order_id')::uuid)
    into v_ordens
  from jsonb_array_elements(p_items) x
  where x->>'order_id' is not null;

  delete from public.order_items where order_id = any(v_ordens);

  insert into public.order_items
    (order_id, external_item_id, sku, product_name, quantity, unit_price, total_price)
  select (x->>'order_id')::uuid, x->>'external_item_id', x->>'sku', x->>'product_name',
         coalesce((x->>'quantity')::numeric, 1),
         nullif(x->>'unit_price', '')::numeric,
         nullif(x->>'total_price', '')::numeric
  from jsonb_array_elements(p_items) x
  where x->>'order_id' is not null;

  get diagnostics v_inseridos = row_count;
  return jsonb_build_object('ok', true, 'pedidos', coalesce(array_length(v_ordens, 1), 0),
                            'inseridos', v_inseridos);
end;
$$;

grant execute on function public.crm_replace_order_items(jsonb) to authenticated;
