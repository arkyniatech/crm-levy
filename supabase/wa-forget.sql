-- Remover do CRM uma instância que já não existe na uazapi — CRM Contatta
-- Rodar DEPOIS de wa-instances-schema.sql. Idempotente.
--
-- POR QUE EXISTE
-- O fluxo n8n só apaga a linha depois que a uazapi confirma — proteção contra
-- os dois lados divergirem. Mas isso criou um impasse real: instância apagada
-- na uazapi por fora deixa no CRM uma linha que não sai por caminho nenhum,
-- porque toda tentativa recebe 404 e o guarda segura.
--
-- O fluxo passou a tratar 404 como "já apagada". Esta função é a saída de
-- emergência para o resto: uazapi fora do ar, token perdido, divergência
-- inesperada. Ela mexe SÓ no CRM, e é explícita quanto a isso.

create or replace function public.crm_wa_forget(p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_client uuid;
begin
  select client_id into v_client from public.wa_instances where id = p_instance_id;
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'Instância não encontrada.');
  end if;
  if public.crm_role_in(v_client) not in ('master', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Sem permissão nesta loja.');
  end if;

  delete from public.wa_instances where id = p_instance_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.crm_wa_forget(uuid) to authenticated;
