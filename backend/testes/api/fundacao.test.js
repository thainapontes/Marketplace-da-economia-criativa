// ============================================================================
// Testes da etapa 1.0 (fundação): formato de erro, CORS e rotas da U1.
//
// Rodar:  npm test   (precisa do banco de pé: docker compose up -d)
//
// Usam o app direto (supertest), sem abrir porta. Estes testes só LEEM o
// banco: não apagam pedidos nem mexem em estoque.
// ============================================================================

import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";
import { tratadorDeErros, ErroApi } from "../../src/middlewares/erros.js";

after(() => pool.end());

/** Confere o formato de erro do contrato (docs/api.md, seção 2). */
function assertErro(resposta, status, codigo) {
  assert.equal(resposta.status, status);
  assert.match(resposta.headers["content-type"], /application\/json/);
  assert.equal(resposta.body.erro, codigo);
  assert.equal(typeof resposta.body.mensagem, "string");
  assert.ok(resposta.body.mensagem.length > 0);
}

test("GET /saude responde com o banco de pé", async () => {
  const r = await request(app).get("/saude");
  assert.equal(r.status, 200, "banco fora do ar? suba com: docker compose up -d");
  assert.equal(r.body.ok, true);
});

test("rota inexistente devolve 404 em JSON, não HTML", async () => {
  assertErro(await request(app).get("/nao-existe"), 404, "NAO_ENCONTRADO");
});

test("JSON malformado devolve 400 CORPO_INVALIDO", async () => {
  const r = await request(app)
    .post("/pedidos")
    .set("Content-Type", "application/json")
    .send('{"itens": [');
  assertErro(r, 400, "CORPO_INVALIDO");
});

// Etapa D: POST /pedidos passou a exigir login de comprador (antes, compradorId no corpo).
test("POST /pedidos sem login devolve 401; com login e corpo incompleto, 400 sem tocar no banco", async () => {
  assertErro(await request(app).post("/pedidos").send({ itens: [] }), 401, "NAO_AUTENTICADO");
  const { token } = (await request(app).post("/auth/login").send({ email: "comprador@origem.com.br", senha: "origem123" })).body;
  const r = await request(app).post("/pedidos").set("Authorization", `Bearer ${token}`).send({ itens: [] });
  assertErro(r, 400, "CORPO_INVALIDO");
});

test("GET /produtos/:id mantém os campos que os testes do FCCPD leem", async () => {
  const r = await request(app).get("/produtos/1");
  assert.equal(r.status, 200);
  for (const campo of ["id", "nome", "preco", "estoque", "status"]) {
    assert.ok(campo in r.body, `falta o campo ${campo}`);
  }
  assert.equal(r.body.id, 1);
  assert.equal(typeof r.body.preco, "number");
});

// Na etapa 1.2 a rota passou para o contrato (docs/api.md, seção 2): NAO_ENCONTRADO.
// Nenhum script do FCCPD U1 confere esse código.
test("GET /produtos/:id inexistente devolve 404 NAO_ENCONTRADO", async () => {
  assertErro(await request(app).get("/produtos/999999"), 404, "NAO_ENCONTRADO");
});

test("CORS libera a origem do frontend", async () => {
  const r = await request(app).get("/saude").set("Origin", "http://localhost:3000");
  assert.equal(r.headers["access-control-allow-origin"], "http://localhost:3000");
});

test("CORS não libera origem desconhecida", async () => {
  const r = await request(app).get("/saude").set("Origin", "https://site-qualquer.example");
  assert.equal(r.headers["access-control-allow-origin"], undefined);
});

// ---------------------------------------------------------------------------
// Tratador de erros isolado (sem HTTP): garante que erro inesperado não vaza
// detalhes internos para o cliente.
// ---------------------------------------------------------------------------

function respostaFalsa() {
  return {
    statusCode: 0,
    corpo: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; },
  };
}

test("erro inesperado vira 500 genérico, sem expor a mensagem original", () => {
  const res = respostaFalsa();
  const erroOriginal = console.error;
  console.error = () => {}; // o log é esperado aqui; não poluir a saída do teste
  try {
    tratadorDeErros(new Error('relation "tabela_secreta" does not exist'), {}, res, () => {});
  } finally {
    console.error = erroOriginal;
  }
  assert.equal(res.statusCode, 500);
  assert.equal(res.corpo.erro, "ERRO_INTERNO");
  assert.doesNotMatch(res.corpo.mensagem, /tabela_secreta/);
});

test("ErroApi vira a resposta do contrato com status e código", () => {
  const res = respostaFalsa();
  tratadorDeErros(new ErroApi(403, "SEM_PERMISSAO", "Este produto é de outro artesão."), {}, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.corpo, { erro: "SEM_PERMISSAO", mensagem: "Este produto é de outro artesão." });
});
