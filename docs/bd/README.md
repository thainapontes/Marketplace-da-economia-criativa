# Banco de Dados da U2: índices, integridade e views

Frente de Modelagem e Projeto de Banco de Dados do projeto Origem
(PostgreSQL 16). Todas as mudanças são **aditivas**: os arquivos
`01_schema.sql`, `01b_extensoes_u2.sql`, `02_seed.sql` e `03_fila.sql`
não foram alterados.

## 1. Ambiente das medições

| Item | Valor |
|---|---|
| Processador | Intel Core i7-1255U (12ª geração), 10 núcleos |
| Memória RAM | 11,7 GB |
| Sistema | Windows, com o PostgreSQL rodando no Docker |
| PostgreSQL | 16.16 (imagem `postgres:16-alpine`) |
| Volume de dados | 100.010 produtos, 1.004 artesãos, 50.003 pedidos, 150.004 itens de pedido |

Os dados de teste são **sintéticos**: nenhum nome, e-mail ou telefone de
pessoa real. Os e-mails de carga terminam em `@carga.origem.invalid`.

## 2. Metodologia

- **Carga:** `backend/sql/bd-u2/10_carga_benchmark.sql` (1.000 artesãos e
  100 mil produtos) e `11_carga_pedidos.sql` (5.000 compradores, 50 mil
  pedidos e 150 mil itens). Ficam em uma subpasta de propósito: o Docker não
  executa subpastas, então esses dados nunca aparecem na vitrine do site.
- **Estatísticas:** `ANALYZE` depois de cada carga e depois de criar cada
  índice, para o planejador conhecer o tamanho real das tabelas.
- **Medição:** `EXPLAIN (ANALYZE, BUFFERS)`, **5 execuções** por consulta.
  A 1ª é descartada (cache frio) e o número oficial é a **mediana das 4
  restantes** (média das duas do meio).
- **Sem índice:** o índice é apagado **dentro de uma transação** que termina
  em `ROLLBACK`, então ele volta sozinho e nada fica alterado no banco.
- **Resultado igual:** para as buscas reescritas, conferimos com `EXCEPT`, nos
  dois sentidos, que a versão nova devolve os mesmos produtos da antiga.
- **Evidências:** as saídas dos `EXPLAIN` e dos testes estão em
  `docs/bd/evidencias/`. Cada plano guardado vem de **uma execução**: o
  número oficial é sempre a mediana, e o plano serve para mostrar o caminho
  que o banco escolheu.

## 3. Resultados: antes e depois

Mediana de 4 execuções (a 1ª descartada), em milissegundos.

| Consulta | Plano antes | Plano depois | Antes (ms) | Depois (ms) | Ganho | Decisão |
|---|---|---|---|---|---|---|
| Busca por texto, termo "bordado" | Seq Scan em `produto` | `idx_produto_filtros` (parte da técnica) | 237,89 | 11,98 | ~19,9x | busca reescrita + índice de nome |
| Busca por texto, termo "peca de carga 4321" | Seq Scan em `produto` | `idx_produto_nome_sem_acento` | 253,39 | 16,59 | ~15,3x | índice criado |
| Produtos de um artesão (`artesao_id`) | Seq Scan | `idx_produto_artesao` | 6,95 | 0,68 | ~10,3x | índice criado |
| Itens de um pedido (`pedido_id`) | Seq Scan | `idx_item_pedido_pedido` | 8,07 | 0,31 | ~26x | índice criado |
| Técnica + região | Seq Scan | `idx_produto_filtros` | 7,90 | 3,53 | ~2,2x | índice já existia |
| Só região | Seq Scan | Bitmap Index Scan (índice de teste) | 10,12 | 8,27 | ~1,2x | **índice não criado** |

### Custo dos índices em espaço

| Índice | Tamanho |
|---|---|
| `idx_produto_nome_sem_acento` | 3.288 kB |
| `idx_produto_artesao` | 688 kB |
| `idx_item_pedido_pedido` | 2.432 kB |
| índice de teste em `regiao_id` (não criado) | 696 kB |

O **custo de escrita** (INSERT e UPDATE mais lentos com mais índices) **não
foi medido**.

### Como ler esses números

- **Busca por texto.** O ganho de "peca de carga 4321" tem duas partes.
  Só reescrever a busca (sem o índice novo) levou de 253,39 ms para 136,64 ms
  (~1,9x). Com o índice, de 136,64 ms para 16,59 ms (~8,2x). As duas mudanças
  juntas dão o ganho total. No termo "bordado", o índice de nome achou 0
  linhas: o ganho veio da reescrita e do `idx_produto_filtros`.
- **Resultado igual.** Para os dois termos, a busca nova devolveu exatamente
  os mesmos produtos da antiga (0 diferenças com `EXCEPT`).
- **Só região (sem ganho relevante).** O filtro devolve cerca de 25% da tabela
  (25.004 linhas). O planejador usou o índice de teste, mas o ganho foi de
  ~1,8 ms. Pela seletividade e pelo custo de espaço, a decisão foi **não
  criar** o índice. É uma decisão de custo e benefício, não uma prova de que
  o índice seria inútil.
