-- Resumo das importações de NF-e — CRM Unificca
-- Rodar no Supabase: SQL Editor → New query → colar → Run. Idempotente.
--
-- POR QUE ESTA TABELA EXISTE
-- O webhook de upload responde ao CRM assim que termina de LER os XMLs
-- ("processando em segundo plano"), antes de gravar qualquer coisa — senão um
-- ZIP grande estoura o tempo da requisição. Resultado: a tela dizia "184 notas
-- recebidas" e nunca contava quantas eram novas e quantas já estavam lá.
--
-- Aqui o fluxo n8n registra o que de fato aconteceu, e a tela busca esse
-- resumo depois. Escrita só pela service_role (n8n); o frontend só lê.

create table if not exists public.nfe_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  -- quem mandou o arquivo (auth.users.id extraído do JWT pelo fluxo)
  user_id uuid references auth.users (id) on delete set null,
  file_name text,
  status text not null default 'processando',  -- processando | concluido | erro
  erro text,

  total_nfes          integer not null default 0,  -- notas lidas do arquivo
  novos_pedidos       integer not null default 0,  -- viraram pedido novo
  pedidos_atualizados integer not null default 0,  -- já existiam, foram regravados
  novos_clientes      integer not null default 0,
  sem_cpf             integer not null default 0,  -- não geram cliente nem pedido

  -- período de emissão das notas do lote (dhEmi do XML)
  nota_de  timestamptz,
  nota_ate timestamptz,

  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_nfe_imports_client
  on public.nfe_imports (client_id, created_at desc);

alter table public.nfe_imports enable row level security;

-- Leitura: qualquer papel da loja. O colaborador importa, então precisa ver o
-- resultado do que ele mesmo mandou. São só contagens e datas — nenhum dado de
-- cliente, então isso não abre nada que ele não devesse ver.
drop policy if exists "crm select nfe_imports" on public.nfe_imports;
create policy "crm select nfe_imports"
  on public.nfe_imports for select to authenticated
  using (client_id in (select public.crm_client_ids()));

-- Sem policy de insert/update: só a service_role do n8n grava.
