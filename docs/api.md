# Contrato da API REST — Origem (Unidade 2)

Este documento é o **acordo entre backend e frontend** para a troca da Fake API
(`frontend/src/services/api/*.service.ts`) pelo backend real
(`backend/`, Node/Express + PostgreSQL). Backend e frontend podem trabalhar em
paralelo a partir dele: o backend implementa as rotas, o frontend troca um
service por vez.

- **Base URL:** `http://localhost:3333` em desenvolvimento (`PORT` em `backend/.env.example`).
  No frontend: variável `NEXT_PUBLIC_API_URL`.
- **CORS:** só as origens de `CORS_ORIGEM` (padrão `http://localhost:3000`). Em produção, incluir a URL da Vercel.
- **Formato:** JSON (UTF-8) nos dois sentidos. Datas em ISO 8601 UTC (`2026-08-20T14:32:00.000Z`).
  Valores em reais como `number` (`285` ou `35.9`).
- **Recomendações** não passam por aqui: são servidas pelo módulo de IA
  (`ia-recomendacao/`, porta 3001), com contrato próprio em
  [`docs/modulo-recomendacao/design.md`](modulo-recomendacao/design.md).
- **Banco:** `backend/sql/01_schema.sql` (DDL da equipe) + `01b_extensoes_u2.sql`
  (colunas e tabelas acrescentadas para a U2) + `02_seed.sql` (o mesmo catálogo
  dos mocks, mesmos ids de produto). Mapeamento campo a campo na seção 9.
  Quem já tinha o banco do FCCPD precisa recriá-lo uma vez: `docker compose down -v && docker compose up -d`.

> Histórico: até a U1 este arquivo descrevia os métodos da Fake API, com uma
> coluna "endpoint proposto". Essa versão continua no histórico do Git.

### Status da implementação

Para a Fase 2 saber o que já pode trocar no frontend:

| Grupo de rotas | Etapa | Status |
|---|---|---|
| Estrutura, erros, CORS | 1.0 | ✅ pronto |
| `/auth/*`, `GET /usuarios/:id` | 1.1 | ✅ pronto |
| `/filtros`, `GET /produtos`, `/artesoes`, `GET` avaliações | 1.2 | ⏳ |
| `POST`/`PUT`/`DELETE /produtos`, `/artesoes/eu/indicadores` | 1.3 | ⏳ |
| `/carrinho/validar`, `/pedidos` | 1.4 | ⏳ (`POST /pedidos` ainda é a versão da U1) |
| `POST` avaliações, `/admin/*` | 1.5 | ⏳ |

---

## 1. Autenticação e perfis

- **JWT** (HS256) devolvido por `/auth/login` e `/auth/registrar`, válido por **8 h**.
- Enviado em toda rota protegida: `Authorization: Bearer <token>`.
- Payload do token: `{ "sub": <usuarioId>, "perfil": "comprador" | "artesao" | "administrador" }`.
  O backend **não confia no `perfil` do token**: a cada requisição autenticada ele carrega o usuário do
  banco. Por isso um token de conta apagada deixa de valer na hora, e mudar o perfil de alguém vale já.
- Segredo de assinatura em `JWT_SECRET`, obrigatório com `NODE_ENV=production`; a validade fica em `JWT_VALIDADE`.
- Senhas guardadas com **bcrypt** (custo 10) em `usuario.senha_hash`. Nunca são devolvidas.
- Login com e-mail inexistente e com senha errada dão **a mesma resposta, no mesmo tempo**: não dá
  para descobrir quem tem conta.
- Datas: o banco guarda em UTC e a API devolve em ISO com `Z` (ex.: `2025-02-10T12:00:00.000Z`).
- Contas de demonstração do seed: todas com senha `origem123`
  (`comprador@origem.com.br`, `maria@origem.com.br`, `joao@origem.com.br`, `ana@origem.com.br`,
  `sebastiao@origem.com.br`, `admin@origem.com.br`).

Legenda da coluna **Acesso** nas tabelas abaixo:

| Valor | Significado |
|---|---|
| público | não precisa de token |
| logado | qualquer usuário com token válido |
| comprador / artesão / admin | token com esse perfil |
| dono | o recurso pertence ao usuário do token (ex.: o produto é do artesão logado) |

## 2. Erros

Todo erro responde com o mesmo corpo — o formato que o backend já usa desde o FCCPD U1:

