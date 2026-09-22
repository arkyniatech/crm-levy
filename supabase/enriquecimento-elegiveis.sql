-- Quem pode ser enriquecido, e o painel de consumo do master — CRM Contatta
-- Rodar DEPOIS de enrich-log-schema.sql. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) A REGRA DE ELEGIBILIDADE, num lugar só
--
-- Enriquece apenas:
--   • CPF novo — nunca passou por enriquecimento (extra->>enriched_at nulo)
--   • CPF antigo sem telefone na base
--
-- Quem já foi enriquecido E tem telefone não volta para a fila: seria pagar
-- de novo por um dado que já está lá.
--
-- A regra mora aqui, e não dentro do fluxo n8n, para existir uma definição só.
-- O fluxo chama esta função em vez de montar o próprio filtro.
-- ---------------------------------------------------------------------------
create or replace function public.crm_enrich_pendentes(p_client_id uuid, p_limit integer default 10)
returns table (id uuid, cpf text, nome text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id, c.cpf, c.name
  from public.customers c
  where c.client_id = p_client_id
    and c.cpf is not null
    and length(regexp_replace(c.cpf, '[^0-9]', '', 'g')) = 11
    and (
      c.extra->>'enriched_at' is null                 -- nunca enriquecido
      or coalesce(trim(c.phone), '') = ''             -- ou sem telefone
    )
  order by c.first_seen_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 10), 500));
$$;

-- Só o n8n usa: revogar de PUBLIC também, senão anon e authenticated herdam.
revoke execute on function public.crm_enrich_pendentes(uuid, integer) from public, anon, authenticated;
grant  execute on function public.crm_enrich_pendentes(uuid, integer) to service_role;

-- Quantos estão na fila — esta a tela pode ler, é só uma contagem.
create or replace function public.crm_enrich_pendentes_total(p_client_id uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.customers c
  where c.client_id = p_client_id
    and public.crm_sees_customer_data(p_client_id)
    and c.cpf is not null
    and length(regexp_replace(c.cpf, '[^0-9]', '', 'g')) = 11
    and (c.extra->>'enriched_at' is null or coalesce(trim(c.phone), '') = '');
$$;

grant execute on function public.crm_enrich_pendentes_total(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Consumo por loja, para o master acompanhar
-- ---------------------------------------------------------------------------
create or replace function public.crm_enrich_stats()
returns table (
  client_id uuid,
  loja text,
  execucoes bigint,
  solicitados bigint,
  enriquecidos bigint,
  ultima timestamptz
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id, c.name, count(r.id),
         coalesce(sum(r.solicitados), 0),
         coalesce(sum(r.enriquecidos), 0),
         max(r.created_at)
  from public.clients c
  left join public.enrich_runs r on r.client_id = c.id
  where public.crm_is_master()
  group by c.id, c.name
  order by max(r.created_at) desc nulls last, c.name;
$$;

grant execute on function public.crm_enrich_stats() to authenticated;
