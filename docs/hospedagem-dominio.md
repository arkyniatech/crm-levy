# Landing na raiz, app no subdomínio

Hoje `contatta.pro` serve o app. O alvo é:

| Endereço | O que serve | Vem da branch |
|---|---|---|
| `contatta.pro` | a landing (`landing/`) | `hostinger-lp` |
| `app.contatta.pro` | o CRM (`dist/`) | `hostinger` |

O repositório já está pronto: dois workflows, um por destino. O que falta é
apontar cada pasta da Hostinger para a branch certa.

## Por que subdomínio e não `contatta.pro/app`

Numa subpasta o app teria que ser buildado com `BASE_PATH=/app/`, e o
`.htaccess` precisaria de dois `RewriteBase` no mesmo domínio — um para a
landing, outro para o fallback de SPA. Com subdomínio cada um tem a própria
raiz, o build continua igual e o `.htaccess` atual funciona sem tocar em nada.

Também separa o que interessa ao Google: a landing indexa, o app tem
`<meta name="robots" content="noindex">` e continua fora do índice.

## Passo a passo no hPanel

**1. Criar o subdomínio.** Domínios → Subdomínios → criar `app`. Anote a pasta
que a Hostinger criar (costuma ser `domains/app.contatta.pro/public_html` ou
`public_html/app`).

**2. Repontar o Git do app.** Em Avançado → Git, a entrada que hoje aponta para
`public_html` na branch `hostinger` deve passar a apontar para **a pasta do
subdomínio**, mantendo a branch `hostinger`. Se a Hostinger não deixar editar o
destino, apague a entrada e crie de novo.

**3. Criar o Git da landing.** Nova entrada: mesmo repositório, branch
**`hostinger-lp`**, diretório **`public_html`**.

**4. Limpar o que sobrou na raiz.** O `public_html` ainda tem os arquivos do app
(`assets/`, `index.html`, `.htaccess`). Apague antes do primeiro deploy da
landing, senão sobra `assets/` órfão servindo JS antigo.

**5. Forçar o primeiro deploy.** No GitHub, Actions → "Landing para Hostinger" →
Run workflow. Isso cria a branch `hostinger-lp`. Depois puxe nas duas entradas
do Git no hPanel.

## Depois de trocar: ajustar o Supabase

O Supabase valida para onde pode redirecionar depois do login e da recuperação
de senha. Com o app mudando de endereço, em **Authentication → URL
Configuration**:

- **Site URL:** `https://app.contatta.pro`
- **Redirect URLs:** acrescente `https://app.contatta.pro/**`

Sem isso, link de recuperação de senha volta para o domínio antigo — e o
domínio antigo agora é a landing, que não tem tela de login.

## Conferir que deu certo

1. `contatta.pro` abre a landing, e o botão **Entrar** leva para o app.
2. `app.contatta.pro` abre a tela de login do CRM.
3. `app.contatta.pro/clientes` (rota interna, com você logado) carrega direto,
   sem 404 — é o teste do `.htaccess` de SPA no subdomínio.
4. Recuperação de senha chega com link para `app.contatta.pro`.

## Sobre os dois workflows

`deploy-hostinger.yml` ignora mudanças em `landing/`, `docs/`, `n8n/`,
`supabase/` e arquivos `.md` — mexer em documentação ou SQL deixou de disparar
build do app. E `deploy-landing.yml` só roda quando `landing/` muda. Os dois
podem rodar no mesmo push sem se atrapalhar: escrevem em branches diferentes.