```json
{ "erro": "ESTOQUE_INSUFICIENTE", "mensagem": "Estoque insuficiente para o produto 8." }
```

`mensagem` é legível e pode ir direto para `<ErrorState mensagem={...} />`.

| HTTP | `erro` | Quando |
|---|---|---|
| 400 | `CORPO_INVALIDO` | campo obrigatório ausente, tipo errado, nota fora de 1–5, transição de status inválida |
| 401 | `NAO_AUTENTICADO` | rota protegida sem token, ou token inválido/expirado |
| 401 | `CREDENCIAIS_INVALIDAS` | e-mail ou senha errados no login (mensagem genérica, não diz qual dos dois) |
| 403 | `SEM_PERMISSAO` | perfil errado, ou recurso de outro usuário |
| 404 | `NAO_ENCONTRADO` | id/código inexistente |
| 409 | `EMAIL_EM_USO` | cadastro com e-mail já existente |
| 409 | `ESTOQUE_INSUFICIENTE` | checkout sem estoque (vem do checkout seguro da U1) |
| 409 | `AVALIACAO_DUPLICADA` | o comprador já avaliou este produto |
| 404 | `NAO_ENCONTRADO` | rota inexistente (também em JSON, nunca a página HTML padrão do Express) |
| 400 | `CORPO_INVALIDO` | corpo que não é JSON válido |
| 500 | `ERRO_INTERNO` | qualquer outra falha. A mensagem é sempre "Erro interno no servidor."; o detalhe vai só para o log |

Implementação: `backend/src/middlewares/erros.js`. As rotas lançam `new ErroApi(status, codigo, mensagem)`
e o tratador central monta a resposta. Os erros do FCCPD U1 (`PRODUTO_INEXISTENTE`, `VIOLACAO_CHECK_ESTOQUE`,
`DEADLOCK_DETECTADO`) continuam com os mesmos códigos.

## 3. Objetos devolvidos

São os mesmos tipos de `frontend/src/types/`, para que as telas não mudem.
Diferenças em relação à Fake API estão marcadas com ⚠️.

**`Usuario`** — `types/usuario.ts`
```json
{ "id": 2, "nome": "Maria das Graças Silva", "email": "maria@origem.com.br",
  "perfil": "artesao", "avatarUrl": "https://...", "artesaoId": 2,
  "criadoEm": "2024-11-03T12:00:00.000Z" }
```
⚠️ `artesaoId` agora é **igual ao `id` do usuário** (no banco, `artesao.usuario_id` é a chave do artesão).
Na Fake API a Maria era usuário 2 / artesão 1; agora é usuário 2 / artesão 2. Nenhuma tela usa id fixo, então nada quebra.

**`Produto`** — `types/produto.ts`
```json
{ "id": 1, "nome": "Cangaceiro de Barro — Lampião e Maria Bonita", "descricao": "...",
  "preco": 285, "precoOriginal": 340,
  "imagem": "https://...", "imagens": ["https://...", "https://..."],
  "categoria": "Cerâmica", "tecnica": "Cerâmica", "regiao": "Agreste",
  "artesao": "Maria das Graças Silva", "artesaoId": 2, "estoque": 3, "status": "ativo" }
```
`precoOriginal` só aparece quando existe. `imagem` = primeira de `imagens`.

**`Artesao`** — `types/artesao.ts`
```json
{ "id": 2, "usuarioId": 2, "nome": "Maria das Graças Silva", "nomeAtelie": "Ateliê Alto do Moura",
  "cidade": "Caruaru", "regiao": "Agreste", "biografia": "...",
  "fotoUrl": "https://...", "capaUrl": "https://...",
  "tecnicas": ["Cerâmica", "Barro Cozido", "Alto do Moura"],
  "avaliacaoMedia": 4.5, "totalVendas": 1, "totalProdutos": 3, "desde": 1993, "aprovado": true }
```
⚠️ `avaliacaoMedia`, `totalVendas` e `totalProdutos` são **calculados** (média das avaliações dos
produtos do artesão, nº de pedidos não cancelados com item dele, nº de produtos ativos). Na Fake API
eram números fixos (ex.: 248 vendas), então os valores exibidos vão mudar.

