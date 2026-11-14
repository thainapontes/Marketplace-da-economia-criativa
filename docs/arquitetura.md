# Arquitetura — Origem

> As seções 1 a 5 descrevem o frontend da Avaliação 1. A seção 6 descreve o backend da U2.
> A versão completa (front, API, worker, IA e banco) vem no fechamento da U2 (`docs/plano-u2.md`, etapa L).

## 1. Visão geral

O frontend do Origem é uma aplicação Next.js 15 (App Router) + TypeScript, organizada em
camadas com responsabilidade única. Nenhuma página ou componente declara dados de produto,
artesão, usuário ou pedido diretamente: tudo passa por uma **Fake API** assíncrona que simula
o comportamento de um backend real (latência de rede incluída), preparando o terreno para a
troca por uma API HTTP de verdade na Avaliação 2 sem reescrever a interface.

```
app/                 rotas (Next.js App Router) — só compõem layout + componentes "inteligentes"
components/
  ui/                primitivos visuais sem regra de negócio (Button, Badge, Card, Input, Modal)
  feedback/          LoadingState / ErrorState / EmptyState — os 3 estados obrigatórios de toda tela
  layout/            Header, Footer, Sidebar, PublicLayout, AuthLayout
  produto/ artesao/  componentes "inteligentes" de domínio: buscam dados via hooks e renderizam
  carrinho/ pedido/  a UI (ex.: HomeView, CatalogView, ProductDetails, ArtisanProfile, CartView)
  forms/             LoginForm, RegisterForm, ProductForm — usam hooks de domínio para validar/enviar
hooks/               useProdutos, useArtesoes, useCarrinho, useAuth, usePedidos — ponte
                     entre componentes e services, expondo { dado, carregando, erro }
store/               estado global client-side (Zustand + persist/localStorage): cartStore, authStore
services/api/        "Fake API": funções assíncronas que resolvem/rejeitam Promises após um delay
mocks/                dados sintéticos (produtos, artesãos, usuários, pedidos) — a única fonte
                     de dados "crus" do sistema; nunca são importados fora de services/
types/               interfaces TypeScript compartilhadas (Produto, Artesao, Usuario, ItemCarrinho, Pedido...)
constants/           listas fixas de domínio (regiões de PE, técnicas, categorias) e rotas
utils/               formatadores puros (moeda, data, normalização de texto para busca)
```

### Fluxo de uma tela típica

```
Página (app/.../page.tsx)
   └─ Componente de domínio ("use client")         ex.: CatalogView
        └─ hook (useProdutos/useCarrinho/...)       ex.: useProdutos(filtros)
             └─ service (services/api/*.service.ts)  ex.: produtosService.filtrar(...)
                  └─ delay() + mocks/*.mock.ts        ex.: produtosMock
```

O hook sempre expõe `{ dado, carregando, erro, recarregar? }`. O componente decide o que
renderizar com base nesse estado — por isso toda tela que busca dados trata os 3 estados:

- **Carregando** → `<LoadingState />` (skeletons de grade/lista)
- **Erro** → `<ErrorState />` (mensagem + "Tentar novamente" quando aplicável)
- **Vazio** → `<EmptyState />` (busca/filtro sem resultado, carrinho vazio, sem pedidos etc.)

## 2. Fake API

Cada arquivo em `services/api/` expõe funções assíncronas que:

1. Leem/gravam num array em memória copiado de `mocks/*.mock.ts` (nunca o mock original —
   isso permite simular criação de produtos e pedidos durante a sessão sem "vazar" mutações
   para os dados semente).
2. Resolvem via `delay()` (`services/api/client.ts`), que aplica 300–500 ms de latência
   artificial — a UI portanto **precisa** tratar o estado de carregamento de verdade.
3. Rejeitam com `ApiError` para as regras de negócio conhecidas (produto/artesão/pedido não
   encontrado, credenciais inválidas, e-mail já cadastrado, estoque insuficiente no checkout),
   permitindo que os hooks capturem `.catch()` e alimentem o `<ErrorState />`.

