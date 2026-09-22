-- Cota de instâncias: uma função para a tela, outra para o n8n — CRM Contatta
-- Rodar DEPOIS de wa-instances-schema.sql. Idempotente.
--
-- HISTÓRICO DESTE ARQUIVO, porque a primeira versão quebrou o fluxo:
--
-- crm_wa_instance_quota nasceu SECURITY DEFINER sem checagem nenhuma: qualquer
-- usuário autenticado que soubesse o uuid de uma loja lia o limite e a
-- contagem de instâncias dela. Vazamento pequeno, mas fura o isolamento por
-- loja.
--
-- A primeira correção exigiu crm_role_in(...) is not null — e derrubou o fluxo
-- n8n, que chama com service_role, onde auth.uid() é NULO. A função passou a
-- devolver zero linhas, o fluxo morreu no nó da cota e o webhook terminou sem
-- responder.
--
-- A regra que vale para todo este projeto: função consumida pelo n8n recebe o
-- user_id como parâmetro; função consumida pela tela usa auth.uid(). Nunca a
-- mesma para os dois. Mesmo par de crm_role_in (tela) e crm_role_of (n8n).

-- ---------------------------------------------------------------------------
-- 1) Para a TELA: escopada pelo usuário logado
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2) Para o N8N: recebe de quem é a chamada, já que não há sessão
-- ---------------------------------------------------------------------------
create or replace function public.crm_wa_quota_of(p_user_id uuid, p_client_id uuid)
returns table (limite integer, usadas bigint, pode_criar boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.wa_instance_limit,
         (select count(*) from public.wa_instances w where w.client_id = c.id),
         (select count(*) from public.wa_instances w where w.client_id = c.id) < c.wa_instance_limit
  from public.clients c
  where c.id = p_client_id
    and public.crm_role_of(p_user_id, p_client_id) is not null;
$$;

revoke execute on function public.crm_wa_quota_of(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.crm_wa_quota_of(uuid, uuid) to service_role;
