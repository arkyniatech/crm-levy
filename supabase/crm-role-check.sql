-- Papel do usuário em formato que o n8n consegue ler — CRM Contatta
-- Rodar DEPOIS de access-roles.sql. Idempotente.
--
-- O PROBLEMA
-- crm_role_of é "returns text", e o PostgREST responde isso como um escalar
-- JSON solto: literalmente "admin", sem objeto em volta. O nó HTTP Request do
-- n8n recusa esse corpo ("Response body is not valid JSON"), falha, e com
-- onError=continueRegularOutput empurra o objeto de erro para a frente — o nó
-- seguinte compara papel contra uma mensagem de erro e barra todo mundo,
-- inclusive admin e master legítimos.
--
-- A SOLUÇÃO
-- Uma função "returns table" faz o PostgREST responder [{"papel":"admin"}] —
-- array de objeto, que é o formato que o n8n espera. crm_role_of continua
-- existindo para quem já a usa.

create or replace function public.crm_role_check(p_user_id uuid, p_client_id uuid)
returns table (papel text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.crm_role_of(p_user_id, p_client_id);
$$;

-- Só o n8n chama: revogar de PUBLIC também, senão anon e authenticated
-- herdam o execute que o Postgres concede por padrão.
revoke execute on function public.crm_role_check(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.crm_role_check(uuid, uuid) to service_role;
