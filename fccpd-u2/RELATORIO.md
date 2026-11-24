# Relatório · Distribuição e paralelismo no Origem

**Disciplina:** Fundamentos de Computação Concorrente, Paralela e Distribuída (FCCPD) · Unidade 2
**Projeto:** Origem, marketplace de artesanato e economia criativa de Pernambuco
**Repositório:** <https://github.com/thainapontes/Marketplace-da-economia-criativa>
**Base:** a Parte 1 ([`RELATORIO.md`](../RELATORIO.md) da raiz) tratou da concorrência no checkout e da fila
assíncrona. Esta parte separa o sistema em serviços que conversam entre si, paraleliza uma
tarefa real e mede o ganho.

---

## Sumário

1. [Arquitetura distribuída](#1-arquitetura-distribuída)
2. [O trecho paralelo](#2-o-trecho-paralelo)
3. [Benchmark: metodologia](#3-benchmark-metodologia)
4. [Resultados](#4-resultados)
5. [Interpretação](#5-interpretação)
6. [Evidências de que a comunicação funciona](#6-evidências-de-que-a-comunicação-funciona)
7. [Como reproduzir](#7-como-reproduzir)
8. [Limitações](#8-limitações)
9. [Uso de ferramentas de IA](#9-uso-de-ferramentas-de-ia)

---

## 1. Arquitetura distribuída

O Origem roda como **cinco processos independentes**, com responsabilidades separadas, que
conversam por **HTTP/REST** e por **mensageria** (a fila da Parte 1), sobre um PostgreSQL:

```mermaid
flowchart LR
    N[Navegador] -->|HTTP REST| F[Frontend<br/>Next.js · Vercel]
    F -->|HTTP REST<br/>JSON + cookie de sessão| A[API<br/>Node.js + Express]
    A -->|HTTP REST<br/>recomendações, sentimento,<br/>classificação · timeout 2 s| IA[Módulo de IA<br/>Python · BentoML]
    A -->|SQL<br/>transação do checkout| DB[(PostgreSQL)]
    A -->|enfileira job<br/>na mesma transação| Q[[Fila<br/>tabela evento_assincrono]]
    Q -->|SKIP LOCKED<br/>consome e confirma| W[Worker<br/>Node.js]
    W -->|grava notificação| DB
    IA -->|leitura, por dados.py| DB
    L[Lote de recomendações<br/>Python · N processos] -->|leitura| DB
    L -.->|usa as mesmas regras| IA
```

| Serviço | Onde está | Responsabilidade | Por que é um serviço separado |
|---|---|---|---|
| **Frontend** | `frontend/` | Telas e navegação | Roda no navegador e na Vercel; muda de ritmo diferente do backend |
| **API** | `backend/src/server.js` | Regras de negócio, login, catálogo, carrinho e checkout seguro | É o único que **escreve** pedidos e estoque: as regras de concorrência da Parte 1 ficam num lugar só |
| **Worker** | `backend/src/worker.js` | Consome a fila: notificações de pedido e processamento de imagem | Tira trabalho lento do caminho da resposta HTTP. Se cair, a API continua vendendo e os jobs esperam na fila. Pode ter várias cópias (`SKIP LOCKED`) |
| **Módulo de IA** | `ia-recomendacao/service.py` | Recomendações por produto e por usuário, sentimento das avaliações e classificação de produtos | Outra linguagem (Python) e outro ciclo de vida. Se ficar lento ou cair, a vitrine continua: a API espera no máximo 2 s e responde com os mais vendidos (RF-08) |
| **Lote de recomendações** | `ia-recomendacao/lote.py` | Recalcula a lista de todos os compradores de uma vez | Tarefa pesada de CPU que não pode rodar dentro de uma requisição: é o trecho paralelo (seção 2) |
| **PostgreSQL** | `backend/sql/` | Dados e a fila | Fonte única da verdade; a fila no próprio banco permite enfileirar **na mesma transação** do pedido |

> **Estado da integração em 24/11/2026:** todos os serviços funcionam como descrito. Desde 21/11
> o frontend não usa mais a Fake API: todas as telas falam com a API (PR #26), e a API é a única
> que chama o módulo de IA, levando o usuário do login (PRs #22 e #25). As evidências da seção 6
> foram geradas em 20/11, antes dessa troca, e por isso chamam a API e a IA direto por HTTP; o
> caminho completo pelo navegador está em [`evidencias-u2/`](../evidencias-u2/README.md).
>
> **No deploy gratuito** o Render não oferece worker separado. Lá o worker roda dentro do processo
> da API (`WORKER_EMBUTIDO=true`), mas continua consumindo a mesma fila no banco; numa hospedagem
> paga ele volta a ser um processo à parte sem mudar o código.

**Comunicação, por tipo:**

- **HTTP/REST síncrono:** navegador → frontend → API, e API → módulo de IA
  (`backend/src/utils/modulo-ia.js`). A API se identifica no log da IA como `backend`, envia o
  usuário que ela mesma autenticou e desiste em 2 s. Contratos em [`docs/api.md`](../docs/api.md),
  no Swagger em `/docs` e nas rotas do módulo de IA.
- **Mensageria assíncrona:** API → fila → worker. A API grava o job na tabela
  `evento_assincrono` dentro da transação do pedido. O worker, outro processo, pega os jobs com
  `FOR UPDATE SKIP LOCKED`, processa e confirma. Se o pedido falhar, o job nunca existe; se o
  worker cair, o job volta para a fila. Essa é a fila da Parte 1, agora usada pelo pedido de
  verdade: cada pedido avisa o comprador e cada artesão envolvido.
- **Leitura do banco pelo módulo de IA:** só leitura e só pelas funções de
  `ia-recomendacao/dados.py`. Se o banco cair, o módulo responde por um retrato JSON.

**O que NÃO foi separado, e por quê.** Catálogo, carrinho, pedidos e usuários continuam na mesma
API. O checkout precisa, **numa única transação**, baixar o estoque, gravar o pedido e
enfileirar os avisos (Parte 1). Em serviços separados, isso exigiria uma transação distribuída ou
uma saga com compensações. É complexidade sem ganho para o tamanho do Origem, e com risco de
reintroduzir a venda acima do estoque. A divisão segue o critério de "separar só o que fizer
sentido": separou-se o que tem **ritmo, linguagem ou carga diferentes** (worker, IA e lote) e
manteve-se junto o que precisa de **atomicidade**.

---

## 2. O trecho paralelo

**Tarefa real:** recalcular a lista "Escolhidos para você" de **todos** os compradores de uma vez.
É a recomendação por histórico de compra (RF-06 da AV1 de IA). Isso serve para deixar as listas
prontas e para reprocessar tudo quando o catálogo muda, como num produto novo, num estoque que
zerou ou num artesão aprovado. Para cada comprador, o algoritmo percorre o catálogo inteiro,
pontua cada produto contra o histórico dele, ordena e completa com os mais populares. Com 5 mil
compradores e 4 mil produtos, são cerca de 20 milhões de comparações em Python: puro CPU.

**Onde está:** [`ia-recomendacao/lote.py`](../ia-recomendacao/lote.py), função `calcular`.

O lote tem três fases, medidas separadamente:

| Fase | O que faz | Execução |
|---|---|---|
| 1. Leitura | Produtos e históricos de todos, em 2 consultas, pelas funções de acesso | Sequencial (0,07 s) |
| 2. **Cálculo** | `recomendador.por_usuario` para cada comprador | **Paralela**, com N processos |
| 3. Gravação | Resultado em `logs/lote_recomendacoes.json` | Sequencial (0,003 s) |

**Como foi paralelizado:**

- **Processos, não threads.** No Python (CPython), a GIL deixa só uma thread executar código
  Python por vez. Num cálculo puro de CPU, threads não dariam ganho; processos têm cada um o seu
  interpretador e rodam de fato em núcleos diferentes. A ferramenta é o `ProcessPoolExecutor` da
  biblioteca padrão.
- **Dados enviados uma vez só.** O catálogo pontuado vai para cada processo **uma única vez**,
  no início, pelo `initializer`. Depois, cada tarefa leva só o id do comprador e o histórico
  dele, uma lista curta de ids.
- **Divisão em blocos.** Os compradores são divididos em blocos (`chunksize`), 4 blocos por
  processo: menos idas e vindas entre processos e, ainda assim, quem termina antes pega outro
  bloco.
- **Sem estado compartilhado.** Cada comprador é calculado de forma independente, sem trava e
  sem disputa. O paralelismo não muda o resultado: o benchmark confere, a cada rodada, que a
  saída paralela é **idêntica** à sequencial.
- **`spawn`.** Cada processo começa limpo, e o comportamento é o mesmo em Linux, Windows e
  macOS.

---

## 3. Benchmark: metodologia

| Item | Como foi feito |
|---|---|
| **Métrica** | Tempo de parede (`time.perf_counter`) da fase de cálculo; o tempo total do lote também é registrado |
| **Ferramenta** | [`fccpd-u2/benchmark.py`](benchmark.py), que chama o próprio `lote.py` |
| **Configurações** | 1 processo, a linha de base sequencial sem pool, e 2, 4, 8 e 16 processos |
| **Volume** | 5.007 compradores × 4.013 produtos, 12.443 pedidos (2.004 cancelados) e 24.901 itens ([`carga.sql`](carga.sql) + seed). Cerca de 10% dos produtos inativos e 9% sem estoque, para a regra de elegibilidade ter o que filtrar |
| **Banco** | Banco próprio de benchmark ([`docker-compose.yml`](docker-compose.yml), porta 5435, dados em memória), separado do banco de desenvolvimento. Os dados de carga são gerados com `setseed` e saem sempre iguais |
| **Repetições** | 1 rodada de aquecimento descartada e **5 repetições** de cada configuração, **intercaladas** (a repetição 1 de todas, depois a 2...), para uma variação da máquina no meio do teste não prejudicar só uma configuração |
| **Estatística** | **Mediana** das 5, com a faixa entre a menor e a maior. Speedup = mediana sequencial ÷ mediana com N; eficiência = speedup ÷ N |
| **Corretude** | Cada rodada paralela é comparada com a sequencial; resultado diferente aborta o benchmark |
| **Máquina** | Intel Core i5-13450HX: 10 núcleos físicos, sendo 6 de desempenho com 2 threads cada, até 4,6 GHz, e 4 de eficiência, até 3,4 GHz, num total de 16 núcleos lógicos. 16 GB de RAM, Linux 7.3 (Fedora), Python 3.13.16, PostgreSQL 16.15 em container |

---

## 4. Resultados

Rodada de 20/11/2026. Os dados brutos estão em [`resultados/benchmark.csv`](resultados/benchmark.csv)
e o resumo em [`resultados/resumo.md`](resultados/resumo.md).

| Processos | Cálculo, mediana | Faixa das 5 | Speedup do cálculo | Eficiência | Total do lote, mediana | Speedup do total |
|---:|---:|---:|---:|---:|---:|---:|
| 1 (sequencial) | 11,979 s | 11,90 – 14,40 s | 1,00× | 100% | 12,051 s | 1,00× |
| 2 | 6,188 s | 6,04 – 7,35 s | **1,94×** | 97% | 6,260 s | 1,93× |
| 4 | 3,563 s | 3,44 – 4,39 s | **3,36×** | 84% | 3,637 s | 3,31× |
| 8 | 2,601 s | 2,51 – 3,52 s | **4,61×** | 58% | 2,676 s | 4,50× |
| 16 | 2,558 s | 2,49 – 2,76 s | **4,68×** | 29% | 2,636 s | 4,57× |

```
tempo do cálculo (mediana)
 1 processo   ████████████████████████████████████████  11,98 s
 2 processos  █████████████████████                       6,19 s
 4 processos  ████████████                                3,56 s
 8 processos  █████████                                   2,60 s
16 processos  █████████                                   2,56 s
```

Medidas complementares, feitas para a interpretação:

| Medida | Resultado |
|---|---|
| Abrir e fechar o pool de processos, sem trabalho (mediana de 3) | 0,11 s com 2 processos · 0,12 s com 4 · 0,16 s com 8 · 0,25 s com 16 |
| O mesmo lote com o volume do seed, de 7 compradores × 13 produtos | Cálculo sequencial < 0,001 s; com 2 processos, 0,116 s |
| Leitura com uma subconsulta por comprador, numa carga anterior de 4.007 × 2.013 | 2,32 s. Com um join agrupado, no volume final: 0,07 s |

---

## 5. Interpretação

**1. O ganho é real e quase linear até 4 processos.** Com 2 processos o cálculo cai à metade
(1,94×, 97% de eficiência), e com 4 fica 3,36 vezes mais rápido. Isso confirma as decisões da
seção 2: as tarefas são independentes (não há trava nem disputa), e usar processos em vez de
threads contornou a GIL. Como a leitura e a gravação levam menos de 0,1 s, quase todo o ganho do
cálculo chega ao tempo total do lote: 4,5 vezes com 8 processos. Pela Lei de Amdahl, a parte
sequencial é tão pequena que não é ela que limita o ganho.

**2. O teto em torno de 4,6× vem do hardware, não do código.** De 8 para 16 processos o tempo
praticamente não muda (2,60 s → 2,56 s). As medidas apontam para isso:

- **Núcleos físicos.** A máquina tem 10 núcleos físicos, e não 16. Os 16 "núcleos" do sistema
  incluem a segunda thread dos 6 núcleos de desempenho (hyper-threading). Duas threads no mesmo
  núcleo dividem as mesmas unidades de execução. Num laço de Python puro, a segunda quase não
  acrescenta, e por isso dobrar de 8 para 16 não ajudou.
- **Núcleos de velocidades diferentes.** 4 dos 10 núcleos são de eficiência, até 3,4 GHz contra
  4,6 GHz. Com 8 ou mais processos, parte do trabalho cai neles. Como o lote só termina quando o
  último bloco termina, o núcleo mais lento puxa o tempo. A divisão em vários blocos por processo
  ameniza, mas não elimina, esse efeito.
- **Custo fixo de coordenação, que cresce com N.** Abrir e fechar o pool custou de 0,11 s, com 2
  processos, a 0,25 s, com 16. É pouco perto de 12 s, então não explica sozinho o teto, mas soma:
  com 16 processos é cerca de 10% dos 2,56 s. Além disso, o catálogo é enviado a cada processo e
  os resultados voltam para o principal.
- **Hipótese não medida:** com muitos núcleos ativos ao mesmo tempo, o processador reduz a
  frequência do turbo, e cada núcleo fica um pouco mais lento.

**3. Paralelismo tem custo, e só compensa com volume.** Com os 7 compradores do seed, o
paralelo foi **mais lento** que o sequencial: 0,116 s contra menos de 1 ms, porque criar os
processos custa mais que o trabalho inteiro. É por isso que o paralelismo está no **lote**, que
processa milhares de compradores de uma vez, e não em cada requisição de recomendação, que
calcula um só comprador e responde em milissegundos.

**4. Antes de paralelizar, otimizar o sequencial.** A primeira versão da leitura fazia uma
subconsulta por comprador e levava 2,3 s, porque `item_pedido.pedido_id` não tem índice e a
tabela era varrida uma vez para cada comprador. Trocá-la por um join agrupado levou a leitura a
0,07 s, um ganho maior do que o de qualquer número de processos sobre essa fase. Por isso a
leitura ficou sequencial: paralelizá-la não teria o que ganhar. O índice que falta foi passado
para a frente de Banco de Dados do projeto.

**5. Configuração recomendada.** Nesta máquina, **4 processos** dão 84% de eficiência, e **8**
dão o menor tempo, a partir do qual não compensa subir. Em produção, o serviço gratuito em que o
Origem será publicado tem uma fração de um núcleo. Lá o lote rodaria com 1 processo, e o ganho
medido aqui só vale num servidor com vários núcleos. O código não muda: basta o parâmetro
`--processos`.

---

## 6. Evidências de que a comunicação funciona

Todas as evidências foram geradas em 20/11/2026, com os serviços rodando como processos
separados. Os arquivos estão em [`evidencias/`](evidencias/):

| Arquivo | O que mostra |
|---|---|
| [`01-api-fila-worker.txt`](evidencias/01-api-fila-worker.txt) | Login e `POST /pedidos` na API, que responde 201 em 35 ms. O **worker, outro processo**, consome os 3 jobs da fila (avisos ao comprador e às duas artesãs), e o banco mostra os jobs processados e as notificações gravadas |
| [`02-ia-http.txt`](evidencias/02-ia-http.txt) | Chamadas HTTP ao módulo de IA, com as respostas e o log de cada recomendação. O pedido da evidência 1 **já mudou** a recomendação da compradora: os produtos que ela acabou de comprar saíram da lista. É a prova de que os serviços compartilham o mesmo estado |
| [`03-lote-paralelo.txt`](evidencias/03-lote-paralelo.txt) | O lote sequencial e com 4 processos. O `ps`, tirado durante a execução, mostra os **4 processos de trabalho a 99,6% de CPU cada**, e a saída paralela é **idêntica byte a byte** à sequencial |
| [`04-benchmark-resumo.md`](evidencias/04-benchmark-resumo.md) | O resumo do benchmark da seção 4 |

---

## 7. Como reproduzir

Pré-requisitos: Docker, ou Podman com o `docker compose`, e o [uv](https://docs.astral.sh/uv/).

```bash
# 1. banco de benchmark com a carga (porta 5435; os dados ficam em memória)
cd fccpd-u2
docker compose up -d

# 2. benchmark completo, que espera a carga terminar (leva uns 2 minutos)
cd ../ia-recomendacao
uv sync
uv run python ../fccpd-u2/benchmark.py        # → fccpd-u2/resultados/

# 3. o lote sozinho, com qualquer número de processos
DATABASE_URL=postgres://origem:origem@localhost:5435/origem uv run python lote.py --processos 4

# 4. derrubar o banco de benchmark
cd ../fccpd-u2 && docker compose down
```

Para as evidências 1 e 2, use o banco de desenvolvimento, `cd backend && docker compose up -d`,
e suba a API (`npm run api`), o worker (`npm run worker`) e o módulo de IA (`just serve` em
`ia-recomendacao/`), cada um num terminal.

---

## 8. Limitações

- **O lote ainda não é agendado.** Ele roda por comando; um agendador, como um cron noturno, e o
  uso das listas prontas pela página inicial ficam para depois. Hoje a página inicial pede a
  recomendação na hora.
- **O módulo de IA lê o banco direto.** É só leitura e só pelas funções de acesso, mas cria um
  acoplamento pelo esquema do banco: mudar uma tabela pode exigir mudar o `dados.py`. A outra
  ponta já foi resolvida: desde 21/11 quem chama a IA é a API, com o usuário vindo do login, e
  não mais o navegador.
- **Uma máquina só.** O benchmark mede o ganho num computador com vários núcleos; distribuir o
  lote entre várias máquinas não foi feito nem medido.
- **A hipótese do turbo**, na seção 5, item 2, não foi medida.

---

## 9. Uso de ferramentas de IA

O planejamento, o código do lote e do benchmark, o gerador de carga, a coleta das evidências e a
redação deste relatório foram feitos com apoio do Claude Code (Anthropic). A equipe revisou o
código, executou o benchmark e as evidências na própria máquina e confere que todos os números
deste relatório saíram dessas execuções. Mais detalhes em [`docs/uso-de-ia.md`](../docs/uso-de-ia.md).
