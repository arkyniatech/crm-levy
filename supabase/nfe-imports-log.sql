-- Histórico de importações de NF-e — CRM Unificca
-- Rodar DEPOIS de nfe-imports-schema.sql e access-roles.sql. Idempotente.
--
-- A tabela nfe_imports guarda user_id, mas o frontend não pode ler auth.users
-- para descobrir o e-mail. Esta função devolve as importações já com quem
-- mandou o arquivo, para a aba Histórico.

create or replace function public.crm_nfe_imports(p_client_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  status text,
  erro text,
  file_name text,
  email text,
  total_nfes integer,
  novos_pedidos integer,
  pedidos_atualizados integer,
  novos_clientes integer,
  sem_cpf integer,
  nota_de timestamptz,
  nota_ate timestamptz,
  created_at timestamptz,
  finished_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.id, i.status, i.erro, i.file_name, u.email::text,
         i.total_nfes, i.novos_pedidos, i.pedidos_atualizados, i.novos_clientes,
         i.sem_cpf, i.nota_de, i.nota_ate, i.created_at, i.finished_at
  from public.nfe_imports i
  left join auth.users u on u.id = i.user_id
  where i.client_id = p_client_id
    and public.crm_role_in(p_client_id) is not null   -- barra quem não é do cliente
  order by i.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.crm_nfe_imports(uuid, integer) to authenticated;
