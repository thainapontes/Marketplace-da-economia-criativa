# Backend do Origem

API Node/Express + PostgreSQL. O contrato das rotas está em [`docs/api.md`](../docs/api.md),
e o plano da U2 ([`docs/plano-u2.md`](../docs/plano-u2.md)) é implementá-lo etapa por etapa.

## Rodar

```bash
docker compose up -d      # PostgreSQL na porta 5434 (schema + seed automáticos)
npm install
npm run api               # http://localhost:3333
npm test                  # testes automatizados da API (criam e apagam os próprios usuários de teste)
```

Já tinha o banco de antes da U2? Recrie uma vez: `docker compose down -v && docker compose up -d`.
Variáveis de ambiente: veja `.env.example` (todas têm valor padrão para desenvolvimento).

**Usa Podman em vez de Docker** (Fedora, Bazzite)? Funciona: ative o socket
(`systemctl --user enable --now podman.socket`) e aponte o Docker CLI para ele
(`docker context create podman --docker host=unix:///run/user/$(id -u)/podman/podman.sock && docker context use podman`).
Se o banco subir vazio com `Permission denied` no log, é o SELinux: o `docker-compose.yml`
já monta a pasta `sql/` com a opção `z` para evitar isso.

## Estrutura

A API segue a divisão em camadas da disciplina de Web: cada recurso tem um arquivo em cada pasta.

```
src/
├── server.js                 só abre a porta
├── worker.js                 processo consumidor da fila (npm run worker) — FCCPD U1
├── app.js                    CORS → JSON → rotas → 404 → tratador de erros
├── config/
│   ├── env.js                variáveis de ambiente (único lugar que as lê)
│   ├── prisma.js             cliente do Prisma (ORM) — consultas do dia a dia
│   └── database.js           pool do driver pg + comTransacao — SQL puro do FCCPD U1
├── routes/        *.routes.js       só ligam URL → controller (e os middlewares da rota)
├── controllers/   *.controller.js   leem e validam a requisição, chamam o service, respondem
├── services/      *.service.js      regras de negócio (permissões, visibilidade, cálculos)
├── repositories/  *.repository.js   acesso ao banco (Prisma ou SQL)
├── middlewares/
│   ├── erros.js              ErroApi + tratadorDeErros (formato { erro, mensagem })
│   └── autenticacao.js       gerarToken, cookie de sessão, autenticar, autenticarSeHouver, exigirPerfil
└── utils/
    ├── cache.js              cache em memória com validade (vitrine e filtros; X-Cache: HIT/MISS)
    ├── validacao.js          validação de entrada (texto, e-mail, id de URL) → 400
    └── mapeadores/           registro do banco → objeto da API (Usuario, Produto, Artesao, Avaliacao)
prisma/schema.prisma          GERADO a partir do banco (npm run prisma:pull) — não editar à mão
testes/
├── api/                      testes da API: node:test + supertest (npm test)
└── teste-*.js                testes de carga do FCCPD U1 (precisam da API no ar)
```

| Recurso | routes | controller | service | repository |
|---|---|---|---|---|
| Autenticação | `auth` | `auth` | `auth` | `usuarios`, `regioes` |
| Usuários | `usuarios` | `usuarios` | `usuarios` | `usuarios` |
| Produtos e avaliações | `produtos` | `produtos` | `produtos` | `produtos`, `avaliacoes` |
| Artesãos | `artesoes` | `artesoes` | `artesoes` | `artesoes` |
| Filtros | `filtros` | `filtros` | `filtros` | `filtros` |
| Carrinho | `carrinho` | `carrinho` | `carrinho` | `carrinho`, `produtos` |
| Pedidos | `pedidos` | `pedidos` | `pedidos` (+ `checkout-seguro`) | `pedidos` (leitura e status), `pedido` (gravação, SQL da U1), `carrinho` |
| Laboratório FCCPD U1 | `laboratorio` | `laboratorio` | `laboratorio`, `checkout-seguro`, `checkout-ingenuo`, `tarefas` | `laboratorio`, `pedido`, `fila` |

### Prisma e SQL puro