- **Técnica + região (ganho pequeno).** O ganho de ~2,2x é menor que o das
  FKs. Uma explicação provável, **não verificada**, é que a carga sintética
  espalha os produtos de cada técnica e região por todos os blocos da tabela.
- **FKs.** Os ganhos de `artesao_id` e `pedido_id` são grandes em proporção
  (o filtro devolve 0,1% e 0,002% das linhas), mas pequenos em milissegundos,
  porque a tabela cabe na memória.

### Limitações

- Os dados são **sintéticos** e distribuídos de forma uniforme (por exemplo,
  todos os nomes de produto de carga começam com o mesmo texto). Um
  marketplace real tem outra distribuição.
- Uma máquina, um banco e uma sessão de medição.
- A busca reescrita não casa termos que atravessam os textos colados (fim do
  nome do produto com o começo do nome do artesão). Medimos igualdade de
  resultado em **dois** termos, não em todos.


## 4. Views

Arquivo: `backend/sql/05_views_u2.sql` (aditivo).

### 4.1 `vw_indicadores_artesao` (corrigida)

A versão original tinha **três diferenças** em relação à API
(`backend/src/repositories/artesoes.repository.js`, função `indicadores`):

1. `total_vendido` somava pedidos **cancelados**;
2. `total_pedidos` contava pedidos **cancelados**;
3. `pedidos_pendentes` só contava o status `pendente`, mas desde a U2 todo
   pedido nasce `confirmado`. A API conta `pendente` e `confirmado`.

A correção usa `FILTER` em cada soma e contagem e `COALESCE(..., 0)`.
Mantém o mesmo nome e as mesmas colunas, na mesma ordem (regra do
`CREATE OR REPLACE VIEW`).

Exemplo medido antes da correção (view × regra da API, artesão 13):
total vendido 73.921,00 × 57.145,84; pedidos 150 × 116; pendentes 16 × 50.
Depois da correção, os três artesãos comparados deram valores iguais, e a
comparação de **todos** os artesãos que aparecem na view deu **0 divergências**.

**Limitação:** a régua da comparação é a regra da API escrita em SQL a partir
da leitura do código JavaScript. A prova com a API rodando não foi feita.
A view usa `JOIN`, então um artesão **sem nenhum pedido** não aparece nela
(a API devolveria zeros). No banco de teste isso não ocorre (1.004 artesãos,
0 fora da view), mas pode ocorrer com um artesão novo.

### 4.2 `vw_vitrine_produto` (nova)

Consulta recorrente do site: produto **ativo** de artesão **aprovado**, com
o nome do artesão, da técnica, da região e da categoria e a imagem principal.
Espelha o `INCLUDE_PRODUTO` e o `ehPublico` de
`backend/src/repositories/produtos.repository.js`. Os ids de técnica, região
e categoria ficam na view para o filtro poder usar o `idx_produto_filtros`.

Resultado medido: 95.010 produtos na view, igual à consulta direta nas
tabelas, sem produto repetido e sem produto inativo. Apenas 10 produtos
(os do seed) têm imagem, porque a carga sintética não cria fotos
(`imagem_principal` vazia nos outros 95.000).

**Limitação:** o desempenho de filtrar por essa view **não foi medido**.
O site hoje não usa views (o Prisma lê as tabelas); a decisão de usá-la no
repository é do dono do backend.

## 5. Testes

Todos rodam dentro de uma transação desfeita no final (`ROLLBACK`).

| Arquivo | O que testa | Resultado |
|---|---|---|
| `bd-u2/20_testes_integridade.sql` | `CHECK` de preço e de estoque, `FK` de `produto.artesao_id`, `UNIQUE` de `usuario.email` | 4 testes `OK`, cada um com o nome da regra apontada pelo banco |
| `bd-u2/21_testes_views.sql` | indicadores batem com a regra da API; artesão só com pedido cancelado mostra 0/0/0; vitrine com mesma contagem da consulta direta, sem repetição e só com ativo/aprovado | 5 testes `OK` |

Saídas em `docs/bd/evidencias/testes_integridade.txt` e
`testes_views.txt`.

**Limitação:** nenhum desses testes foi visto **falhando** de propósito,
então ainda não há prova de que eles detectariam um defeito.

### Testes da API

Com o banco criado do zero e só o seed, `node --test testes/api/*.test.js`
passou em **109 de 109** testes. O script `npm test` do projeto
(`node --test testes/api/`) falhou no Node v24.20.0 com `MODULE_NOT_FOUND`,
antes de rodar qualquer teste. Não alteramos o `package.json`; a causa
provável (o Node mais novo não aceitar uma pasta nesse comando) **não foi
confirmada**, e a versão do Node usada pelo restante da equipe é desconhecida.


## 6. Decisões de índice

Arquivo: `backend/sql/04_indices_u2.sql` (aditivo, com a justificativa de
cada item no próprio arquivo).

