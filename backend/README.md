# Backend do Origem

API Node/Express + PostgreSQL. O contrato das rotas está em [`docs/api.md`](../docs/api.md),
e o plano da U2 (Fase 1) é implementá-lo etapa por etapa.

## Rodar

```bash
docker compose up -d      # PostgreSQL na porta 5434 (schema + seed automáticos)
npm install
npm run api               # http://localhost:3333
npm test                  # testes automatizados da API (só leem o banco)
```

Já tinha o banco de antes da U2? Recrie uma vez: `docker compose down -v && docker compose up -d`.
Variáveis de ambiente: veja `.env.example` (todas têm valor padrão para desenvolvimento).

## Estrutura

```
src/
├── server.js            só abre a porta
├── app.js               CORS → JSON → rotas → 404 → tratador de erros
├── config.js            variáveis de ambiente (único lugar que as lê)
├── middlewares/
│   └── erros.js         ErroApi + tratadorDeErros (formato { erro, mensagem })
├── rotas/
│   └── laboratorio.js   rotas do FCCPD U1 (não mexer sem rodar a bateria da U1)
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
4. Escreva o teste em `testes/api/<recurso>.test.js` (veja `fundacao.test.js`): caminho feliz e
   cada erro previsto no contrato.
5. Antes do PR: `npm test` **e** a bateria do FCCPD U1 com a API no ar e **nenhum** worker rodando
   (`npm run teste:concorrencia`, `npm run teste:deadlock`, `npm run teste:fila`).

## Cuidados

- `GET /produtos/:id` e `POST /pedidos` ainda são as versões da U1 (em `rotas/laboratorio.js`).
  Elas são substituídas nas etapas 1.2 e 1.4, mantendo os campos que os testes da U1 leem.
- `POST /teste/reiniciar` apaga pedidos e fila e recoloca o estoque. Não rode os testes de
  carga num banco com dados que você quer guardar.
