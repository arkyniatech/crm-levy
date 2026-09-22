# O que os fluxos n8n precisam mudar (perfis de acesso)

O CRM passou a ter papel **por loja** (`clients`): `master` (global, Mohamad e
Levy), `admin` (da loja) e `collaborator` (da loja). O RLS do Supabase já
respeita isso para tudo que o frontend **lê**.

O que o RLS **não** cobre: tudo que passa pelo n8n. Os quatro webhooks rodam com
`service_role`, que ignora RLS por definição. Hoje eles não recebem nem checam
loja nenhuma — então, enquanto não mudarem, um colaborador consegue chamar o
webhook direto (o token dele é válido) e agir fora do que a tela permite.

## Regra geral, válida para os quatro fluxos

1. **Extrair o `sub` do JWT** que vem no header `Authorization: Bearer <token>`,
   validando a assinatura com o JWT secret do projeto. O `sub` é o `user_id`.
2. **Descobrir o papel** com a função criada em `supabase/access-roles.sql`:

   ```
   select public.crm_role_of('<user_id do JWT>', '<client_id do payload>')
   ```

   Retorna `master`, `admin`, `collaborator` ou `null`.
3. **`null` → 401.** Papel insuficiente para a ação → 403.
4. **Nunca confiar no `client_id` do payload sem esse passo.** Ele diz qual loja
   o usuário *quer* operar; a função diz se ele *pode*. Sem a checagem, qualquer
   usuário logado manda o `client_id` de outra loja e o fluxo obedece.
5. **Derivar o `client_id` quando ele não vier:** se o usuário tem uma única
   linha em `user_clients`, use essa. Se tem várias (ou é master), recuse com uma
   mensagem clara em vez de chutar a primeira.

## Fluxo a fluxo

### 1. `unificca-admin-users` — o que mais muda

Payload novo (já enviado pelo CRM, `src/hooks/adminUsers.ts`):

```jsonc
{ "action": "list",   "client_id": "<uuid>" }
{ "action": "create", "client_id": "<uuid>", "email": "...", "password": "...",
  "role": "admin" | "collaborator" }
{ "action": "revoke", "client_id": "<uuid>", "user_id": "<uuid>" }
```

Mudanças:

- **`role` trocou de valores.** Era `admin` | `member`; agora é
  `admin` | `collaborator`. Rejeite qualquer outro valor — em especial
  `master`, que não se concede por tela (é `insert` na mão em `crm_masters`).
- **Quem pode chamar:** `master` em qualquer loja; `admin` só na própria. O
  colaborador nunca.
- **`create` agora tem duas etapas:** criar o usuário no Auth (como já fazia) e
  **gravar o mapeamento** com o papel:

  ```sql
  insert into public.user_clients (user_id, client_id, role)
  values ($novo_user_id, $client_id, $role)
  on conflict (user_id, client_id) do update set role = excluded.role;
  ```

  Sem esse insert o usuário loga e não vê loja nenhuma. Se o fluxo antigo
  escrevia em `crm_user_roles`, pode parar — essa tabela sai de cena.
- **`list` deve listar por loja**, juntando o papel:

  ```sql
  select u.id, u.email, uc.role, uc.created_at
  from public.user_clients uc
  join auth.users u on u.id = uc.user_id
  where uc.client_id = $client_id
  order by u.email;
  ```

  Masters não aparecem nessa lista (não estão em `user_clients`) — é o esperado:
  a tela mostra os acessos *daquela loja*.
- **`revoke` apaga só o mapeamento daquela loja**, nunca o usuário do Auth:

  ```sql
  delete from public.user_clients where user_id = $user_id and client_id = $client_id;
  ```

### 2. `unificca-upload-nfe`

- Agora recebe o campo `client_id` no `FormData`, junto de `data` e
  `deduct_stock`.
- Permitido para `master`, `admin` e `collaborator` — importar NF-e é o trabalho
  do colaborador.
- **A resposta devolve `notas[]` com `buyer_name` e `buyer_cpf`.** Para
  `collaborator`, mande esses dois campos vazios: a tela já esconde as colunas,
  mas enquanto o fluxo mandar os dados eles seguem trafegando e aparecem no
  DevTools. Os números (total de notas, com/sem CPF, valor) podem ir para todos.

### 3. `unificca-wa-campaign`

- Agora recebe `client_id` em todas as ações (`preview`, `create`, `start`).
- Permitido para os três papéis, com duas restrições para `collaborator`:
  - **Recusar `audience.type = "manual"`** (traz `customer_ids`, ou seja, escolha
    dentro da base). A tela já não oferece a opção; o fluxo precisa recusar
    quem chamar na mão.
  - **Não devolver `sample`** na resposta do `preview` — é uma amostra com nome
    e telefone. A contagem (`total`, `skipped_optout`) pode ir.
- `audience.type = "test"` continua liberado: são números que a própria pessoa
  digitou, não vêm da base.

### 4. `unificca-enrich-clientes`

- Agora recebe `client_id` no corpo, junto de `limit`.
- **Só `master` e `admin`.** Colaborador → 403. O enriquecimento lê e grava na
  base de clientes e ainda gasta crédito.