- **O banco é definido pelos SQL da equipe** (`sql/`). O `prisma/schema.prisma` é só o retrato
  que o Prisma lê (`prisma db pull`). Não usamos `prisma migrate`. Mudou o SQL? Recrie o banco e
  rode `DATABASE_URL=postgres://origem:origem@localhost:5434/origem npm run prisma:pull`.
- **Prisma** nas consultas do dia a dia: cadastro, login, catálogo, artesãos, avaliações.
- **SQL puro** (driver `pg`) em três lugares, de propósito:
  1. **checkout seguro** — `UPDATE ... WHERE estoque >= qtd` (atômico) e ordem por `produto_id`
     contra deadlock: é a prova do FCCPD U1;
  2. **fila** — `SELECT ... FOR UPDATE SKIP LOCKED`, que o Prisma não tem;
  3. **busca sem acento** — `unaccent(...) ILIKE`, via `prisma.$queryRaw` (o Prisma não ignora acentos).
- Tipos: o Prisma devolve `BIGINT` como `BigInt` e `NUMERIC` como `Decimal`. Os mapeadores
  convertem para `number` antes de responder.

## Como criar uma rota nova

1. **repository** (`src/repositories/<recurso>.repository.js`): a consulta, com `prisma.<tabela>`.
2. **service** (`src/services/<recurso>.service.js`): a regra. Para responder erro, **lance**:
   `throw new ErroApi(404, "NAO_ENCONTRADO", "Produto 42 não encontrado.")`.
   Use só os códigos da seção 2 do contrato.
3. **controller** (`src/controllers/<recurso>.controller.js`): lê `req.params`/`req.query`/`req.body`,
   valida com `utils/validacao.js`, chama o service e responde (`res.status(201).json(...)`).
   No Express 5, erro lançado dentro de função `async` chega ao tratador sem `try/catch`.
4. **routes** (`src/routes/<recurso>.routes.js`): `router.post("/x", autenticar, exigirPerfil("artesao"), controller.criar)`.
   O usuário logado fica em `req.usuario` (`id`, `nome`, `email`, `perfil`...). O token pode vir pelo
   cabeçalho `Authorization: Bearer` ou pelo cookie `origem_sessao` (navegador); nos testes, o
   cabeçalho é o mais simples.
   Rota pública que mostra algo a mais ao dono: `autenticarSeHouver` (sem token ou com token
   vencido, `req.usuario` fica `null` e a rota segue como visitante).
5. Registre o router em `src/app.js`, **antes** de `rotaNaoEncontrada`.
6. Escreva o teste em `testes/api/<recurso>.test.js` (veja `fundacao.test.js`): caminho feliz e
   cada erro previsto no contrato. Se o teste criar dados, apague-os no `after()` (veja `auth.test.js`).
7. Antes do PR: `npm test` **e**, se mexeu em checkout ou fila, a bateria do FCCPD U1 com a API no ar
   e **nenhum** worker rodando (`npm run evidencias`). Não suba os arquivos de `evidencias/` alterados.

## Cuidados

- Datas: `config/database.js` lê as colunas `TIMESTAMP` como UTC, e o Prisma também as trata como
  UTC. Sem isso, toda data sairia deslocada pelo fuso da máquina (3 h em Recife).
- `POST /pedidos` é a do contrato (exige login de comprador) e usa por trás o checkout seguro da U1.
  Os scripts de carga do FCCPD fazem login antes (`testes/sessao-comprador.js`). `GET /produtos/:id`
  mantém os campos que os testes da U1 leem.
- Testes que criam dados usam um domínio de e-mail próprio por arquivo
  (`@<arquivo>.teste.origem.invalid`): os arquivos rodam em paralelo e cada um apaga só o que criou.
- `POST /teste/reiniciar` apaga **todos** os pedidos (inclusive os 3 do seed) e a fila, e recoloca o
  estoque. Depois da bateria da U1, volte ao seed com `docker compose down -v && docker compose up -d`.
- `npm install` roda `prisma generate` sozinho (postinstall). Com npm 11 ou mais novo, os scripts
  de instalação do Prisma já estão liberados em `allowScripts` no `package.json`.
