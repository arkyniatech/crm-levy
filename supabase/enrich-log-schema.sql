-- Histórico de enriquecimentos — CRM Contatta
-- Rodar DEPOIS de access-roles.sql. Idempotente.
--
-- Diferente da importação de NF-e, o enriquecimento é síncrono: a tela chama o
-- fluxo e recebe o resultado na mesma requisição. Por isso quem registra aqui
-- é o próprio CRM, e não o n8n — não precisa mexer em fluxo nenhum.
--
-- O que isso responde: quanto crédito foi consumido, por quem, quando, e
-- quantos dos clientes pedidos realmente voltaram com dado. Sem isso, o saldo
-- caindo é um fato sem história.

create table if not exists public.enrich_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  -- quantos foram pedidos na tela e quantos voltaram com dado
  solicitados  integer not null default 0,
  enriquecidos integer not null default 0,
  -- o desconto de saldo é sempre igual a enriquecidos, mas guardamos separado:
  -- se a regra de cobrança mudar, o histórico antigo continua verdadeiro
  creditos_gastos integer not null default 0,
  status text not null default 'concluido',   -- concluido | erro
  erro text,
  created_at timestamptz not null default now()
);

alter table public.enrich_runs
  drop constraint if exists enrich_runs_status_check;
alter table public.enrich_runs
  add constraint enrich_runs_status_check check (status in ('concluido', 'erro'));

create index if not exists idx_enrich_runs_client
  on public.enrich_runs (client_id, created_at desc);

alter table public.enrich_runs enable row level security;

-- Ler e escrever: quem enxerga dado de cliente, ou seja admin e master. O
-- colaborador não enriquece nem vê a base, então não tem o que fazer aqui.
drop policy if exists "crm select enrich_runs" on public.enrich_runs;
create policy "crm select enrich_runs"
  on public.enrich_runs for select to authenticated
  using (client_id in (select public.crm_client_ids_with_customer_data()));

-- O insert exige que a linha seja da própria loja E em nome de quem está
-- logado: sem o segundo, daria para registrar consumo no nome de outro.
drop policy if exists "crm insert enrich_runs" on public.enrich_runs;
create policy "crm insert enrich_runs"
  on public.enrich_runs for insert to authenticated
  with check (
    client_id in (select public.crm_client_ids_with_customer_data())
    and user_id = (select auth.uid())
  );

-- Sem update nem delete: histórico de consumo não se reescreve.

-- ---------------------------------------------------------------------------
-- Listagem com o e-mail de quem rodou (o frontend não lê auth.users)
-- ---------------------------------------------------------------------------
create or replace function public.crm_enrich_runs(p_client_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  email text,
  solicitados integer,
  enriquecidos integer,
  creditos_gastos integer,
  status text,
  erro text,
  created_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select r.id, u.email::text, r.solicitados, r.enriquecidos, r.creditos_gastos,
         r.status, r.erro, r.created_at
  from public.enrich_runs r
  left join auth.users u on u.id = r.user_id
  where r.client_id = p_client_id
    and public.crm_sees_customer_data(p_client_id)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.crm_enrich_runs(uuid, integer) to authenticated;
