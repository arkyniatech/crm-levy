# Resumo da importação de NF-e na tela

A tela **Importar NF-e** agora mostra, depois que o processamento termina:

```
Notas lidas: 184   Novas: 0   Já estavam: 475   Sem CPF: 12
Notas emitidas entre 01/07/2026 e 06/07/2026.
```

Ela lê isso da tabela `nfe_imports` (rode `supabase/nfe-imports-schema.sql`).
Enquanto o fluxo n8n não gravar nessa tabela, a tela fica no "processando em
segundo plano" de sempre — degrada sem quebrar, mas também sem informar nada.

## Como saber se uma nota é nova ou já existia

O `Upsert cliente` e o `Upsert pedido` usam `Prefer: return=representation`, ou
seja, devolvem a linha gravada — inclusive o `created_at`. E o `created_at` **não
muda** num upsert que atualiza. Então:

> linha com `created_at` depois do início desta execução = criada agora;
> `created_at` anterior = já existia e foi só regravada.

É assim que se separa "nova" de "já estava", sem precisar consultar nada antes.

## Passo 1 — carimbar o início da execução

No nó **`Preparar persistencia`**, no `return` de cada item, acrescente o campo
`_run` junto dos outros:

```js
return { json: Object.assign({}, j, {
  _run: $now.toISO(),        // <<< acrescentar esta linha
  cpf_limpo: cpf.length === 11 ? cpf : '',
  // ... resto igual
}) };
```

## Passo 2 — contar no `Montar resumo`

No nó **`Montar resumo`**, troque o bloco dos `try/catch` de contagem por este:

```js
// Início da execução, com 1 minuto de folga para diferença de relógio entre
// o n8n e o Postgres — sem a folga, linha nova pode ser contada como antiga.
const run = new Date($('Preparar persistencia').first().json._run).getTime() - 60000;

function contar(no) {
  let novos = 0, antigos = 0;
  try {
    $(no).all().forEach(function (i) {
      const d = i.json;
      if (!d || !d.id || !d.created_at) return;      // item de erro: ignora
      if (new Date(d.created_at).getTime() >= run) novos++; else antigos++;
    });
  } catch (e) {}
  return { novos: novos, antigos: antigos };
}

const pedidos  = contar('Upsert pedido');
const clientes = contar('Upsert cliente');

// Notas sem CPF não geram cliente nem pedido — o fluxo as descarta no "CPF valido?"
let semCpf = 0;
try {
  semCpf = $('Preparar persistencia').all().filter(function (i) {
    return !i.json.cpf_limpo;
  }).length;
} catch (e) {}

// Período de emissão do lote
const datas = notas.map(function (n) { return n.data_emissao; })
  .filter(Boolean).sort();
```

E no objeto retornado, acrescente:

```js
novos_pedidos:       pedidos.novos,
pedidos_atualizados: pedidos.antigos,
novos_clientes:      clientes.novos,
sem_cpf:             semCpf,
nota_de:             datas[0] || null,
nota_ate:            datas[datas.length - 1] || null,
```

## Passo 3 — gravar em `nfe_imports`

Acrescente um nó **HTTP Request** chamado `Registrar importação`, ligado
depois do `Montar resumo` (pode ser em paralelo com o `Veio do CRM?`).

- **Method:** POST
- **URL:** `https://lopdvdblwasuowjdokpo.supabase.co/rest/v1/nfe_imports`
- **Authentication:** credencial `crm-levy` (a mesma dos outros nós)
- **Header:** `Prefer: return=minimal`
- **Body (JSON):**

```js
={{ JSON.stringify({
  client_id: ($('Webhook Upload CRM').first().json.body || {}).client_id
             || '677c58eb-b3ec-493a-ad14-0d052d7d8a45',
  user_id:   ($('Validar token do CRM').first().json || {}).id || null,
  status:    'concluido',
  total_nfes:          $json.total_nfes,
  novos_pedidos:       $json.novos_pedidos,
  pedidos_atualizados: $json.pedidos_atualizados,
  novos_clientes:      $json.novos_clientes,
  sem_cpf:             $json.sem_cpf,
  nota_de:             $json.nota_de,
  nota_ate:            $json.nota_ate,
  finished_at:         $now.toISO()
}) }}
```

Repare no `client_id`: ele usa o que o CRM mandou e só cai no valor fixo se não
vier nada. É o mesmo ajuste que o resto do fluxo precisa — ver
`n8n-contrato-acessos.md`.

Marque **`onError: continueRegularOutput`** neste nó também: se o registro do
resumo falhar, a importação em si não pode ser afetada.

## Como testar

Suba de novo o mesmo lote de julho. O esperado é a tela mostrar `Novas: 0` e
`Já estavam: 475`, com o aviso de que nada novo entrou. Depois suba um lote que
você sabe que é inédito e confirme que os números invertem.

Se a tela ficar parada em "gravando…" por 3 minutos, ela desiste e volta à
mensagem antiga — sinal de que o `Registrar importação` não gravou. Nesse caso
olhe o output desse nó na execução.
