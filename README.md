# Origem — Marketplace da Economia Criativa de Pernambuco

Aplicação web que conecta artesãos e empreendedores criativos de Pernambuco a compradores de
todo o país. Projeto Integrador do 4º semestre de ADS. O repositório reúne o **site** (Next.js), a
**API** (Node/Express + PostgreSQL, nascida na entrega de FCCPD com o checkout concorrente e a fila),
o **módulo de IA** (BentoML: recomendação, sentimento e classificação) e a documentação de cada
disciplina. O plano e o andamento da U2 estão em [`docs/plano-u2.md`](docs/plano-u2.md).

**Equipe:** Everton Nunes Batista, Drielly Santiago, Thainá Pontes da Silva, Ana Beatriz Lopes e Dilvanir Aline.

| Disciplina | Comece por |
|---|---|
| Desenvolvimento Web | [Aplicação Web (U2)](#aplicação-web--u2) logo abaixo |
| IA Aplicada | [README do módulo de IA](ia-recomendacao/README.md) |
| FCCPD | [U1](RELATORIO.md) e [U2](fccpd-u2/RELATORIO.md) |
| Requisitos | testes em `backend/testes/api/`, refatorações em [`docs/refatoracao/`](docs/refatoracao/) |

---

## Aplicação Web — U2

### Arquitetura

```
navegador ──▶ site Next.js (Vercel) ──/api──▶ API Express (Render) ──▶ PostgreSQL (Neon)
                                                   │   └─ worker da fila (notificações do pedido)
                                                   └──▶ módulo de IA BentoML (Render)
```

O site só fala com a API, pelo próprio domínio (`/api`, repassado pelo rewrite do Next), e a sessão é
um cookie httpOnly. A API guarda as regras de negócio, o checkout seguro e o cache, repassa os três
modelos da IA com o usuário do login e enfileira as notificações de cada pedido. Detalhes, camadas e
decisões: [`docs/arquitetura.md`](docs/arquitetura.md).

### Tecnologias

| Parte | Tecnologias |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Zustand |
| Backend | Node.js 20+, Express 5, Prisma 6 + driver `pg`, JWT em cookie httpOnly, bcrypt, Swagger UI |
| Banco | PostgreSQL 16 (`unaccent`, `pg_trgm`), fila em tabela com `FOR UPDATE SKIP LOCKED` |
| IA | Python 3.13, BentoML, `uv`/`just`, regras de recomendação, léxico de sentimento e palavras-chave |
| Testes | `node:test` + `supertest` (API), testes Python do módulo de IA, roteiro Playwright no navegador |
| Deploy | Vercel (site), Render (API e IA), Neon (banco) |

### Como executar tudo localmente

Pré-requisitos: Docker, Node.js 20+, e para a IA `uv` e `just`.

```bash
# 1. banco (PostgreSQL com schema e seed) — porta 5434
cd backend
docker compose up -d
npm install

# 2. API (http://localhost:3333, Swagger em /docs) e worker da fila, em terminais separados
npm run api
npm run worker

# 3. módulo de IA (http://localhost:3001), em outro terminal
cd ../ia-recomendacao
just serve

# 4. site (http://localhost:3000), em outro terminal
cd ../frontend
npm install
npm run dev
```

Em desenvolvimento o site repassa `/api/...` para `http://localhost:3333`, então não é preciso
configurar nada. As variáveis de cada parte estão nos `.env.example` (`backend/`, `frontend/`), sem
credenciais reais. Testes da API: `cd backend && npm test`.

> **Já tinha subido o banco antes da U2?** O PostgreSQL só executa os arquivos de `backend/sql/`
> quando o volume está vazio. Recrie o banco uma vez: `docker compose down -v && docker compose up -d`
> (apaga os dados locais do banco).

### Contas de demonstração

Todas usam a senha **`origem123`**:

| Perfil | E-mail |
|---|---|
| Comprador (com histórico de compras) | `comprador@origem.com.br` |
| Artesã | `maria@origem.com.br` |
| Administrador | `admin@origem.com.br` |

Também é possível criar conta em `/cadastro`, como comprador ou artesão. Artesão escolhe a região do
ateliê e só aparece na vitrine depois que o admin aprova.

### Documentação da API

Swagger em **`/docs`** na API (especificação em [`backend/openapi.yaml`](backend/openapi.yaml), que um
teste mantém em sincronia com as rotas). Contrato com regras, erros e mapeamento banco ↔ API:
[`docs/api.md`](docs/api.md).

### Deploy

Passo a passo (Neon, Render e Vercel) e URLs publicadas: [`docs/deploy.md`](docs/deploy.md).

### Evidências e uso de IA

- Banco, recomendação, processamento assíncrono, cache e o fluxo no navegador: [`evidencias-u2/`](evidencias-u2/).
- Declaração de uso de IA generativa: [`docs/uso-de-ia.md`](docs/uso-de-ia.md).

---

## IA — AV2: mockup do módulo de recomendação (Trilha A, BentoML)

> **Projeto Final de IA (U2, entrega em 27/11):** o módulo agora também faz análise de
> sentimento e classificação, registra cada uso dos dados em `logs/uso_dados.jsonl` e tem um
> resumo do log com as respostas (a), (b) e (c). Instalação, dicionário de dados, funções,
> as três chamadas do log, o resumo e as métricas estão no
> **[README do módulo](ia-recomendacao/README.md)**. Esta seção continua valendo para a AV2.

| | |
|---|---|
| **Grupo** | Origem |
| **Integrantes** | Everton Nunes Batista, Drielly Santiago, Thainá Pontes da Silva, Ana Beatriz Lopes e Dilvanir Aline |
| **Turma** | Análise e Desenvolvimento de Sistemas (ADS) — 4º período, 2026.2 |
| **Projeto** | Origem — Marketplace da Economia Criativa de Pernambuco |
| **Módulo da AV1** | Recomendação de produtos (similaridade de atributos + histórico + popularidade) |
| **Código** | [`ia-recomendacao/`](ia-recomendacao/) — detalhes de dados, regras e decisões no [README do módulo](ia-recomendacao/README.md) |

O serviço sobe em `http://127.0.0.1:3001` e expõe as rotas REST especificadas na AV1. O
catálogo vem do seed do backend (13 peças, uma artesã da Comunidade do Pilar), lido do
PostgreSQL a cada chamada, e o frontend do
Origem já consome o módulo na página de detalhe do produto (ver [Integração com o
frontend](#integração-com-o-frontend)).

### Como instalar e subir

Pré-requisitos: [uv](https://docs.astral.sh/uv/) (instala o Python 3.13 sozinho, se faltar),
`curl`, `python3` e o banco do backend no ar. Desde a U2 o módulo lê os dados do mesmo
PostgreSQL do backend, a cada chamada, pelas funções de `ia-recomendacao/dados.py`. O [just](https://github.com/casey/just) é opcional — cada atalho abaixo
mostra o comando equivalente.

```bash
git clone https://github.com/thainapontes/Marketplace-da-economia-criativa.git
cd Marketplace-da-economia-criativa/backend
docker compose up -d       # PostgreSQL na porta 5434, com o seed
cd ../ia-recomendacao
uv sync                    # instala bentoml, fastapi e psycopg num .venv local
just serve                 # = uv run bentoml serve service:RecomendadorOrigem --port 3001
```

Deixe o `just serve` aberto e use outro terminal para os testes. A documentação interativa
(Swagger) das rotas fica em `http://127.0.0.1:3001/api/docs`.

### Requisitos da AV1 → endpoint

| RF / RNF da AV1 | Onde está no mockup |
|---|---|
| **RF-01** Similaridade de atributos (artesão 3, técnica 2, região 1) | `GET /api/produtos/{id}/recomendados` — `recomendador.similaridade` |
| **RF-02** API REST com 200 / 404 | `GET /api/produtos/{id}/recomendados` |
| **RF-03** Registro em `recomendacao_log` | cada resposta grava em `ia-recomendacao/logs/recomendacao_log.jsonl` (simula a tabela) |
| **RF-04** Elegibilidade (sem o próprio produto, sem inativo, sem estoque zero) | `recomendador.elegivel` — vale para todas as rotas |
| **RF-05** `limite` (padrão 4 / 8; fora de 1–20 → 400) | parâmetro `?limite=` das duas rotas |
| **RF-06** Personalizada por histórico de compra (401 / 403) | `GET /api/usuarios/{id}/recomendados` com header `X-Usuario-Id` (login simulado); seção "Escolhidos para você" na página inicial |
| **RF-07** Popularidade (vendas + nota média) como complemento | `recomendador._montar` — critério `popularidade` |
| **RF-08** Falha ou mais de 2 s → 503 `{ "erro": ... }` | timeout de 2 s nas rotas; header `X-Simular-Falha: erro` ou `lentidao` provoca a falha |
| **RNF-06** No máximo 2 produtos do mesmo artesão por lista | `recomendador.MAX_POR_ARTESAO` |
| **RNF-07** Quantidade de recomendações por critério num período | `GET /api/recomendacoes/metricas?de=AAAA-MM-DD&ate=AAAA-MM-DD` |

### Casos de teste

Com o serviço no ar (`just serve`), copie e cole cada comando. Os resultados abaixo são os
obtidos com o catálogo do repositório. Para rodar todos de uma vez e ver OK/FALHOU:
`just testes` (= `bash testes/casos.sh`, dentro de `ia-recomendacao/`). O script confere
os mesmos 8 casos, na mesma ordem, e mais os casos 9 e 10 (sentimento) da U2; o caso 6 aparece em duas linhas (401 e 403) e, no caso 4,
ele também falha se a resposta passar de 3 s.

**Caso 1 — caminho feliz: peças relacionadas ao produto 1 (RF-01, RF-04, RF-07).** O produto 1
é um cangaceiro de barro da artesã Maria. Só os produtos 5 e 9 têm algo em comum com ele, e são
da mesma artesã: o limite de 2 por artesão (RNF-06) fecha aí, e a lista é completada com os
mais populares.

```bash
curl -s "http://127.0.0.1:3001/api/produtos/1/recomendados?limite=4" | python3 -c 'import json,sys; [print(r["id"], r["criterio"], r["score"]) for r in json.load(sys.stdin)["recomendacoes"]]'
```

Resultado esperado (id, critério, score):

```
5 mesmo-artesao 6
9 mesmo-artesao 4
3 popularidade 1.0
11 popularidade 1.0
```

**Caso 2 — produto inexistente (RF-02).**

```bash
curl -s -w ' HTTP %{http_code}\n' http://127.0.0.1:3001/api/produtos/999/recomendados
```

Resultado esperado:

```
{"erro":"Produto 999 não encontrado"} HTTP 404
```

**Caso 3 — `limite` inválido (RF-05).**

```bash
curl -s -w ' HTTP %{http_code}\n' "http://127.0.0.1:3001/api/produtos/1/recomendados?limite=50"
```

Resultado esperado:

```
{"erro":"limite deve ser um inteiro entre 1 e 20"} HTTP 400
```

**Caso 4 — lentidão vira 503 em 2 segundos (RF-08).**

```bash
curl -s -w ' HTTP %{http_code} em %{time_total}s\n' -H 'X-Simular-Falha: lentidao' http://127.0.0.1:3001/api/produtos/1/recomendados
```

Resultado esperado (o tempo fica perto de 2 s):

```
{"erro":"Recomendações indisponíveis no momento"} HTTP 503 em 2.0…s
```

**Caso 5 — recomendação pelo histórico de compra (RF-06).** A usuária 1 (Camila,
`comprador@origem.com.br`) comprou os produtos 3, 1, 4 e 11 nos pedidos do seed.

```bash
curl -s -H 'X-Usuario-Id: 1' "http://127.0.0.1:3001/api/usuarios/1/recomendados?limite=5" | python3 -c 'import json,sys; [print(r["id"], r["criterio"], r["score"]) for r in json.load(sys.stdin)["recomendacoes"]]'
```

Resultado esperado:

```
5 historico-tecnica 3
7 historico-tecnica 3
9 historico-categoria 1
12 historico-categoria 1
2 popularidade 0.7067
```

**Caso 6 — sem autenticação e com outro usuário (RF-06).**

```bash
curl -s -w ' HTTP %{http_code}\n' http://127.0.0.1:3001/api/usuarios/1/recomendados
curl -s -w ' HTTP %{http_code}\n' -H 'X-Usuario-Id: 2' http://127.0.0.1:3001/api/usuarios/1/recomendados
```

Resultado esperado:

```
{"erro":"Autenticação necessária"} HTTP 401
{"erro":"Só é possível consultar as próprias recomendações"} HTTP 403
```

**Caso 7 — log e métricas por critério (RF-03, RNF-07).** Depois dos casos acima:

```bash
curl -s http://127.0.0.1:3001/api/recomendacoes/metricas
```

Resultado esperado: `total` maior que zero e a contagem por critério. Os números crescem a cada
chamada, porque cada recomendação devolvida vira uma linha do log. Logo após os casos 1 a 6,
numa primeira execução:

```
{"de":null,"ate":null,"total":9,"porCriterio":{"mesmo-artesao":2,"popularidade":3,"historico-tecnica":2,"historico-categoria":2}}
```

**Caso 8 — usuária sem histórico de compra (caso difícil, RF-06 + RF-07).** A compradora 13
(Lívia) existe, mas nunca comprou: em vez de erro, a lista inteira sai por popularidade.

```bash
curl -s -H 'X-Usuario-Id: 13' "http://127.0.0.1:3001/api/usuarios/13/recomendados?limite=5" | python3 -c 'import json,sys; [print(r["id"], r["criterio"], r["score"]) for r in json.load(sys.stdin)["recomendacoes"]]'
```

Resultado esperado:

```
3 popularidade 1.0
11 popularidade 1.0
4 popularidade 0.7667
1 popularidade 0.7367
2 popularidade 0.7067
```

**Funções de acesso e banco fora do ar.** `uv run python testes/test_dados.py` (dentro de
`ia-recomendacao/`) testa as funções de `dados.py` duas vezes: lendo o banco e lendo o
retrato `dados/catalogo.json`, com o banco desligado de propósito. Cobre produto, usuário e
avaliação inexistentes, usuário sem compras e pedido cancelado.

### Integração com o frontend

Desde a U2 o site não chama mais o módulo direto: ele pede à API, e a API chama o módulo com o usuário
do login (`docs/api.md`, seções 7b e 7c). Com tudo rodando (ver [Como executar tudo localmente](#como-executar-tudo-localmente)):

- em `http://localhost:3000/produtos/1`, "Peças relacionadas" mostra 5, 9 e 3 vindos do módulo, e
  as avaliações ganham o selo de sentimento;
- na página inicial, logado como `comprador@origem.com.br`, aparece **"Escolhidos para você"**, montada
  pelo histórico de compra; um comprador recém-criado vê os mais populares;
- no admin (`admin@origem.com.br`), a seção **Classificação (IA)** mostra a categoria sugerida para cada peça.

Cada chamada vira uma linha em `ia-recomendacao/logs/uso_dados.jsonl` com `quem_chamou: backend`. Com o
módulo desligado o site continua abrindo: as recomendações viram os mais vendidos e o selo de
sentimento some.

---

## FCCPD — Unidade 1: concorrência no checkout e fila assíncrona

Entrega de Fundamentos de Computação Concorrente, Paralela e Distribuída, construída sobre
este mesmo projeto. Comece por aqui:

| | |
|---|---|
| **[RELATORIO.md](RELATORIO.md)** | o relatório da entrega: pontos concorrentes, técnica escolhida e alternativas descartadas, desenho da fila, metodologia dos testes e uso de IA |
| **[evidencias/](evidencias/)** | as saídas reais dos testes, com um [README](evidencias/README.md) explicando cada arquivo |
| **[backend/](backend/)** | a API, o worker em processo separado e os scripts que geraram as evidências |

Resultado em uma linha: 50 compras simultâneas de um produto com 10 unidades →
**10 aprovadas, 40 rejeitadas, estoque final 0**. A versão ingênua, com o mesmo teste,
aprovou as 50 e perdeu 41 escritas.

Para rodar (precisa de Docker e Node 20+):

```bash
cd backend
docker compose up -d      # PostgreSQL com schema e dados de teste
npm install
npm run api               # terminal 1 — http://localhost:3333
npm run worker            # terminal 2 — consumidor da fila
npm run evidencias        # regrava a pasta evidencias/ do zero
npm test                  # testes automatizados da API (U2)
```

> **Já tinha subido o banco antes da U2?** O PostgreSQL só executa os arquivos de `backend/sql/`
> quando o volume está vazio. Para receber as tabelas/colunas novas (`01b_extensoes_u2.sql`) e o
> catálogo novo (`02_seed.sql`), recrie o banco uma vez: `docker compose down -v && docker compose up -d`
> (apaga os dados locais do banco).

---

## FCCPD — Unidade 2: distribuição e paralelismo

Arquitetura em serviços (API, worker com fila, módulo de IA, lote e banco), lote de recomendações
paralelo com `ProcessPoolExecutor` e benchmark sequencial × paralelo (até 4,6× com 8 processos).
Relatório, comandos e evidências em [`fccpd-u2/RELATORIO.md`](fccpd-u2/RELATORIO.md).

## Estrutura do repositório

```
frontend/        site Next.js: app/ (rotas), components/, hooks/, services/api/ (única fronteira com a API)
backend/         API Express: src/{routes,controllers,services,repositories,middlewares,config,utils},
                 worker da fila, sql/ (DDL + seed), testes/api/, openapi.yaml — ver backend/README.md
ia-recomendacao/ módulo de IA em BentoML (recomendação, sentimento, classificação, log de uso)
fccpd-u2/        FCCPD U2: lote paralelo, benchmark, relatório e evidências
evidencias/      evidências da U1 de FCCPD (concorrência e fila)
evidencias-u2/   evidências da U2 de Web (banco, recomendação, assíncrono, navegador)
RELATORIO.md     relatório da U1 de FCCPD
render.yaml      configuração do Render (API e IA)
docs/
  arquitetura.md   arquitetura da U2 (site, API, worker, IA e banco)
  api.md           contrato da API REST (rotas, erros, mapeamento banco ↔ API)
  deploy.md        passo a passo do deploy
  plano-u2.md      plano de implementação da U2
  uso-de-ia.md     registro do uso de IA generativa
  refatoracao/     desafio de code smells (Requisitos)
  sdd/             SDD oficial do módulo de recomendação
  Origem_DDL.md    modelagem do banco de dados
```

## Fluxos implementados

Todos com dados do banco, pela API:

- **Vitrine** (`/`) — destaques, filtro por categoria, mestres artesãos e "Escolhidos para você" (IA).
- **Catálogo** (`/produtos`) — busca sem acento por nome, artesão ou técnica, filtros de região e
  categoria (no banco), preço máximo e disponibilidade; ordenação por preço.
- **Produto** (`/produtos/[id]`) — galeria, peças relacionadas (IA), avaliações com o sentimento de cada
  comentário (IA) e envio de avaliação pelo comprador.
- **Artesãos** (`/artesoes`, `/artesoes/[id]`) — perfil com avaliação média, vendas e peças calculadas.
- **Carrinho** (`/carrinho`) — salvo no servidor para o comprador logado; o do visitante é juntado no login.
- **Checkout** (`/checkout`) — revalida o estoque, cria o pedido pelo checkout seguro (sem vender além do
  estoque), pagamento simulado; o pedido enfileira as notificações do comprador e das artesãs.
- **Login / Cadastro** (`/login`, `/cadastro`) — sessão por cookie httpOnly, restaurada ao recarregar.
- **Meus pedidos** (`/pedidos`, `/pedidos/[codigo]`).
- **Painel do artesão** (`/painel-artesao`) — indicadores do banco, catálogo (criar, editar e desativar
  produto), pedidos recebidos com mudança de status (cancelar devolve o estoque) e estoque.
- **Painel administrativo** (`/admin`) — indicadores da plataforma, aprovação de artesãos, artesãos,
  pedidos e a classificação automática das peças (IA).

## Autenticação e perfis de acesso

Três perfis, mutuamente exclusivos:

- **Comprador** e **artesão** têm cadastro público (`/cadastro`). Todo artesão nasce **pendente** e só
  aparece na vitrine depois que um administrador aprova.
- **Administrador** é a equipe do Origem: não há cadastro público desse perfil.

Senhas com bcrypt; login devolve um JWT de 8 h que também vai no cookie `origem_sessao` (`HttpOnly`,
`SameSite=Lax`, `Secure` em produção). O site nunca guarda o token, e cada rota protegida confere o
perfil carregado do banco a cada requisição.

## Status de publicação

URL do deploy da U1 (frontend com Fake API): https://marketplace-da-economia-criativa.vercel.app

**U2:** o passo a passo do deploy completo (banco no Neon, API e IA no Render, site na Vercel com o
rewrite `/api`) e as URLs publicadas ficam em [`docs/deploy.md`](docs/deploy.md).