**`Avaliacao`** — `types/avaliacao.ts`
```json
{ "id": 1, "produtoId": 1, "usuarioNome": "Camila Torres", "nota": 5,
  "comentario": "Peça linda...", "criadoEm": "2026-08-22T10:00:00.000Z" }
```

**`Pedido`** — `types/pedido.ts`
```json
{ "codigo": "PE-4821", "data": "2026-08-20T14:32:00.000Z", "clienteEmail": "comprador@origem.com.br",
  "enderecoEntrega": "Rua das Flores, 120 — ...",
  "itens": [ { "produto": { /* Produto */ }, "quantidade": 1 } ],
  "subtotal": 735, "frete": 0, "total": 735, "status": "entregue",
  "previsaoEntrega": "2026-08-28T00:00:00.000Z",
  "pagamento": { "metodo": "cartao", "status": "aprovado", "valor": 735,
                 "processadoEm": "2026-08-20T14:32:00.000Z" } }
```
Em `itens[].produto.preco` vai o **preço pago** (`item_pedido.preco_unitario`), não o preço atual do produto.

## 4. Rotas — autenticação e usuários

| Método e rota | Acesso | Corpo | Resposta | Substitui |
|---|---|---|---|---|
| `POST /auth/registrar` | público | `{ nome, email, senha, perfil, regiao? }` | **201** `{ token, usuario }` | `usuariosService.registrar` |
| `POST /auth/login` | público | `{ email, senha }` | **200** `{ token, usuario }` | `usuariosService.login` |
| `GET /auth/eu` | logado | — | **200** `Usuario` | (novo) restaura a sessão ao recarregar a página |
| `GET /usuarios/:id` | dono ou admin | — | **200** `Usuario` | `usuariosService.buscarPorId` |

Regras de `POST /auth/registrar`:
- `perfil` só pode ser `comprador` ou `artesao` → senão **400**. Administrador nunca se autocadastra.
- `nome`: 2 a 150 caracteres (espaços nas pontas são removidos).
- `email`: formato válido, até 180 caracteres. É **salvo em minúsculas** e o login não diferencia
  maiúsculas. E-mail já usado → **409 `EMAIL_EM_USO`**, inclusive em dois cadastros simultâneos.
- `senha`: 6 a 72 caracteres (o bcrypt ignora o que passa de 72 bytes; recusamos em vez de cortar).
- `perfil: "artesao"` exige `regiao` (um nome de `GET /filtros`), porque `artesao.regiao_id` é obrigatório
  no banco. ⚠️ **O formulário de cadastro do frontend precisa ganhar esse campo.**
  A região é comparada sem diferenciar maiúsculas (`agreste` = `Agreste`); região inexistente → **400**.
  Usuário e artesão são criados **na mesma transação**: se algo falhar, nenhum dos dois fica gravado.
  O registro de artesão nasce com `aprovado: false` e `nomeAtelie` = `nome`.

Regra de `GET /usuarios/:id`: quem não é admin e pede outro id recebe **403**, exista ou não o
usuário. Assim ninguém descobre quais ids existem comparando 403 com 404.

## 5. Rotas — catálogo

| Método e rota | Acesso | Corpo / query | Resposta | Substitui |
|---|---|---|---|---|
| `GET /filtros` | público | — | **200** `{ regioes: string[], categorias: string[], tecnicas: string[] }` | (novo) opções dos filtros e do formulário de produto |
| `GET /produtos` | público | `?busca=&regiao=&tecnica=&categoria=&artesaoId=` | **200** `Produto[]` | `produtosService.listarTodos` e `filtrar` |
| `GET /produtos/:id` | público | — | **200** `Produto` | `produtosService.buscarPorId` |
| `POST /produtos` | artesão | `NovoProduto` | **201** `Produto` | `produtosService.criar` |
| `PUT /produtos/:id` | artesão dono | `NovoProduto` | **200** `Produto` | `produtosService.atualizar` |
| `DELETE /produtos/:id` | artesão dono | — | **204** | `produtosService.remover` |
| `GET /produtos/:id/avaliacoes` | público | — | **200** `Avaliacao[]` (mais recentes primeiro) | `avaliacoesService.listarPorProduto` |
| `POST /produtos/:id/avaliacoes` | comprador | `{ nota, comentario }` | **201** `Avaliacao` | `avaliacoesService.criar` |
| `GET /artesoes` | público | — | **200** `Artesao[]` (só aprovados) | `artesoesService.listarTodos` |
| `GET /artesoes/:id` | público | — | **200** `Artesao` | `artesoesService.buscarPorId` |