Essa simulação de baixa estocagem no checkout (`produtosService.removerEstoque`) segue a
mesma regra descrita na seção 7 do `docs/Origem_DDL.md` (baixa condicional, sem
`SELECT` + `UPDATE` separados) — o objetivo é que a regra de negócio já nasça correta e só
precise trocar de motor de persistência (memória → PostgreSQL) na Avaliação 2.

## 3. Estado global

- **`store/cartStore.ts`** — Zustand com `persist` (localStorage, chave `origem:carrinho`).
  O carrinho sobrevive a um recarregamento de página, mas é 100% client-side.
- **`store/authStore.ts`** — Zustand com `persist` (localStorage, chave `origem:sessao`).
  Guarda o `Usuario` autenticado (comprador, artesão ou administrador) simulando uma sessão,
  sem token/JWT real — isso é assumido conscientemente como simplificação da Avaliação 1.

Nenhum componente acessa esses stores diretamente: sempre por meio de `useCarrinho()` e
`useAuth()`, para que a troca por uma sessão real (cookies HTTP-only, JWT, etc.) na
Avaliação 2 fique isolada nesses dois hooks.

## 4. Limitações conhecidas (Avaliação 1 → Avaliação 2)

| Limitação atual | Solução prevista na Avaliação 2 |
|---|---|
| Dados voltam ao estado inicial a cada `npm run build`/reinício do servidor (arrays em memória) | Persistência real em PostgreSQL, seguindo o DDL em `docs/Origem_DDL.md` |
| Login sem hash de senha, senha de demonstração única (`origem123`) | Hash (bcrypt/argon2) + JWT/refresh token no backend Node/Express |
| Sem upload real de imagem (produto novo usa uma URL informada manualmente) | Upload para storage (S3/Cloudflare R2) com fila assíncrona (`evento_assincrono`) |
| Recomendação por similaridade de atributos (técnica/artesão/região) | Modelo de recomendação real (`recomendacao_log`), possivelmente com IA |
| Sem paginação (listas pequenas o suficiente para uma Fake API) | Paginação via cursor/offset nos endpoints REST |

## 5. Por que essa divisão em camadas

- **Componentes de página nunca importam `mocks/`** — só `services/`. Isso é o que garante
  "zero hardcoded": trocar a Fake API por `fetch("/api/...")` não exige tocar em nenhuma tela.
- **Hooks isolam estado de I/O (carregando/erro) da lógica de apresentação** — um componente
  nunca escreve `useState` + `useEffect` + `fetch` manualmente; ele consome um hook de domínio.
- **`types/` é o contrato único** entre mocks, services, hooks e componentes — qualquer
  divergência de forma dos dados quebra a compilação (`strict: true`, sem `any`).

## 6. Backend (U2)

Node/Express + PostgreSQL, em `backend/`, organizado nas camadas pedidas na disciplina de Web:

```
requisição → routes → (middlewares de autenticação) → controller → service → repository → banco
                                                                                 │
                                                       Prisma (ORM) ─────────────┤
                                                       driver pg (SQL puro) ─────┘
```

| Camada | Responsabilidade | Exemplo |
|---|---|---|
| `routes/` | liga método + URL ao controller e aos middlewares | `GET /produtos` → `produtosController.listar` |
| `controllers/` | lê e valida a requisição, monta a resposta HTTP | filtro `"Todas"` é ignorado; `artesaoId` precisa ser número |
| `services/` | regras de negócio | só produto ativo de artesão aprovado aparece na vitrine |
| `repositories/` | acesso ao banco | `prisma.produto.findMany(...)` |
| `utils/mapeadores/` | registro do banco → objeto da API | `BigInt`/`Decimal` → `number`, nomes em camelCase |

**Prisma e SQL puro convivem de propósito.** O Prisma faz as consultas comuns. O SQL puro (driver `pg`)
fica onde o Prisma não alcança: o checkout seguro (`UPDATE` condicional atômico e ordem anti-deadlock)
e a fila (`FOR UPDATE SKIP LOCKED`), que são a entrega do FCCPD U1, e a busca sem acento (`unaccent`).
O schema do banco continua sendo o SQL da equipe; o `prisma/schema.prisma` é gerado dele.

Detalhes e o passo a passo para criar uma rota: [`backend/README.md`](../backend/README.md).

