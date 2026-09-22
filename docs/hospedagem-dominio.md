# Landing na raiz, app no subdomínio

Hoje `contatta.pro` serve o app. O alvo é:

| Endereço | O que serve | Pasta |
|---|---|---|
| `contatta.pro` | a landing (`landing/`) | `public_html/` |
| `app.contatta.pro` | o CRM (`dist/`) | `public_html/app/` |

**Uma implantação só.** O plano da Hostinger permite um único deploy de Git por
site, então o workflow monta as duas coisas numa árvore só e publica na branch
`hostinger`:

```
public_html/          ← index.html, favicon.svg, .htaccess da landing
public_html/app/      ← o build do CRM
```

Por isso o **diretório raiz da implantação tem que ficar EM BRANCO**. Se ficar
`app`, a landing é publicada dentro da pasta do app e o domínio raiz não recebe
nada.

## Por que subdomínio e não `contatta.pro/app`

Numa subpasta o app teria que ser buildado com `BASE_PATH=/app/`, e o
`.htaccess` precisaria de dois `RewriteBase` no mesmo domínio — um para a
landing, outro para o fallback de SPA. Com subdomínio cada um tem a própria
raiz, o build continua igual e o `.htaccess` atual funciona sem tocar em nada.

Também separa o que interessa ao Google: a landing indexa, o app tem
`<meta name="robots" content="noindex">` e continua fora do índice.

## Passo a passo no hPanel

**1. Criar o subdomínio** `app.contatta.pro` apontando para `public_html/app`.

**2. Deixar o diretório da implantação em branco.** Avançado → Git → Alterar
diretório root → apagar o `app` do campo e salvar. O campo em branco significa
`public_html`.

**3. Limpar a raiz.** Apague do `public_html` o que sobrou de deploys antigos —
`index.html`, `assets/`, `.htaccess`, `favicon.svg`. A pasta `app` pode ficar;
o deploy novo a sobrescreve.

**4. Reimplantar.** O botão na tela do Git. Ele traz a árvore inteira de uma vez.

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

## Sobre o workflow

`deploy-hostinger.yml` builda o app, copia `landing/` para a raiz da árvore e
`dist/` para `app/`, e publica tudo na branch `hostinger`. Ignora mudanças em
`docs/`, `n8n/`, `supabase/` e arquivos `.md` — mexer em documentação ou SQL não
tem por que republicar o site.

A landing leva um `.htaccess` com uma regra só: quem digitar `contatta.pro/app`
é redirecionado para `app.contatta.pro`. Sem ela, esse caminho serviria a pasta
do app com os caminhos de asset errados — o `index.html` pede `/assets/...`, que
na raiz é a landing, e a tela ficaria em branco. A regra não afeta o subdomínio:
o Apache só lê `.htaccess` do docroot para baixo, e o docroot dele é
`public_html/app`.
