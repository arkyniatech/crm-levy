-- Crédito passa a ser consumido por NOTA IMPORTADA — CRM Contatta
-- Rodar DEPOIS de nfe-imports-schema.sql. Idempotente.
--
-- MUDANÇA DE MODELO
-- Antes: 1 crédito = 1 enriquecimento, debitado pela tela depois de rodar.
-- Agora: 1 crédito = 1 nota importada. Quem tem 1000 e importa 200 fica com
-- 800, independentemente de enriquecer ou não.
--
-- O débito acontece aqui, num gatilho sobre nfe_imports, e não no n8n: o fluxo
-- já grava o resumo ao terminar, então o banco tem tudo o que precisa. Isso
-- evita mais uma rodada de reimport e, principalmente, mantém saldo e
-- histórico sempre coerentes — não existe caminho que grave um sem o outro.
--
-- A chave continua se chamando 'enrichment_credits' por compatibilidade com o
-- que já está gravado. O nome é histórico; o significado agora é "saldo de
-- notas".

create or replace function public.debitar_credito_da_importacao()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_valor jsonb;
  v_saldo numeric;
begin
  if coalesce(NEW.total_nfes, 0) <= 0 then
    return NEW;
  end if;

  select value into v_valor
  from public.app_settings
  where client_id = NEW.client_id and key = 'enrichment_credits';

  v_saldo := coalesce((v_valor->>'balance')::numeric, 0);

  -- greatest(0, ...): saldo não fica negativo. Quem importar além do saldo
  -- zera — bloquear a importação no meio seria pior, porque as notas já
  -- foram processadas quando este gatilho roda.
  insert into public.app_settings (client_id, key, value, updated_at)
  values (
    NEW.client_id,
    'enrichment_credits',
    coalesce(v_valor, '{}'::jsonb) || jsonb_build_object('balance', greatest(0, v_saldo - NEW.total_nfes)),
    now()
  )
  on conflict (client_id, key) do update
    set value = excluded.value, updated_at = now();

  return NEW;
end;
$$;

drop trigger if exists trg_debitar_credito_importacao on public.nfe_imports;
create trigger trg_debitar_credito_importacao
  after insert on public.nfe_imports
  for each row execute function public.debitar_credito_da_importacao();

-- Se o fluxo um dia passar a gravar a linha em dois tempos (uma ao começar,
-- outra ao concluir), este gatilho debitaria duas vezes. Hoje ele grava uma
-- vez só, ao terminar. Mudando isso lá, mude a condição aqui junto.
