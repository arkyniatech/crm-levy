-- Imagem em campanhas de WhatsApp — CRM Contatta (Levy)
-- Rodar no Supabase: SQL Editor → New query → colar → Run.

-- 1) Guarda a URL pública da imagem da campanha
alter table public.wa_campaigns add column if not exists media_url text;

-- 2) Bucket público de storage para as imagens das campanhas.
--    Público na leitura (o uazapi precisa baixar a imagem pela URL);
--    upload só para usuário logado.
insert into storage.buckets (id, name, public)
values ('campaign-media', 'campaign-media', true)
on conflict (id) do nothing;

drop policy if exists "campaign media upload" on storage.objects;
create policy "campaign media upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'campaign-media');

drop policy if exists "campaign media update" on storage.objects;
create policy "campaign media update"
  on storage.objects for update to authenticated
  using (bucket_id = 'campaign-media');

drop policy if exists "campaign media read" on storage.objects;
create policy "campaign media read"
  on storage.objects for select to public
  using (bucket_id = 'campaign-media');
