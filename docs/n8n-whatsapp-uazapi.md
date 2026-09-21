# Fluxo n8n — instâncias de WhatsApp (uazapi)

O CRM ganhou a tela **WhatsApp**, onde o cliente conecta o próprio número por
QR Code. Ela não fala com a uazapi: fala com **um** webhook n8n, que é quem tem
os tokens. Este documento é o contrato desse webhook.

Antes: rode `supabase/wa-instances-schema.sql`.

## Por que tudo passa por aqui

A uazapi usa dois segredos. O **admintoken** cria e apaga instâncias — é a
chave da conta inteira, vale para todos os seus clientes. O **token de
instância** controla o WhatsApp de um cliente específico. O build do CRM é
estático e público; qualquer um dos dois embutido nele estaria a um DevTools de
distância. Por isso o frontend só lê `status` no Supabase e pede ações ao n8n.

## Credenciais no n8n

- **Base URL:** `https://arkyniatech.uazapi.com`
- **admintoken:** cadastre como credencial (Header Auth, header `admintoken`).
  Não deixe o valor escrito dentro de nós — se vazar, troque no painel da
  uazapi, porque ela dá acesso a tudo.
- Credencial Supabase `crm-levy` (a mesma dos outros fluxos) para gravar em
  `wa_instances` e `wa_instance_tokens`.

## Webhook

`POST /webhook/unificca-wa-instance`, header `Authorization: Bearer <JWT>`.
Configure a URL no `.env` e no secret do GitHub como
`VITE_N8N_WA_INSTANCE_URL`.

Corpos que o CRM envia:

```jsonc
{ "action": "create",     "client_id": "<uuid>", "label": "Vendas" }
{ "action": "connect",    "client_id": "<uuid>", "instance_id": "<uuid>" }
{ "action": "status",     "client_id": "<uuid>", "instance_id": "<uuid>" }
{ "action": "disconnect", "client_id": "<uuid>", "instance_id": "<uuid>" }
{ "action": "delete",     "client_id": "<uuid>", "instance_id": "<uuid>" }
```

Resposta esperada em todas:

```jsonc
{ "ok": true, "status": "connecting", "qrcode": "<base64 ou data URI>", "paircode": null }
{ "ok": false, "error": "mensagem que a tela mostra ao usuário" }
```

## Validação — o mesmo de sempre, antes de qualquer ação

1. Extrair o `sub` do JWT (é o `user_id`).
2. `select public.crm_role_of('<user_id>', '<client_id>')`.
3. `null` → 401. `collaborator` → 403: só **admin** e **master** mexem em
   instância. O colaborador enxerga o status pela tela, e isso vem do RLS, não
   daqui.
4. Para as ações com `instance_id`, confirme que a instância é **daquele**
   cliente antes de agir:

```sql
select instance_name from public.wa_instances
where id = $instance_id and client_id = $client_id;
```

Sem essa conferência, um admin manda o `instance_id` de outro cliente e
desconecta o WhatsApp dele.

## Ação a ação

### `create`

1. Checar a cota: `select * from public.crm_wa_instance_quota('<client_id>')`.
   Se `pode_criar` for falso, responder
   `{ ok:false, error:"Limite de instâncias atingido." }`.
2. Montar um `instance_name` único na conta uazapi — sugestão:
   `unificca-<8 primeiros do client_id>-<timestamp>`.
3. `POST {base}/instance/create` com header `admintoken` e body
   `{ "name": "<instance_name>" }`. A resposta traz o **token da instância**.
4. Gravar em duas tabelas:

```sql
-- 1) a instância (o CRM lê esta)
insert into public.wa_instances (client_id, instance_name, label, status, created_by)
values ($client_id, $instance_name, $label, 'disconnected', $user_id)
returning id;

-- 2) o token (o CRM NUNCA lê esta)
insert into public.wa_instance_tokens (instance_id, token)
values ($id_acima, $token_da_uazapi);
```

5. Responder `{ ok: true, instance_id: "<id>", status: "disconnected" }`.

### `connect`

1. Ler o token: `select token from public.wa_instance_tokens where instance_id = $instance_id`.
2. `POST {base}/instance/connect` com header `token`, body `{}` (sem `phone`,
   que é o que faz a uazapi devolver QR em vez de código de pareamento).
3. Atualizar `wa_instances`: `status = 'connecting'`, `last_status_at = now()`.
4. Responder com o QR que a uazapi devolveu, em `qrcode`.

**Sobre o campo do QR:** a documentação pública não fixa o nome. Rode a chamada
uma vez no n8n e olhe a resposta — costuma vir em `instance.qrcode` ou
`qrcode`. Ajuste o mapeamento e pronto. A tela aceita base64 puro ou data URI.

O CRM repete o `connect` a cada 30 segundos enquanto o status for `connecting`,
porque o QR expira. Cada chamada deve devolver um código novo.

### `status`

1. `GET {base}/instance/status` com header `token`.
2. Gravar o que voltou:

```sql
update public.wa_instances
set status = $status, phone = $numero, profile_name = $nome,
    last_status_at = now(), updated_at = now()
where id = $instance_id;
```

Os valores possíveis são `disconnected`, `connecting`, `connected`,
`hibernated`, `registering` e `registration_conflict` — a tela trata os seis.
Se a uazapi devolver algo fora dessa lista, a constraint da tabela recusa; nesse
caso grave `disconnected` e ponha o texto original em `last_error`.

### `disconnect`

1. `POST {base}/instance/disconnect` com header `token`, body `{}`.
2. `update public.wa_instances set status = 'disconnected', phone = null, updated_at = now() where id = $instance_id;`

### `delete`

1. `DELETE {base}/instance/delete` com header **admintoken**.
2. `delete from public.wa_instances where id = $instance_id;` — o token cai
   junto, por causa do `on delete cascade`.

Admin pode apagar instância do próprio cliente. Foi decisão consciente: é o
WhatsApp dele.

## Mantendo o status fresco sem ninguém olhando

A tela só pergunta o status enquanto está aberta. Se o número cair de
madrugada, o CRM continua mostrando "Conectado" até alguém abrir a tela.

Duas formas de resolver, quando valer a pena:

- **Webhook da uazapi** avisando mudança de estado — o melhor caminho, se a sua
  instalação oferecer. Aponte para um webhook n8n que só faz o `update` da
  tabela.
- **Schedule no n8n**, de 15 em 15 minutos, varrendo `wa_instances` e chamando
  `/instance/status` de cada uma.

## Testar

1. Crie uma instância pela tela e confirme que nasceu linha em `wa_instances`
   **e** em `wa_instance_tokens`.
2. Clique em Conectar, leia o QR com um celular de teste, e veja o cartão virar
   **Conectado** com o número aparecendo (a tela pergunta sozinha de 3 em 3
   segundos enquanto conecta).
3. Desconecte e confirme o status voltando.
4. Com um login de **colaborador**, confirme que a tela WhatsApp nem aparece no
   menu, e que chamar o webhook direto com o token dele devolve 403.
5. Com um login de **admin de outro cliente**, chame o webhook passando o
   `instance_id` deste cliente. Tem que dar erro — é o teste da conferência de
   propriedade.
