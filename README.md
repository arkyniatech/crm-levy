# Unificca — CRM de Marketplaces

CRM operacional que lê o banco Supabase existente (alimentado pelos fluxos n8n
de Shopee e de XMLs de nota fiscal) e mostra clientes, vendas e o status das
integrações.

Stack: React + Vite + TypeScript, Tailwind CSS, `@supabase/supabase-js`,
React Router, TanStack Query, Recharts, lucide-react. Sem backend próprio —
todo dado vem do Supabase via chave `anon` protegida por RLS.

## Rodar local

```bash
npm install
cp .env.example .env   # e preencha os dois valores
npm run dev
```

`.env`:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=chave-anon-publica
VITE_N8N_NFE_WEBHOOK_URL=https://SEU-N8N/webhook/unificca-upload-nfe
```

A URL do webhook aponta para o fluxo n8n "NFe - Upload ZIP em Lote (Levy)"
(`CinsZR7QrWLgirYK`), que recebe ZIP ou XML pela tela **Importar NF-e** do CRM.
O webhook exige o token de login do Supabase — chamadas sem usuário logado
recebem 401.

Use **somente a chave `anon`** — nunca a `service_role`. O usuário de login é
criado manualmente no painel do Supabase (Authentication → Users).

## Build

```bash
npm run build   # gera dist/ (estático)
```

## Deploy

### Vercel
Importe o repositório; o `vercel.json` já contém o rewrite de SPA. Configure
as duas variáveis `VITE_*` em Settings → Environment Variables.

### Netlify
Importe o repositório; o `netlify.toml` já define build, publish e redirect de
SPA. Configure as variáveis `VITE_*` em Site settings → Environment variables.

### Hostinger (hospedagem estática)
1. Rode `npm run build` local (com o `.env` preenchido — as variáveis são
   embutidas no build).
2. Suba o conteúdo de `dist/` para `public_html/`. O `.htaccess` com o
   fallback de SPA já vai junto no build.
3. Para servir de uma **subpasta** (ex.: `public_html/crm/`), builde com
   `BASE_PATH=/crm/ npm run build` e ajuste o `.htaccess` da subpasta
   (`RewriteBase /crm/` e destino `/crm/index.html`).

## Segurança

- O frontend consulta apenas: `clients`, `stores`, `customers`, `orders`,
  `order_items`. A tabela **`store_tokens` nunca é consultada** — o status de
  conexão vem de `stores.status`.
- **RLS precisa estar ativo** nessas tabelas, escopado por usuário/`client_id`.
  Este projeto não consegue verificar isso sozinho (não tem acesso admin ao
  Supabase). Antes de publicar, confirme no painel: Database → Tables → RLS
  habilitado + políticas de SELECT para o usuário autenticado. Sem RLS, a
  chave `anon` dá acesso irrestrito aos dados.
- CPF é exibido sempre mascarado (`123.***.***-00`); CPF ausente ou mascarado
  pelo marketplace (`******`) aparece como "—".
