# Origem — Marketplace da Economia Criativa de Pernambuco

Aplicação web que conecta artesãos e empreendedores criativos de Pernambuco a compradores de
todo o país. Projeto Integrador. O repositório reúne o **frontend responsivo com Fake API**
(Avaliação 1), o **backend da entrega de FCCPD** (concorrência no checkout e fila assíncrona) e
o **módulo de recomendação em BentoML** da disciplina de IA.

**Equipe:** Ana Beatriz Lopes, Everton Nunes, Drielly Santiago e Thainá Pontes.

---

## IA — AV2: mockup do módulo de recomendação (Trilha A, BentoML)

| | |
|---|---|
| **Grupo** | [A PREENCHER: nome do grupo] |
| **Integrantes** | Ana Beatriz Lopes, Everton Nunes Batista, Drielly Santiago e Thainá Pontes — turma [A PREENCHER] |
| **Projeto** | Origem — Marketplace da Economia Criativa de Pernambuco |
| **Módulo da AV1** | Recomendação de produtos (similaridade de atributos + histórico + popularidade) |
| **Código** | [`ia-recomendacao/`](ia-recomendacao/) — detalhes de dados, regras e decisões no [README do módulo](ia-recomendacao/README.md) |

O serviço sobe em `http://127.0.0.1:3001` e expõe as rotas REST especificadas na AV1. O
catálogo é sintético (10 peças da Fake API do frontend + 1 peça inativa), e o frontend do
Origem já consome o módulo na página de detalhe do produto (ver [Integração com o
frontend](#integração-com-o-frontend)).

### Como instalar e subir

Pré-requisitos: [uv](https://docs.astral.sh/uv/) (instala o Python 3.13 sozinho, se faltar),
`curl` e `python3`. O [just](https://github.com/casey/just) é opcional — cada atalho abaixo
mostra o comando equivalente.

```bash
git clone https://github.com/thainapontes/Marketplace-da-economia-criativa.git
cd Marketplace-da-economia-criativa/ia-recomendacao
uv sync                    # instala bentoml e fastapi num .venv local
just treino                # = uv run python treino.py  (grava o modelo no store do BentoML)
just serve                 # = uv run bentoml serve service:RecomendadorOrigem --port 3001
```

Deixe o `just serve` aberto e use outro terminal para os testes.

### Requisitos da AV1 → endpoint

| RF / RNF da AV1 | Onde está no mockup |
|---|---|
| **RF-01** Similaridade de atributos (artesão 3, técnica 2, região 1) | `GET /api/produtos/{id}/recomendados` — `recomendador.similaridade` |
| **RF-02** API REST com 200 / 404 | `GET /api/produtos/{id}/recomendados` |
| **RF-03** Registro em `recomendacao_log` | cada resposta grava em `ia-recomendacao/logs/recomendacao_log.jsonl` (simula a tabela) |
| **RF-04** Elegibilidade (sem o próprio produto, sem inativo, sem estoque zero) | `recomendador.elegivel` — vale para todas as rotas |
| **RF-05** `limite` (padrão 4 / 8; fora de 1–20 → 400) | parâmetro `?limite=` das duas rotas |
| **RF-06** Personalizada por histórico de compra (401 / 403) | `GET /api/usuarios/{id}/recomendados` com header `X-Usuario-Id` (login simulado) |
| **RF-07** Popularidade (vendas + nota média) como complemento | `recomendador._montar` — critério `popularidade` |
| **RF-08** Falha ou mais de 2 s → 503 `{ "erro": ... }` | timeout de 2 s nas rotas; header `X-Simular-Falha: erro` ou `lentidao` provoca a falha |
| **RNF-06** No máximo 2 produtos do mesmo artesão por lista | `recomendador.MAX_POR_ARTESAO` |
| **RNF-07** Quantidade de recomendações por critério num período | `GET /api/recomendacoes/metricas?de=AAAA-MM-DD&ate=AAAA-MM-DD` |

### Casos de teste

Com o serviço no ar (`just serve`), copie e cole cada comando. Os resultados abaixo são os
obtidos com o catálogo do repositório. Para rodar todos de uma vez e ver OK/FALHOU:
`just testes` (= `bash testes/casos.sh`, dentro de `ia-recomendacao/`).

**Caso 1 — caminho feliz: peças relacionadas ao produto 1 (RF-01, RF-04, RF-07).** O produto 1
é um cangaceiro de barro da artesã 1. Só os produtos 5 e 9 têm algo em comum com ele (o 11
também, mas está inativo), então a lista é completada com os mais populares.

```bash
curl -s "http://127.0.0.1:3001/api/produtos/1/recomendados?limite=4" | python3 -c 'import json,sys; [print(r["id"], r["criterio"], r["score"]) for r in json.load(sys.stdin)["recomendacoes"]]'
```

Resultado esperado (id, critério, score):

```
5 mesmo-artesao 6
9 mesmo-artesao 4
3 popularidade 0.8833
4 popularidade 0.75
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
`comprador@origem.com.br`) comprou os produtos 1, 3 e 4 na Fake API.

```bash
curl -s -H 'X-Usuario-Id: 1' "http://127.0.0.1:3001/api/usuarios/1/recomendados?limite=5" | python3 -c 'import json,sys; [print(r["id"], r["criterio"], r["score"]) for r in json.load(sys.stdin)["recomendacoes"]]'
```

Resultado esperado:

```
5 historico-tecnica 3
7 historico-tecnica 3
9 historico-categoria 1
2 popularidade 0.54
6 popularidade 0.15
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
{"de":null,"ate":null,"total":9,"porCriterio":{"mesmo-artesao":2,"popularidade":4,"historico-tecnica":2,"historico-categoria":1}}
```

### Integração com o frontend

O frontend do Origem chama o módulo na página de detalhe do produto
(`frontend/src/services/api/recomendacoes.service.ts`). Para ver funcionando:

```bash
# terminal 1 — módulo de IA (dentro de ia-recomendacao/)
just serve
# terminal 2 — frontend
cd frontend
cp .env.example .env.local      # NEXT_PUBLIC_RECOMENDACAO_URL=http://localhost:3001
npm install
npm run dev
```

Em `http://localhost:3000/produtos/1`, a seção de relacionados mostra os produtos 5, 9 e 3
vindos do módulo, e cada exibição vira linhas novas em `ia-recomendacao/logs/recomendacao_log.jsonl`.
Se o módulo for desligado, a mesma página continua abrindo e mostra só 5 e 9, do cálculo local
(RF-08: o frontend trata 503 e timeout como "sem recomendações do módulo" e não exibe erro). Sem
`.env.local` — como no deploy da Vercel — o frontend usa apenas o cálculo local.

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
```

---

## Como executar o projeto (frontend, Avaliação 1)

Pré-requisitos: Node.js 20+ e npm.

```bash
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:3000`. Para gerar a build de produção: `npm run build && npm start`
(também dentro de `frontend/`).

### Contas de demonstração (login)

Todas usam a senha **`origem123`**:

| Perfil | E-mail |
|---|---|
| Comprador | `comprador@origem.com.br` |
| Artesão | `maria@origem.com.br` |
| Administrador | `admin@origem.com.br` |

Também é possível criar uma conta nova em `/cadastro` (Comprador ou Artesão — ver
"Autenticação e perfis de acesso" abaixo).

## Estrutura do repositório

```
frontend/   aplicação Next.js (App Router) — o entregável desta avaliação
backend/    API Node/Express + PostgreSQL da entrega de FCCPD (checkout concorrente e fila assíncrona)
ia-recomendacao/  módulo de recomendação em BentoML (AV2 de IA)
evidencias/ saídas reais dos testes de concorrência e da fila (FCCPD)
RELATORIO.md  relatório da entrega de FCCPD
docs/       documentação do projeto
  Origem_DDL.md    modelagem do banco de dados (referência para a Avaliação 2)
  arquitetura.md   arquitetura em camadas do frontend e estratégia de integração futura
  api.md           contratos de todos os serviços da Fake API
  uso-de-ia.md     registro do uso de IA generativa no desenvolvimento
```

## Fluxos implementados

- **Vitrine** (`/`) — destaques, filtro por categoria, mestres artesãos.
- **Catálogo** (`/produtos`) — busca por texto, região, categoria, técnica, preço máximo e
  disponibilidade em estoque; ordenação por preço.
- **Detalhe do produto** (`/produtos/[id]`) — galeria, especificações, recomendações de peças
  relacionadas (mesmo artesão/técnica/região) e **avaliações de compradores** (ver e enviar).
- **Artesãos** (`/artesoes`, `/artesoes/[id]`) — listagem e perfil público com catálogo do
  artesão.
- **Carrinho** (`/carrinho`) — adicionar, remover, alterar quantidade, cálculo de frete/total.
- **Checkout** (`/checkout` → `/checkout/sucesso`) — endereço de entrega, forma de pagamento
  simulada (cartão/Pix/boleto), confirmação com código de pedido gerado e limpeza do carrinho.
- **Login / Cadastro** (`/login`, `/cadastro`) — autenticação simulada e criação de conta como
  comprador ou artesão.
- **Meus pedidos** (`/pedidos`) — histórico de pedidos do comprador autenticado.
- **Painel do artesão** (`/painel-artesao`) — visão geral, catálogo (editar/remover produto),
  publicação de produto, pedidos recebidos, controle de estoque.
- **Painel administrativo** (`/admin`) — indicadores da plataforma, fila de aprovação de novos
  artesãos, listagem de artesãos e pedidos.

## Autenticação e perfis de acesso

Existem três perfis (`comprador`, `artesao`, `administrador`), mutuamente exclusivos:

- **Comprador** e **artesão** têm cadastro público (`/cadastro`). Todo cadastro de artesão
  nasce **pendente de aprovação** e só aparece na vitrine depois que um administrador aprova
  (painel `/admin`) — evita que qualquer pessoa se autopromova a vendedor sem revisão.
- **Administrador** é a própria equipe do Origem: não existe tela pública para virar admin,
  são contas provisionadas internamente (por isso só há uma conta demo desse perfil).

Login/sessão são simulados nesta fase (sem hash de senha nem JWT) — ver limitações abaixo.

## Fake API — como foi estruturada

O frontend nunca lê dados fixos dentro de páginas ou componentes. Toda informação passa por
uma camada de serviços assíncronos que simula uma API real:

```
componente (app/ ou components/)
   → hook (hooks/*.ts)                     — expõe { dado, carregando, erro, recarregar? }
      → service (services/api/*.service.ts) — Promise + 300–500 ms de latência simulada
         → mocks/*.mock.ts                  — dados sintéticos (a única fonte "crua")
```

Recursos simulados: **produtos, artesãos, usuários, categorias, técnicas, regiões, carrinho,
pedidos, avaliações e recomendações**, além de indicadores agregados (painel admin/artesão).
Toda tela que busca dado trata os três estados obrigatórios — carregando (`LoadingState`),
erro (`ErrorState`) e vazio (`EmptyState`).

Contratos completos (parâmetros, retorno, erros e a rota REST equivalente prevista para a
Avaliação 2) estão documentados em **[`docs/api.md`](docs/api.md)**. A arquitetura em camadas
e a estratégia de transição para o backend real estão em **[`docs/arquitetura.md`](docs/arquitetura.md)**.

## Como a Fake API será substituída pelo backend real (Avaliação 2)

Cada arquivo em `services/api/` é a única fronteira entre a interface e a fonte de dados.
Na Avaliação 2, o corpo de cada função passa a chamar `fetch("/api/...")` contra o backend
Node/Express + PostgreSQL (modelado em `docs/Origem_DDL.md`) em vez de ler `mocks/`. Como
componentes e páginas só conversam com `hooks/`, e os hooks só conversam com `services/`,
**nenhuma tela precisa ser reescrita** — a troca fica isolada nessa camada. Autenticação passa
a usar sessão real (JWT/cookies) dentro de `authStore`/`useAuth`, e a Fake API para de existir.

## Limitações conhecidas desta entrega (Avaliação 1)

- Sem persistência real: os dados criados na sessão (novo produto, novo pedido, nova conta)
  vivem em memória e voltam ao estado inicial a cada reinício do servidor.
- Login sem hash de senha (todas as contas demo usam `origem123`) e sem token de sessão real.
- Recomendação de produtos usa similaridade simples de atributos (técnica/artesão/região), não
  um modelo de IA — candidato natural para evoluir na Avaliação 2.

## Status de publicação

URL do DEPLOY: https://marketplace-da-economia-criativa.vercel.app/cadastro
