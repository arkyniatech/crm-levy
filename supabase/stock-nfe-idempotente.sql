-- Baixa de estoque por NF-e: não repetir nota já baixada — CRM Unificca
-- Rodar no Supabase DEPOIS de stock-schema.sql. Idempotente.
--
-- O PROBLEMA
-- deduct_stock_for_nfe recebia p_ref (identificação da nota), gravava junto do
-- movimento e nunca o consultava. Reimportar o mesmo lote com "descontar do
-- estoque" marcado — que é o padrão da tela — inseria um segundo movimento
-- negativo e o trigger abatia de products.stock outra vez. O estoque ficava
-- menor que o real, sem nada indicando o porquê.
--
-- Não uso índice único para isso de propósito: a exceção abortaria a função
-- inteira e derrubaria as baixas legítimas das outras linhas da mesma nota.
-- A checagem abaixo pula só o item repetido e segue.

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
  repeated int := 0;
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

    -- Já baixou este SKU nesta nota? Então é reimportação: não desconta de novo.
    -- Sem p_ref não há como saber, e aí desconta (comportamento antigo).
    if coalesce(p_ref, '') <> '' and exists (
      select 1 from public.stock_movements
      where client_id = p_client
        and reason = 'nfe'
        and ref = p_ref
        and sku = (it->>'sku')
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
      values (p_client, v_id, it->>'sku', -qty, 'nfe', p_ref, p_created_by);
    deducted := deducted + 1;
  end loop;

  return jsonb_build_object('deducted', deducted, 'repeated', repeated, 'unknown', to_jsonb(unknown));
end;
$$;

grant execute on function public.deduct_stock_for_nfe(uuid, jsonb, text, uuid) to authenticated;
