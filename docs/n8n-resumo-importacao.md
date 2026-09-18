# Passo a passo no n8n — resumo da importação na tela

São **3 mexidas** no fluxo "NFe - Upload ZIP em Lote (Levy)": colar código em
dois nós que já existem e criar um nó novo. Antes de começar, rode
`supabase/nfe-imports-schema.sql` no Supabase.

Duplique o fluxo antes de mexer (menu `...` → Duplicate), para ter para onde
voltar.

---

## Passo 1 — nó `Preparar persistencia`

Abra o nó, **apague todo o código** e cole este. A única diferença para o atual
são as duas linhas marcadas com `<<<`.

```js
const MP_BY_CNPJ = { '35635824000112': 'shopee', '03361252000134': 'mercado_livre' };
function digits(s){ return String(s == null ? '' : s).split('').filter(function(c){ return c >= '0' && c <= '9'; }).join(''); }
const RUN = $now.toISO();                                     // <<< novo
const items = $input.all();
return items.map(function (it) {
  const j = it.json;
  const cpf = digits(j.buyer_cpf);
  const addr = j.address || {};
  const nfe = j.raw_nfe || {};
  const inter = nfe.infIntermed || {};
  const emit = nfe.emit || {};
  const interCnpj = digits(inter.CNPJ);
  const emitCnpj = digits(emit.CNPJ);
  const handle = String(inter.idCadIntTran || '').trim();
  const mp = MP_BY_CNPJ[interCnpj] || 'shopee';
  const mpLabel = mp === 'shopee' ? 'Shopee' : (mp === 'mercado_livre' ? 'Mercado Livre' : (mp === 'tiktok_shop' ? 'TikTok Shop' : mp));
  const shopId = handle || ('emit:' + emitCnpj);
  const orderRef = String(j.order_ref_provavel || '').trim() || String(j.chave_acesso || '');
  return { json: Object.assign({}, j, {
    _run: RUN,                                                // <<< novo
    cpf_limpo: cpf.length === 11 ? cpf : '',
    order_ref: orderRef,
    _city: addr.cidade || null,
    _uf: addr.uf || null,
    mp: mp,
    shop_id: shopId,
    shop_name: mpLabel + ' · ' + shopId,
    ordered_at: j.data_emissao || null,
    total_amount: Number(j.valor_total_nf || 0),
    ship_address: j.address || null
  }) };
});
```

Isso carimba em cada nota o instante em que a gravação começou. É o que permite,
no passo seguinte, saber o que nasceu agora e o que já existia.

---

## Passo 2 — nó `Montar resumo`

Mesma coisa: abra, **apague tudo** e cole este.

```js
let viaWebhook = false;
try { viaWebhook = $('Webhook Upload CRM').isExecuted === true; } catch (e) {}

const src = $('Extrair dados da NFe').all();
const notas = src.map(function (i) {
  const j = i.json;
  return {
    chave_acesso: j.chave_acesso || '',
    numero_nf: j.numero_nf || '',
    data_emissao: j.data_emissao || '',
    buyer_name: j.buyer_name || '',
    buyer_cpf: j.buyer_cpf || '',
    valor_total_nf: Number(j.valor_total_nf || 0),
    order_ref: j.order_ref_provavel || '',
    itens: (j.itens || []).length
  };
});

// Instante em que a gravação começou, com 1 minuto de folga para diferença de
// relógio entre o n8n e o Postgres.
let run = 0;
try { run = new Date($('Preparar persistencia').first().json._run).getTime() - 60000; } catch (e) {}

// O upsert devolve a linha gravada, e o created_at NÃO muda quando ele apenas
// atualiza. Então: created_at depois do início = linha nova; antes = já existia.
function contar(no) {
  let novos = 0, antigos = 0;
  try {
    $(no).all().forEach(function (i) {
      const d = i.json;
      if (!d || !d.id || !d.created_at) return;   // item que deu erro: ignora
      if (new Date(d.created_at).getTime() >= run) novos++; else antigos++;
    });
  } catch (e) {}
  return { novos: novos, antigos: antigos };
}
const pedidos  = contar('Upsert pedido');
const clientes = contar('Upsert cliente');

// Nota sem CPF não vira cliente nem pedido (é barrada no "CPF valido?")
let semCpf = 0;
try { semCpf = $('Preparar persistencia').all().filter(function (i) { return !i.json.cpf_limpo; }).length; } catch (e) {}

let estoqueBaixado = 0, semProduto = 0;
try { $('Baixar estoque').all().forEach(function (i) { const d = i.json || {}; estoqueBaixado += Number(d.deducted || 0); if (Array.isArray(d.unknown)) semProduto += d.unknown.length; }); } catch (e) {}

const datas = notas.map(function (n) { return n.data_emissao; }).filter(Boolean).sort();

return [{ json: {
  ok: true,
  via_webhook: viaWebhook,
  total_nfes: notas.length,
  com_cpf: notas.length - semCpf,
  sem_cpf: semCpf,
  novos_pedidos: pedidos.novos,
  pedidos_atualizados: pedidos.antigos,
  novos_clientes: clientes.novos,
  nota_de: datas[0] || null,
  nota_ate: datas[datas.length - 1] || null,
  clientes_salvos: clientes.novos + clientes.antigos,
  pedidos_vinculados: pedidos.novos + pedidos.antigos,
  estoque_baixado: estoqueBaixado,
  itens_sem_produto: semProduto,
  valor_total: notas.reduce(function (s, n) { return s + n.valor_total_nf; }, 0),
  notas: notas
} }];
```