Regras:
- **Listagem pública** (`GET /produtos`) mostra só produtos `ativo` de artesãos **aprovados**.
  Exceção: com `artesaoId` igual ao do artesão logado, mostra também os inativos dele (painel do artesão).
- **Filtros** comparam pelo nome (`regiao=Agreste`). O valor `Todas` (usado pelos selects do frontend) é ignorado.
- **`busca`** procura em nome do produto, nome do artesão e técnica, sem diferenciar maiúsculas e acentos
  (`unaccent` + `ILIKE`). Com o catálogo pequeno isso é uma varredura sequencial e basta; o índice
  trigram `idx_produto_nome_trgm` (sobre `nome` puro) **não** é usado por essa expressão. Criar um
  índice adequado e medir com `EXPLAIN ANALYZE` é tarefa do BD-U2.
- **`POST`/`PUT /produtos`**: `artesaoId` vem do **token** (o do corpo é ignorado: ninguém publica em
  nome de outro artesão). `categoria`, `tecnica` e `regiao` são nomes de `GET /filtros` → senão **400**.
  `imagem` vira a imagem de ordem 0 em `produto_imagem`.
- **`DELETE /produtos/:id`** é exclusão lógica (`status = 'inativo'`): o produto pode estar em
  `item_pedido` de pedidos antigos, e a chave estrangeira impede apagar a linha.
- **Avaliação**: `usuarioNome` vem do token. Uma por comprador por produto (**409** na segunda).

## 6. Rotas — carrinho e pedidos

O carrinho **continua no navegador** (Zustand + localStorage), como na U1. As tabelas `carrinho` e
`item_carrinho` do DDL ficam para uma evolução futura (carrinho entre dispositivos).

| Método e rota | Acesso | Corpo | Resposta | Substitui |
|---|---|---|---|---|
| `POST /carrinho/validar` | público | `{ itens: [{ produtoId, quantidade }] }` | **200** `ProblemaEstoque[]` (vazio = tudo certo) | `carrinhoService.validarEstoque` |
| `POST /pedidos` | comprador | `{ enderecoEntrega, metodoPagamento, itens: [{ produtoId, quantidade }] }` | **201** `Pedido` | `pedidosService.criarPedido` |
| `GET /pedidos` | logado | — | **200** `Pedido[]` (mais recentes primeiro) | `listarPorCliente`, `listarPorArtesao`, `listarTodos` |
| `GET /pedidos/:codigo` | comprador dono, artesão com item no pedido, ou admin | — | **200** `Pedido` | `pedidosService.buscarPorCodigo` |
| `PATCH /pedidos/:codigo/status` | artesão com item no pedido | `{ status }` | **200** `Pedido` | `pedidosService.atualizarStatus` |

Regras:
- **`POST /pedidos` reaproveita o checkout seguro do FCCPD U1** (`src/checkout-seguro.js`: `UPDATE`
  condicional + ordenação por `produto_id` contra deadlock). O cliente manda só `produtoId` e
  `quantidade`: preço vem do banco (o navegador nunca dita o preço). Frete: grátis a partir de
  R$ 400 de subtotal, senão R$ 35,90 (mesma regra de `useCarrinho`). Previsão: data do pedido + 8 dias.
  Pagamento simulado, sempre `aprovado`, status inicial do pedido `confirmado`.
  ⚠️ O comprador vem do **token**; na U1 vinha no corpo (`compradorId`). Os scripts de teste do FCCPD
  precisam fazer login antes (tarefa da Fase 1).
- **`GET /pedidos`** decide o escopo pelo perfil do token — o frontend não precisa (nem pode) escolher:
  comprador → os dele; artesão → os que têm item dele; admin → todos.
- **Transições de status** (iguais a `obterProximosStatus`):
  `pendente → confirmado | cancelado`, `confirmado → em_producao | cancelado`,
  `em_producao → enviado | cancelado`, `enviado → entregue`. Outras → **400**.
  Cancelar **devolve o estoque** dos itens na mesma transação.

## 7. Rotas — indicadores e administração

