-- Quem é alcançável por WhatsApp — uma definição só — CRM Contatta
-- Rodar DEPOIS de access-roles.sql. Idempotente.
--
-- O PROBLEMA QUE ISSO RESOLVE
-- "Tem telefone" estava definido em três lugares, com três respostas:
--   • Visão Geral: phone is not null — conta string vazia e número quebrado
--   • Segmentos: >= 10 dígitos, no cliente OU em algum pedido
--   • Campanha (n8n): E.164 válido, menos opt-out, MAS só nos 2000 primeiros
--     clientes, porque o nó tinha limit=2000 e a base tem 4831
--
-- Daí a Visão Geral dizer 905 e a campanha montar 542.
--
-- Agora a regra mora aqui. Quem quiser saber quem é alcançável pergunta.

-- ---------------------------------------------------------------------------
-- 1) Normalização de número, igual à que o fluxo usa
--    Devolve E.164 (+55…) ou NULL quando não dá para mandar mensagem.
-- ---------------------------------------------------------------------------
create or replace function public.crm_wa_numero(p_fone text)
returns text
language plpgsql immutable
as $$
declare
  d text;
begin
  if p_fone is null then return null; end if;
  d := regexp_replace(p_fone, '[^0-9]', '', 'g');
  if length(d) < 10 then return null; end if;

  -- sem DDI: só aceita se couber em DDD + número; acima disso é lixo
  if left(d, 2) <> '55' then
    if length(d) > 11 then return null; end if;
    d := '55' || d;
  end if;

  if length(d) < 12 or length(d) > 13 then return null; end if;
  return '+' || d;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Quem optou por sair
--    O fluxo lê isso de duas fontes: a tabela wa_optouts e as mensagens
--    recebidas com "sair", "parar" e afins. Manter as duas, porque a tabela
--    é alimentada por um caminho e as mensagens por outro.
-- ---------------------------------------------------------------------------
create or replace function public.crm_wa_optouts()
returns table (wa_number text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select o.wa_number from public.wa_optouts o
  union
  select c.wa_number
  from public.wa_messages m
  join public.wa_conversations c on c.id = m.conversation_id
  where m.direction = 'inbound'
    and lower(btrim(coalesce(m.body, ''))) in
        ('sair', 'parar', 'stop', 'cancelar', 'descadastrar', 'remover');
$$;

-- ---------------------------------------------------------------------------
-- 3) O público de uma campanha
--
-- p_tipo: 'all' | 'recent' | 'segment'
-- p_segment: one_time | recorrente | vip | inactive | birthday
--
-- O telefone sai do cadastro do cliente; não havendo, do pedido mais recente
-- dele — é assim que o fluxo já fazia. Número repetido entra uma vez só, e
-- quem pediu para sair fica de fora.
-- ---------------------------------------------------------------------------
-- A consulta em si, SEM checagem de permissão: quem checa são as duas
-- funções logo abaixo. Separado porque a tela tem sessão (auth.uid()) e o
-- n8n não — a mesma função servindo os dois já nos custou um fluxo quebrado.
create or replace function public.crm_wa_publico_raw(
  p_client_id uuid,
  p_tipo text default 'all',
  p_segment text default null,
  p_days integer default 90,
  p_min_spent numeric default 300
)
returns table (customer_id uuid, nome text, wa_number text, optout boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  with vendas as (
    select o.customer_id,
           count(*) filter (where coalesce(o.status, '') not ilike '%cancel%') as pedidos,
           coalesce(sum(o.total_amount) filter (where coalesce(o.status, '') not ilike '%cancel%'), 0) as gasto,
           max(o.ordered_at) filter (where coalesce(o.status, '') not ilike '%cancel%') as ultima
    from public.orders o
    join public.stores s on s.id = o.store_id
    where s.client_id = p_client_id and o.customer_id is not null
    group by o.customer_id
  ),
  fone_pedido as (
    -- telefone do pedido mais recente que tenha um
    select distinct on (o.customer_id) o.customer_id, o.buyer_phone
    from public.orders o
    join public.stores s on s.id = o.store_id
    where s.client_id = p_client_id
      and o.customer_id is not null
      and coalesce(btrim(o.buyer_phone), '') <> ''
    order by o.customer_id, o.ordered_at desc nulls last
  ),
  candidatos as (
    select c.id,
           c.name,
           public.crm_wa_numero(coalesce(nullif(btrim(c.phone), ''), f.buyer_phone)) as fone,
           coalesce(v.pedidos, 0) as pedidos,
           coalesce(v.gasto, 0) as gasto,
           v.ultima,
           c.birth_date
    from public.customers c
    left join vendas v on v.customer_id = c.id
    left join fone_pedido f on f.customer_id = c.id
    where c.client_id = p_client_id
  ),
  filtrados as (
    select * from candidatos
    where fone is not null
      and case p_tipo
            when 'recent' then ultima is not null
                 and ultima >= now() - make_interval(days => greatest(1, p_days))
            when 'segment' then case p_segment
                   when 'one_time'   then pedidos = 1
                   when 'recorrente' then pedidos >= 2
                   when 'vip'        then gasto >= p_min_spent
                   when 'inactive'   then pedidos >= 1 and ultima is not null
                                          and ultima < now() - make_interval(days => greatest(1, p_days))
                   when 'birthday'   then birth_date is not null
                                          and extract(month from birth_date) = extract(month from current_date)
                   else false
                 end
            else true                      -- 'all'
          end
  )
  -- número repetido entre clientes entra uma vez só
  select distinct on (fone) id, name, fone,
         fone in (select wa_number from public.crm_wa_optouts())
  from filtrados
  order by fone, ultima desc nulls last;
$$;

revoke execute on function public.crm_wa_publico_raw(uuid, text, text, integer, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) As duas portas de entrada
-- ---------------------------------------------------------------------------

-- Para a TELA: escopada pelo usuário logado
create or replace function public.crm_wa_publico(
  p_client_id uuid,
  p_tipo text default 'all',
  p_segment text default null,
  p_days integer default 90,
  p_min_spent numeric default 300
)
returns table (customer_id uuid, nome text, wa_number text, optout boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if public.crm_role_in(p_client_id) is null then return; end if;
  return query select * from public.crm_wa_publico_raw(p_client_id, p_tipo, p_segment, p_days, p_min_spent);
end;
$$;

-- Para o N8N: recebe de quem é a chamada, já que não há sessão
create or replace function public.crm_wa_publico_of(
  p_user_id uuid,
  p_client_id uuid,
  p_tipo text default 'all',
  p_segment text default null,
  p_days integer default 90,
  p_min_spent numeric default 300
)
returns table (customer_id uuid, nome text, wa_number text, optout boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if public.crm_role_of(p_user_id, p_client_id) is null then return; end if;
  return query select * from public.crm_wa_publico_raw(p_client_id, p_tipo, p_segment, p_days, p_min_spent);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Só a contagem, para a Visão Geral parar de contar telefone quebrado
-- ---------------------------------------------------------------------------
create or replace function public.crm_wa_alcancaveis(p_client_id uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select count(*)::integer from public.crm_wa_publico(p_client_id, 'all') where not optout;
$$;

grant execute on function public.crm_wa_numero(text) to authenticated;
grant execute on function public.crm_wa_optouts() to authenticated;
grant execute on function public.crm_wa_publico(uuid, text, text, integer, numeric) to authenticated;
grant execute on function public.crm_wa_alcancaveis(uuid) to authenticated;

revoke execute on function public.crm_wa_publico_of(uuid, uuid, text, text, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.crm_wa_publico_of(uuid, uuid, text, text, integer, numeric)
  to service_role;