---

## Passo 3 — nó novo `Registrar importação`

É ele que grava o resumo na tabela que a tela lê.

1. No canvas, clique no **+** e procure por **HTTP Request**.
2. Renomeie o nó (duplo clique no título) para exatamente:
   `Registrar importação`
3. Preencha:

   | Campo | Valor |
   |---|---|
   | Method | `POST` |
   | URL | `https://lopdvdblwasuowjdokpo.supabase.co/rest/v1/nfe_imports` |
   | Authentication | Predefined Credential Type → **Supabase API** → credencial `crm-levy` |
   | Send Headers | ligado — nome `Prefer`, valor `return=minimal` |
   | Send Body | ligado — Body Content Type **JSON**, modo **Using JSON** |

4. No campo do JSON, cole (é uma expressão — o campo tem que estar em modo
   *Expression*, não *Fixed*):

```js
={{ JSON.stringify({
  client_id: ($('Webhook Upload CRM').first().json.body || {}).client_id || '677c58eb-b3ec-493a-ad14-0d052d7d8a45',
  user_id: ($('Validar token do CRM').first().json || {}).id || null,
  status: 'concluido',
  total_nfes: $json.total_nfes,
  novos_pedidos: $json.novos_pedidos,
  pedidos_atualizados: $json.pedidos_atualizados,
  novos_clientes: $json.novos_clientes,
  sem_cpf: $json.sem_cpf,
  nota_de: $json.nota_de,
  nota_ate: $json.nota_ate,
  finished_at: $now.toISO()
}) }}
```

5. Em **Settings** do nó, marque **On Error → Continue (using regular output)**.
   Se o registro do resumo falhar, a importação não pode ser afetada.
6. **Ligue o nó:** arraste uma conexão da saída do **`Montar resumo`** para a
   entrada do `Registrar importação`. O `Montar resumo` vai ficar com duas
   saídas ligadas — a antiga para o `Veio do CRM?` e esta nova. Isso é o
   esperado.

Salve e ative o fluxo.

---

## Testar

Suba de novo o mesmo lote de julho. A tela deve mostrar:

```
Notas lidas: 184   Novas: 0   Já estavam: 475
⚠ Nada de novo entrou. Todas as notas deste arquivo já estavam no sistema.
```

Depois suba um lote inédito e confirme que os números invertem.

**Se a tela ficar em "gravando…" e depois voltar para a mensagem antiga**, o
`Registrar importação` não gravou. Abra a execução no n8n, clique nesse nó e
leia o output: se vier `code`/`message`, a resposta do Supabase diz o motivo
(tabela não criada ainda é o caso mais provável — volte e rode o SQL).
