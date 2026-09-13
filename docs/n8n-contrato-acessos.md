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
