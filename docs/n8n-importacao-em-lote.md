# Importação de NF-e em lote — por que era lenta e o que mudou

## O problema

O fluxo gravava **uma nota por vez**, e cada nota custava cinco idas ao
Supabase: upsert do cliente, upsert da loja, upsert do pedido, delete dos itens
antigos, insert dos novos. Mais uma sexta para o estoque.

| Notas | Requisições | Tempo só de rede (a ~100 ms cada) |
|---|---|---|
| 50 | 300 | 30 s |
| 200 | 1.200 | 2 min |
| 1.000 | 6.000 | 10 min |

Não é o banco que é lento: é a quantidade de conversas. E como o CRM só recebe
resposta depois da leitura de todos os XMLs, ZIP grande ainda esbarra no tempo
limite do proxy antes disso.

## O que mudou

A persistência passou a trabalhar com o lote inteiro. **São 6 requisições, não
importa se são 10 ou 1.000 notas:**

```
Preparar persistencia  → uma linha por nota, como antes
Montar lotes           → junta tudo num item só
Upsert lojas (lote)    → 1 requisição, array
Upsert clientes (lote) → 1 requisição, array
Montar pedidos         → cruza os ids que voltaram
Upsert pedidos (lote)  → 1 requisição, array
Montar itens           → cruza de novo
Substituir itens       → 1 RPC (delete + insert na mesma transação)
Baixar estoque (lote)  → 1 RPC com todas as notas
Montar resumo → Registrar importacao
```

## Três armadilhas que isso cria, e como estão resolvidas

**Duplicata dentro do próprio array.** O PostgREST recusa o lote inteiro com
*"ON CONFLICT DO UPDATE command cannot affect row a second time"* se a mesma
chave aparece duas vezes. Acontece de verdade: o mesmo CPF em várias notas, ou
duas notas com o mesmo `xPed` na mesma loja. Os nós `Montar lotes` e
`Montar pedidos` deduplicam antes de enviar, deixando o último vencer — que é o
que aconteceria em chamadas separadas.

**URL gigante no delete.** Apagar os itens antigos com
`order_id=in.(uuid,uuid,…)` daria 37 KB de URL para 1.000 pedidos, acima do
limite de qualquer proxy. Por isso existe `crm_replace_order_items`: o array vai
no corpo, e o delete e o insert acontecem na mesma transação — não há janela em
que o pedido fique sem itens.

**Estoque nota a nota.** `deduct_stock_for_nfes` recebe o lote e resolve do lado
do banco, mantendo a regra de não baixar duas vezes a mesma nota. O
identificador passou a ser a **chave de acesso**, não o número da NF, que se
repete entre emitentes diferentes.

## Antes de trocar o que está em produção

O fluxo novo está em `n8n/unificca-upload-nfe.json`. Ele usa funções que
precisam existir antes — rode `supabase/stock-nfe-lote.sql`, que traz as duas.

**Importe como workflow NOVO, não por cima do atual.** O webhook tem o mesmo
path, então mantenha o novo desativado enquanto testa. O fluxo tem um
formulário próprio (`/form/upload-nfe-zip-levy`): dá para testar por ali, com um
ZIP pequeno, sem tocar no que o CRM usa.

O que conferir depois do teste:

```sql
select * from public.nfe_imports order by created_at desc limit 1;
```

Os números têm que bater com o ZIP enviado. Confira também que os itens dos
pedidos daquele lote existem, e que `stock_movements` não ganhou linha repetida.

Só então: desative o fluxo antigo, ative o novo, e confirme que a URL de
produção do webhook continua a mesma que está em `VITE_N8N_NFE_WEBHOOK_URL`.
