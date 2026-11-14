# Evidências — FCCPD Unidade 1 (concorrência + fila assíncrona)

Saídas reais dos testes automatizados do projeto **Origem**, um marketplace de
artesanato de Pernambuco. Todos os arquivos desta pasta foram gerados por
`npm run evidencias` dentro de `backend/` — nada foi digitado à mão.

Reproduzir do zero:

```bash
cd backend
docker compose up -d      # PostgreSQL 16 (porta 5434), schema e seed automáticos
npm install
npm run api               # terminal 1
npm run evidencias        # terminal 2 — regrava esta pasta inteira
```

---

## Os arquivos

| Arquivo | O que prova | Resultado obtido |
|---|---|---|
| `01-checkout-ingenuo.txt` | Que o problema existe: 50 compras simultâneas de um produto com estoque 10, no checkout que confere e depois escreve | **50 vendas aprovadas** para 10 unidades; estoque caiu apenas de 10 para 1 — **41 escritas perdidas** |
| `02-checkout-seguro.txt` | Que o UPDATE condicional resolve: mesma rajada, mesma carga | **10 aprovadas, 40 rejeitadas (409), estoque final 0**, nenhuma escrita perdida |
| `03-deadlock.txt` | Que ordenar os itens por `produto_id` elimina o impasse: 40 compras com os mesmos dois produtos em ordem inversa | **0 deadlocks**, 40 compras concluídas |
| `04-fila.txt` | Confiabilidade da fila, em três partes (abaixo) | as três ✅ |
| `05-estado-do-banco.txt` | Consulta direta no PostgreSQL, independente dos scripts em JS: estoque, status dos jobs, notificações e a estrutura da tabela da fila | — |

### O que tem dentro do `04-fila.txt`

1. **Sobrevivência à queda** — 200 jobs enfileirados, o worker é morto com
   `kill -9` no meio do trabalho (morte súbita, sem chance de limpeza) e outro
   sobe no lugar. Resultado: **200 processados, 200 efeitos gravados, 200
   distintos, 0 perdidos**. Os jobs que o worker morto segurava voltaram à fila
   pela varredura de órfãos; a idempotência impediu que a repetição virasse
   notificação duplicada.
2. **Retry, backoff exponencial e dead-letter** — com falha forçada em 100% das
   execuções, as novas tentativas aparecem espaçadas em **500 ms → 1 s → 2 s**
   (o dobro a cada vez) e, esgotado o limite, o job vai para `morto` com o
   motivo registrado, em vez de tentar para sempre.
3. **`SELECT ... FOR UPDATE SKIP LOCKED`** — três processos worker simultâneos
   dividiram 60 jobs em **20 / 20 / 20**, e **nenhum job foi executado por mais
   de um worker**.

---

## Comparativo, antes e depois

| | Checkout ingênuo | Checkout seguro |
|---|---:|---:|
| Requisições simultâneas | 50 | 50 |
| Estoque inicial | 10 | 10 |
| HTTP 201 (venda confirmada) | **50** | **10** |
| HTTP 409 (rejeitada) | 0 | **40** |
| Estoque final | **1** | **0** |
| Unidades vendidas além do estoque | **40** | 0 |
| Escritas perdidas (*lost update*) | **41** | 0 |

O número mais revelador não é o overselling, é o **estoque final 1**: 50 baixas
de uma unidade foram executadas e o estoque caiu 9. Quarenta e uma escritas
foram sobrescritas por outras que liam o valor antigo. Não é só "vendeu demais"
— o próprio número do estoque deixou de significar alguma coisa.

---

## Onde está cada coisa no código

| Assunto | Arquivo |
|---|---|
| UPDATE condicional atômico + ordenação anti-deadlock | `backend/src/services/checkout-seguro.service.js` |
| A versão com race condition (mantida de propósito) | `backend/src/services/checkout-ingenuo.service.js` |
| Transação e pool de conexões | `backend/src/config/database.js` |
| Fila: enfileirar, reservar, ack, backoff, dead-letter, órfãos | `backend/src/repositories/fila.repository.js` |
| Worker (processo separado) | `backend/src/worker.js` |
| Tarefas idempotentes (notificação e imagem) | `backend/src/services/tarefas.service.js` |
| Estrutura da fila no banco | `backend/sql/03_fila.sql` |
| Scripts destes testes | `backend/testes/` |
