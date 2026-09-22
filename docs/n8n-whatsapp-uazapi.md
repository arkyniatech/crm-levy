# Fluxo n8n — instâncias de WhatsApp (uazapi)

O CRM ganhou a tela **WhatsApp**, onde o cliente conecta o próprio número por
QR Code. Ela não fala com a uazapi: fala com **um** webhook n8n, que é quem tem
os tokens. Este documento é o contrato desse webhook.

Antes: rode `supabase/wa-instances-schema.sql`.

## Atalho: importar o fluxo pronto

O fluxo inteiro está em **`n8n/unificca-wa-instance.json`** — 32 nós, as cinco
ações, validação de papel e checagem de posse já ligados. Em vez de montar à
mão:

1. No n8n, menu **Workflows → Import from File** (ou copie o conteúdo do
   arquivo e cole no canvas com Ctrl+V).
2. Os dois nós que usam o `admintoken` — **`uazapi criar`** e
   **`uazapi deletar`** — já vêm apontando para a credencial `arkynia-uazapi`.
   Confirme que ficaram preenchidos; se o id for outro na sua instância,
   selecione na mão.
3. Confira que os nós do Supabase pegaram a credencial `crm-levy`. Se o id for
   diferente na sua instância, selecione na mão.
4. Salve e **ative** o fluxo.
5. Copie a URL de produção do webhook e ponha em `VITE_N8N_WA_INSTANCE_URL`
   (no `.env` local e no secret do GitHub).

O resto deste documento explica o que cada parte faz — leia se precisar
ajustar, principalmente a seção do QR Code.

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

## A regra que vale para todas as funções deste projeto

Função consumida pelo **n8n** recebe o `user_id` como parâmetro. Função
consumida pela **tela** usa `auth.uid()`. Nunca a mesma para os dois — o n8n
roda com `service_role`, onde `auth.uid()` é nulo, e a função devolve vazio sem
erro nenhum.

É por isso que existem os pares `crm_role_in` / `crm_role_of` e
`crm_wa_instance_quota` / `crm_wa_quota_of`. Os dois pares nasceram de fluxos
quebrados em produção.

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

1. Checar a cota com **`crm_wa_quota_of(<user_id>, <client_id>)`** — a versão
   que recebe o usuário. A outra, `crm_wa_instance_quota`, usa `auth.uid()` e
   serve à tela: chamada pelo n8n, que roda como `service_role`, ela devolve
   zero linhas e mata o fluxo no meio.

   Se `pode_criar` for falso, responder `{ ok:false, error:"Limite de
   instâncias atingido." }`.
2. Montar o `instance_name` a partir do rótulo que a pessoa digitou no CRM,
   em slug, com os 8 primeiros caracteres do `client_id` como sufixo — por
   exemplo, "Vendas São Paulo" na loja `677c58eb…` vira
   `vendas-sao-paulo-677c58eb`. O rótulo é o que se lê no painel da uazapi; o
   sufixo existe porque lá o nome é único na conta inteira, e duas lojas
   poderiam querer "vendas". A tela mostra o nome resultante antes de criar e
   recusa rótulo repetido na mesma loja.
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

**Cuidado com o campo `status`: a resposta tem dois.** O formato real é:

```jsonc
{
  "instance": { "status": "disconnected", "owner": "5521...", "profileName": "...", ... },
  "status":   { "connected": false, "loggedIn": false, "jid": null }
}
```

O estado que interessa é **`instance.status`**, uma string. O `status` de
primeiro nível é um objeto de flags — ler ele e passar por `String()` grava
`[object Object]` no banco, que foi exatamente o que aconteceu.

Os valores possíveis são `disconnected`, `connecting`, `connected`,
`hibernated`, `registering` e `registration_conflict` — a tela trata os seis.
Fora dessa lista, a constraint da tabela recusa: grave `disconnected` e ponha o
texto original em `last_error`. E **limpe `last_error` em toda leitura boa**,
senão um aviso antigo fica pendurado no cartão para sempre.

O telefone vem em `instance.owner`, não em `phone`.

### `disconnect`

1. `POST {base}/instance/disconnect` com header `token`, body `{}`.
2. `update public.wa_instances set status = 'disconnected', phone = null, updated_at = now() where id = $instance_id;`

### `delete`

São três passos, nesta ordem:

1. **Desconectar primeiro** — `POST {base}/instance/disconnect` com o token da
   instância. A uazapi espera a sessão encerrada antes de apagar; se já estiver
   desconectada, o passo não faz mal.
2. `DELETE {base}/instance/delete` com header **admintoken**.
3. **Só então** apagar do banco. O fluxo confere se a uazapi confirmou antes de
   remover a linha — sem essa conferência, uma falha lá (credencial faltando,
   por exemplo) apagava do CRM e deixava a instância viva na uazapi, e os dois
   lados ficavam divergentes sem ninguém perceber.

Se a uazapi recusar, a resposta traz o erro e a instância **continua** no CRM,
de propósito.

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
