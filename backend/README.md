# Backend do Origem

API Node/Express + PostgreSQL. O contrato das rotas está em [`docs/api.md`](../docs/api.md),
e o plano da U2 (Fase 1) é implementá-lo etapa por etapa.

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

```
src/
├── server.js            só abre a porta
├── app.js               CORS → JSON → rotas → 404 → tratador de erros
├── config.js            variáveis de ambiente (único lugar que as lê)
├── validacao.js         validação de entrada (texto, e-mail, id de URL) → 400
├── middlewares/
│   ├── erros.js         ErroApi + tratadorDeErros (formato { erro, mensagem })
│   └── autenticacao.js  gerarToken, autenticar (JWT → req.usuario), autenticarSeHouver, exigirPerfil
├── mapeadores/
│   ├── usuario.js       linha do banco → objeto da API (nunca expõe senha_hash)
│   └── catalogo.js      SELECT + mapeador de Produto, Artesao e Avaliacao (reuse nas próximas etapas)
├── rotas/
│   ├── laboratorio.js   rotas do FCCPD U1 (não mexer sem rodar a bateria da U1)
│   ├── auth.js          /auth/registrar, /auth/login, /auth/eu
│   ├── usuarios.js      /usuarios/:id
│   └── catalogo.js      /filtros, GET /produtos, /produtos/:id, /produtos/:id/avaliacoes, /artesoes
├── db.js                pool + comTransacao
├── pedido.js, checkout-*.js, fila.js, tarefas.js, worker.js   (FCCPD U1)
testes/
├── api/                 testes da API: node:test + supertest (npm test)
└── teste-*.js           testes de carga do FCCPD U1 (precisam da API no ar)
```

## Como criar uma rota nova

1. Crie (ou abra) o arquivo do recurso em `src/rotas/`, por exemplo `produtos.js`, exportando um `Router`.
2. Registre o router em `src/app.js`, **antes** de `rotaNaoEncontrada`.
3. Para responder erro, **lance** em vez de montar a resposta:
   `throw new ErroApi(404, "NAO_ENCONTRADO", "Produto 42 não encontrado.")`.
   No Express 5 isso funciona dentro de funções `async`, sem `try/catch`.
   Use só os códigos da seção 2 do contrato.
4. Rota que exige login: `router.get("/x", autenticar, exigirPerfil("artesao"), async (req, res) => ...)`.
   O usuário logado fica em `req.usuario` (linha do banco: `id`, `nome`, `email`, `perfil`...).
   Rota pública que mostra algo a mais ao dono: `autenticarSeHouver` (sem token ou com token
   vencido, `req.usuario` fica `null` e a rota segue como visitante).
5. Escreva o teste em `testes/api/<recurso>.test.js` (veja `fundacao.test.js`): caminho feliz e
   cada erro previsto no contrato.
   Para testar rota protegida, faça login com uma conta do seed (senha `origem123`) e envie o token.
   Se o teste criar dados, apague-os no `after()` (veja `auth.test.js`).
6. Antes do PR: `npm test` **e** a bateria do FCCPD U1 com a API no ar e **nenhum** worker rodando
   (`npm run teste:concorrencia`, `npm run teste:deadlock`, `npm run teste:fila`).

## Cuidados

- Datas: `db.js` lê as colunas `TIMESTAMP` como UTC. Sem isso, toda data sairia deslocada pelo
  fuso da máquina (3 h em Recife).
- `POST /pedidos` ainda é a versão da U1 (em `rotas/laboratorio.js`) e será substituída na etapa 1.4.
  `GET /produtos/:id` já é a do contrato (etapa 1.2) e mantém os campos que os testes da U1 leem.
- `POST /teste/reiniciar` apaga **todos** os pedidos (inclusive os 3 do seed) e a fila, e recoloca o
  estoque. Depois da bateria da U1, volte ao seed com `docker compose down -v && docker compose up -d`.