## Como testar que ficou de pé

Criando um colaborador de teste e, com o token dele, chamando cada webhook na
mão (curl/Postman) com o `client_id` de **outra** loja. As quatro chamadas têm
que voltar 403. Se alguma passar, o fluxo ainda está confiando no payload.

---

# Anexo — tirar o `client_id` fixo do fluxo de NF-e

Urgente a partir do momento em que existe mais de um cliente com acesso (a
conta de demonstração, por exemplo): hoje **qualquer pessoa logada que importe
uma nota grava na base do Levy**, porque três nós têm o mesmo uuid escrito na
mão.

O CRM já manda `client_id` no formulário do upload. Falta o fluxo usar.

A expressão abaixo lê o que veio e só cai no valor fixo se não vier nada. O
`try/catch` existe porque, quando o fluxo é disparado pelo **formulário do
próprio n8n**, o nó `Webhook Upload CRM` não executou e `$('...')` lança erro —
sem o catch, a importação pelo formulário pararia de gravar.

## Nó `Upsert cliente`

Substitua o corpo inteiro por:

```js
={{ (function(){
  let cid = null;
  try { cid = ($('Webhook Upload CRM').first().json.body || {}).client_id || null; } catch (e) {}
  const b = {
    client_id: cid || '677c58eb-b3ec-493a-ad14-0d052d7d8a45',
    cpf: $json.cpf_limpo,
    updated_at: $now.toISO()
  };
  if ($json.buyer_name)  b.name  = $json.buyer_name;
  if ($json._city)       b.city  = $json._city;
  if ($json._uf)         b.state = $json._uf;
  if ($json.buyer_email) b.email = $json.buyer_email;
  if ($json.buyer_phone) b.phone = $json.buyer_phone;
  return JSON.stringify(b);
})() }}
```

## Nó `Upsert loja`

```js
={{ (function(){
  let cid = null;
  try { cid = ($('Webhook Upload CRM').first().json.body || {}).client_id || null; } catch (e) {}
  const p = $('Preparar persistencia').item.json;
  return JSON.stringify({
    client_id: cid || '677c58eb-b3ec-493a-ad14-0d052d7d8a45',
    marketplace: p.mp,
    name: p.shop_name,
    external_shop_id: p.shop_id,
    updated_at: $now.toISO()
  });
})() }}
```

## Nó `Baixar estoque`

Já está no anexo de `n8n-resumo-importacao.md`, junto da troca do `p_ref`.

## Como testar que funcionou

Entre com o login de demonstração, importe **uma** nota e confira em qual
cliente ela caiu:

```sql
select c.name, count(*) as pedidos
from public.orders o
join public.stores s on s.id = o.store_id
join public.clients c on c.id = s.client_id
where o.created_at > now() - interval '10 minutes'
group by c.name;
```

Tem que aparecer **Loja Demonstração**. Se aparecer o cliente do Levy, algum
dos três nós ficou com o uuid fixo.

## Um detalhe que ainda morde depois

O `Upsert loja` usa `on_conflict=marketplace,external_shop_id`, sem o
`client_id`. Como a nota gera `external_shop_id` a partir do CNPJ do emitente
(`emit:<cnpj>`), dois clientes diferentes não costumam colidir — mas a base do
Levy já tem uma loja `Shopee · emit:` com o CNPJ vazio. Se a nota de outro
cliente também vier sem CNPJ do emitente, as duas disputam a mesma linha e a
loja troca de dono a cada importação.

O conserto é trocar a unique de `stores` para `(client_id, marketplace,
external_shop_id)` e ajustar o `on_conflict`. Não é urgente enquanto os
emitentes tiverem CNPJ, mas é dívida registrada.

---

# Anexo — quem o enriquecimento pode processar

O fluxo `unificca-enrich-clientes` escolhia sozinho quais clientes enriquecer.
A regra passou a viver no banco, numa função só, para não haver duas definições
divergentes de "pendente".

**Regra:** enriquece apenas CPF que nunca passou por enriquecimento
(`extra->>enriched_at` nulo) **ou** que já passou mas está sem telefone. Quem
já foi enriquecido e tem telefone não volta para a fila — seria pagar de novo
por um dado que já está lá.

No lugar do filtro próprio, o fluxo chama:

```
POST /rest/v1/rpc/crm_enrich_pendentes
{ "p_client_id": "<uuid>", "p_limit": <quantos> }
```

Devolve `[{ id, cpf, nome }]`, já na ordem certa (mais recentes primeiro) e
limitado. A função é `security definer` e só a `service_role` executa.

Depois de enriquecer, o fluxo continua gravando `extra.enriched_at` no cliente
— é esse campo que tira a pessoa da fila e alimenta a aba "Enriquecidos".

A tela mostra o tamanho da fila com `crm_enrich_pendentes_total`, que aplica a
mesma regra. Se você mudar a regra, mude nas duas funções juntas: elas estão no
mesmo arquivo, `supabase/enriquecimento-elegiveis.sql`.