| Decisão | Por quê | Evidência |
|---|---|---|
| Criar `f_unaccent(text)` `IMMUTABLE` | O `unaccent()` é `STABLE` (`provolatile = s`) e o Postgres só aceita funções `IMMUTABLE` em índices. Erro visto: `functions in index expression must be marked IMMUTABLE`. A função embrulha `public.unaccent('public.unaccent', $1)`. Isso **afirma** ao banco que o dicionário não muda, o que vale na prática com o dicionário padrão. | teste com `provolatile = i` |
| Criar `idx_produto_nome_sem_acento` (GIN, `gin_trgm_ops`, sobre `f_unaccent(nome)`) | O índice antigo (`idx_produto_nome_trgm`) guarda o nome **com** acento, então não serve para a busca sem acento. | `busca_antes.txt`, `busca_depois_peca4321.txt` |
| Criar `idx_produto_artesao` (`produto.artesao_id`) | FK sem índice; o painel do artesão filtra por ela e devolve ~0,1% da tabela. | `artesao_antes.txt`, `artesao_depois.txt` |
| Criar `idx_item_pedido_pedido` (`item_pedido.pedido_id`) | FK sem índice; "os itens de um pedido" devolve 0,002% da tabela. O `ON DELETE CASCADE` é um motivo a mais, mas o efeito dele **não foi medido**. | `pedido_antes.txt`, `pedido_depois.txt` |
| Manter `idx_produto_filtros` como está | Já atende técnica e técnica + região (regra do prefixo à esquerda). | `vitrine_antes.txt`, `vitrine_depois.txt` |
| **Não** criar índice só em `regiao_id` | Devolve ~25% da tabela; o ganho medido foi de ~1,8 ms para 696 kB de espaço. É decisão de custo e benefício, e pode ser revista. | `regiao_teste.txt` |

### O que ficou de fora e por quê

- **`item_pedido.produto_id`** e **`pagamento.pedido_id`** também parecem ser
  FKs sem índice, mas **não foram examinadas nem medidas**. Ficam como
  pergunta para o dono do backend: só vale indexar se alguma consulta real
  do site filtra por elas.
- **Busca por texto com 1 ou 2 letras.** Segundo o CLAUDE.md, o índice
  trigram só ajuda com termos de 3 letras ou mais. Esse limite **não foi
  medido** neste trabalho.

### Busca reescrita (proposta ao dono do backend)

Arquivo: `backend/sql/bd-u2/30_busca_reescrita.sql`. Troca a concatenação
`produto.nome || usuario.nome || tecnica.nome` por três consultas unidas com
`UNION`, usando `f_unaccent` (e **não** `unaccent`, senão o índice não é
usado). A consulta foi testada com parâmetro (`PREPARE`) num banco só com o
seed: mesmos ids que a versão antiga para o termo `renascenca` e nenhuma
linha para um termo inexistente. A aplicação no `src` é do dono do backend.

## 7. Como reproduzir

Na pasta `backend`, no PowerShell:

```powershell
# 1. banco do zero (roda 01, 01b, 02, 03, 04 e 05 sozinho, na ordem)
docker compose down -v
docker compose up -d
docker compose logs postgres | Select-String -Pattern "error" -CaseSensitive:$false   # esperado: nada

# 2. cargas de teste, UMA vez e nesta ordem (e-mails únicos: rodar duas vezes dá erro)
Get-Content sql\bd-u2\10_carga_benchmark.sql | docker compose exec -T postgres psql -U origem -d origem -v ON_ERROR_STOP=1
Get-Content sql\bd-u2\11_carga_pedidos.sql   | docker compose exec -T postgres psql -U origem -d origem -v ON_ERROR_STOP=1
docker compose exec postgres psql -U origem -d origem -c "ANALYZE;"

# 3. medir uma consulta (repetir 5 vezes; descartar a 1ª; mediana das 4)
docker compose exec postgres psql -U origem -d origem -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM produto WHERE artesao_id = 500;" | Select-String "Execution Time"

# 4. testes de integridade e de views (usar cmd: o PowerShell suja a saída)
cmd /c "docker compose exec -T postgres psql -U origem -d origem -v ON_ERROR_STOP=1 < sql\bd-u2\20_testes_integridade.sql 2>&1"
cmd /c "docker compose exec -T postgres psql -U origem -d origem -v ON_ERROR_STOP=1 < sql\bd-u2\21_testes_views.sql 2>&1"
```

Observações:

- Os ids usados nas medições (`artesao_id = 500`, `pedido_id = 75003`) dependem
  da carga. O `pedido_id` varia conforme quantos números a sequência já gastou
  (transações desfeitas consomem números); para achar o pedido de carga
  número 25000: `SELECT id FROM pedido WHERE endereco_entrega = 'Rua de carga 25000';`.
- Para medir **sem** um índice, apague-o dentro de uma transação e termine com
  `ROLLBACK` (o índice volta sozinho).
- **Textos de carga sem acento:** o PowerShell corrompe letras acentuadas
  enviadas pelo pipe (`|`); por isso a carga usa `Artesao`, `Peca` etc.
- **Depois de rodar a API ou os testes do FCCPD**, recrie o banco com
  `docker compose down -v`.