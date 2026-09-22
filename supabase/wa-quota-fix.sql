-- Cota de instâncias: conferir quem está perguntando — CRM Contatta
-- Rodar DEPOIS de wa-instances-schema.sql. Idempotente.
--
-- crm_wa_instance_quota era SECURITY DEFINER sem checagem de papel: qualquer
-- usuário autenticado que soubesse o uuid de uma loja lia o limite e quantas
-- instâncias ela tem, mesmo sem acesso nenhum a ela. Vazamento pequeno — são
-- dois números — mas fura o isolamento por loja, que é a premissa do resto.
--
-- Agora devolve zero linhas para quem não é da loja, e a tela trata isso como
-- "não pode criar".

create or replace function public.crm_wa_instance_quota(p_client_id uuid)
returns table (limite integer, usadas bigint, pode_criar boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.wa_instance_limit,
         (select count(*) from public.wa_instances w where w.client_id = c.id),
         (select count(*) from public.wa_instances w where w.client_id = c.id) < c.wa_instance_limit
  from public.clients c
  where c.id = p_client_id
    and public.crm_role_in(p_client_id) is not null;
$$;

grant execute on function public.crm_wa_instance_quota(uuid) to authenticated;
