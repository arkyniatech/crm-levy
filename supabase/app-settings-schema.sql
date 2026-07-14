-- Configurações do app por empresa (CRM Unificca)
-- Rodar no Supabase: SQL Editor → New query → colar → Run.
--
-- Chave-valor por client_id. Diferente das outras tabelas, aqui o usuário
-- autenticado PODE escrever (só nas configs da própria empresa) — assim a
-- tela de Configurações salva direto, sem passar pelo n8n. Segredos continuam
-- fora daqui (ficam nas credenciais do n8n).
--
-- Uso atual: key='campaign_delay' → value {"min":2,"max":6} (segundos entre
-- mensagens no disparo). Serve de base para outros ajustes no futuro.

create table if not exists public.app_settings (
  client_id uuid not null references public.clients (id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (client_id, key)
);

alter table public.app_settings enable row level security;

-- Ler as configs da própria empresa
drop policy if exists "crm select app_settings" on public.app_settings;
create policy "crm select app_settings"
  on public.app_settings for select to authenticated
  using (
    client_id in (select client_id from public.user_clients where user_id = (select auth.uid()))
  );

-- Criar/atualizar configs da própria empresa (a tela salva direto)
drop policy if exists "crm insert app_settings" on public.app_settings;
create policy "crm insert app_settings"
  on public.app_settings for insert to authenticated
  with check (
    client_id in (select client_id from public.user_clients where user_id = (select auth.uid()))
  );

drop policy if exists "crm update app_settings" on public.app_settings;
create policy "crm update app_settings"
  on public.app_settings for update to authenticated
  using (
    client_id in (select client_id from public.user_clients where user_id = (select auth.uid()))
  )
  with check (
    client_id in (select client_id from public.user_clients where user_id = (select auth.uid()))
  );

-- Valor inicial do delay para a empresa do Levy
insert into public.app_settings (client_id, key, value)
values ('677c58eb-b3ec-493a-ad14-0d052d7d8a45', 'campaign_delay', '{"min":2,"max":6}'::jsonb)
on conflict (client_id, key) do nothing;
