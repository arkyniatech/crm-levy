-- Acessos da loja lidos e escritos direto do banco — CRM Contatta
-- Rodar DEPOIS de access-roles.sql e admin-clientes-lojas.sql. Idempotente.
--
-- POR QUE
-- A tela "Acessos da loja" listava pelo webhook n8n unificca-admin-users, que
-- é anterior aos papéis por loja: ele ignora o client_id e lê papel da tabela
-- antiga. Resultado, a loja de demonstração mostrava os acessos da loja do
-- Levy, e um master aparecia como colaborador.
--
-- Listar, conceder e revogar não precisam de n8n: são operações no banco, e o
-- RLS já sabe quem pode. Só CRIAR LOGIN NOVO continua exigindo service_role,
-- porque mexe em auth.users.

-- ---------------------------------------------------------------------------
-- 1) Quem tem acesso a esta loja
--    Definer porque o frontend não pode ler auth.users para achar o e-mail.
--    A checagem de papel está dentro: quem não é admin nem master da loja
--    recebe zero linhas.
-- ---------------------------------------------------------------------------
create or replace function public.crm_client_users(p_client_id uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select uc.user_id, u.email::text, uc.role, uc.created_at
  from public.user_clients uc
  join auth.users u on u.id = uc.user_id
  where uc.client_id = p_client_id
    and public.crm_role_in(p_client_id) in ('master', 'admin')
  order by u.email;
$$;

grant execute on function public.crm_client_users(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Conceder acesso a um login que já existe, pelo e-mail
-- ---------------------------------------------------------------------------
create or replace function public.crm_grant_access(
  p_client_id uuid,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  if public.crm_role_in(p_client_id) not in ('master', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Sem permissão nesta loja.');
  end if;
  if p_role not in ('admin', 'collaborator') then
    return jsonb_build_object('ok', false, 'error', 'Papel inválido.');
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    return jsonb_build_object('ok', false,
      'error', 'Não existe login com esse e-mail. Crie o login antes de conceder acesso.');
  end if;

  insert into public.user_clients (user_id, client_id, role)
  values (v_user, p_client_id, p_role)
  on conflict (user_id, client_id) do update set role = excluded.role;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.crm_grant_access(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Revogar o acesso de alguém a esta loja
--    Não apaga o login, só o vínculo. E não deixa remover master: master não
--    está em user_clients, então não há o que revogar por aqui.
-- ---------------------------------------------------------------------------
create or replace function public.crm_revoke_access(p_client_id uuid, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.crm_role_in(p_client_id) not in ('master', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Sem permissão nesta loja.');
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Você não pode remover o próprio acesso.');
  end if;

  delete from public.user_clients where client_id = p_client_id and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.crm_revoke_access(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Admin passa a poder mexer nos acessos da PRÓPRIA loja
--    Antes só master escrevia em user_clients. As funções acima já checam o
--    papel, mas as policies abaixo mantêm a escrita direta coerente com elas.
-- ---------------------------------------------------------------------------
drop policy if exists "crm insert user_clients" on public.user_clients;
create policy "crm insert user_clients"
  on public.user_clients for insert to authenticated
  with check (public.crm_role_in(client_id) in ('master', 'admin'));

drop policy if exists "crm update user_clients" on public.user_clients;
create policy "crm update user_clients"
  on public.user_clients for update to authenticated
  using (public.crm_role_in(client_id) in ('master', 'admin'))
  with check (public.crm_role_in(client_id) in ('master', 'admin'));

drop policy if exists "crm delete user_clients" on public.user_clients;
create policy "crm delete user_clients"
  on public.user_clients for delete to authenticated
  using (public.crm_role_in(client_id) in ('master', 'admin'));