| Método e rota | Acesso | Resposta | Fonte no banco | Substitui |
|---|---|---|---|---|
| `GET /artesoes/eu/indicadores` | artesão | `{ totalVendido, totalPedidos, pedidosPendentes }` | `vw_indicadores_artesao` | cálculo local do painel do artesão (HU13) |
| `GET /admin/indicadores` | admin | `{ totalUsuarios, produtosAtivos, totalPedidos, totalVendas }` | `vw_indicadores_admin` | cálculo local do painel admin (HU14) |
| `GET /admin/artesoes/pendentes` | admin | `Artesao[]` | `artesao.aprovado = false` | `artesoesService.listarPendentes` |
| `PATCH /admin/artesoes/:id/aprovar` | admin | `Artesao` | `aprovado = true` | `artesoesService.aprovar` |
| `DELETE /admin/artesoes/:id` | admin | **204** | apaga usuário + artesão (cascade) | `artesoesService.rejeitar` |

`DELETE /admin/artesoes/:id` só vale para cadastro **pendente**; artesão aprovado → **400**.

## 8. Rotas do FCCPD U1 que continuam

Não fazem parte do produto, mas ficam no ar para os testes e evidências da U1:
`GET /saude`, `POST /pedidos-naive`, `POST /produtos/:id/imagens` (fila), `GET /fila`,
`POST /teste/reiniciar`, `POST /teste/fila`. As rotas `/teste/*` só devem existir em desenvolvimento.
Estão em `backend/src/rotas/laboratorio.js`.

`POST /teste/reiniciar` apaga os pedidos e a fila e recoloca o estoque de todos os produtos. Das
imagens, apaga **só as que passaram pela fila** (status diferente de `disponivel` ou com hash gravado
pelo worker): as fotos do catálogo ficam.

## 9. Mapeamento banco ↔ API

Campos que não são uma coluna direta:

| Campo da API | Origem no banco |
|---|---|
| `Usuario.artesaoId` | `usuario.id` quando `perfil = 'artesao'` |
| `Produto.categoria` / `tecnica` / `regiao` | `JOIN` em `categoria`, `tecnica`, `regiao` (campo `nome`) |
| `Produto.artesao` | `usuario.nome` do dono (`produto.artesao_id`) |
| `Produto.imagens` / `imagem` | `produto_imagem.chave_armazenamento` ordenado por `ordem` |
| `Artesao.id`, `usuarioId` | `artesao.usuario_id` |
| `Artesao.nome` | `usuario.nome` |
| `Artesao.biografia` | `artesao.descricao` |
| `Artesao.cidade` / `regiao` | `regiao.polo` / `regiao.nome` |
| `Artesao.desde` | `artesao.ano_inicio` |
| `Artesao.tecnicas` | `artesao_tecnica` → `tecnica.nome` |
| `Artesao.avaliacaoMedia` | `AVG(avaliacao_produto.nota)` dos produtos do artesão (0 se não houver) |
| `Artesao.totalVendas` | pedidos não cancelados com item do artesão |
| `Artesao.totalProdutos` | produtos `ativo` do artesão |
| `Avaliacao.usuarioNome` | `usuario.nome` do autor |
| `Pedido.data` | `pedido.criado_em` |
| `Pedido.clienteEmail` | `usuario.email` do comprador |
| `Pedido.subtotal` | `valor_total - frete` (não é coluna, para não guardar o mesmo dado duas vezes) |
| `Pedido.total` | `pedido.valor_total` |
| `Pedido.pagamento` | tabela `pagamento` (1:1 com o pedido) |

## 10. Uso no frontend (Fase 2)

1. `client.ts` ganha um `apiFetch(caminho, opções)` que monta a URL com `NEXT_PUBLIC_API_URL`, envia o
   token guardado pelo `useAuth` e transforma respostas de erro em `ApiError(mensagem)`.
   As telas continuam tratando `ApiError` como hoje.
2. Cada `*.service.ts` mantém **as mesmas assinaturas** e troca o corpo para chamar a rota
   correspondente (coluna "Substitui"). Exceções que mudam a assinatura:
   `pedidosService.listarPorCliente/listarPorArtesao/listarTodos` viram chamadas a `GET /pedidos`
   (o argumento passa a ser ignorado); `usuariosService.login/registrar` passam a receber
   `{ token, usuario }` e o `useAuth` guarda o token.
3. Quando o último service for migrado, `frontend/src/mocks/` e `delay()` podem ser apagados.
