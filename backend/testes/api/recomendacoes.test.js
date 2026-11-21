// ============================================================================
// Testes do repasse das recomendações (etapa E.4/E.5) — docs/api.md, seção 7b.
//
// O módulo de IA de verdade não precisa estar no ar: o teste sobe um servidor
// HTTP falso numa porta livre, que responde como a IA (ou falha, ou demora), e
// aponta config.recomendacaoUrl para ele. Os produtos vêm do seed.
// ============================================================================

import { test, before, after, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";
import { config } from "../../src/config/env.js";

const DOMINIO_TESTE = "@recomendacoes.teste.origem.invalid";
const rodada = Date.now();
const t = {};

// Comportamento da IA falsa, trocado por cada teste.
const ia = { modo: "ok", itens: [], pedidos: [] };
let servidor;
const urlOriginal = config.recomendacaoUrl;
const timeoutOriginal = config.recomendacaoTimeoutMs;

before(async () => {
  servidor = http.createServer((req, res) => {
    ia.pedidos.push({ url: req.url, usuario: req.headers["x-usuario-id"], chamador: req.headers["x-origem-chamador"] });
    if (ia.modo === "lenta") return setTimeout(() => res.end("{}"), 1000);
    if (ia.modo === "erro") {
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ erro: "Recomendações indisponíveis no momento" }));
    }
    if (ia.modo === "lixo") return res.end("isto não é JSON");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ recomendacoes: ia.itens, modelo: "falso" }));
  });
  await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  config.recomendacaoUrl = `http://127.0.0.1:${servidor.address().port}`;
  config.recomendacaoTimeoutMs = 300; // para o teste de lentidão não levar 2 s

  const r = await request(app)
    .post("/auth/registrar")
    .send({ nome: "Teste comprador", email: `comprador${rodada}${DOMINIO_TESTE}`, senha: "segredo1", perfil: "comprador" });
  t.comprador = { id: r.body.usuario.id, token: r.body.token };
  t.maria = (await request(app).post("/auth/login").send({ email: "maria@origem.com.br", senha: "origem123" })).body.token;
});

beforeEach(() => {
  ia.modo = "ok";
  ia.itens = [];
  ia.pedidos = [];
});

after(async () => {
  config.recomendacaoUrl = urlOriginal;
  config.recomendacaoTimeoutMs = timeoutOriginal;
  servidor.close();
  await pool.query(`DELETE FROM usuario WHERE email LIKE '%${DOMINIO_TESTE}'`);
  await pool.end();
});

const comToken = (req, token) => (token ? req.set("Authorization", `Bearer ${token}`) : req);
const doProduto = (id, query = "", token) => comToken(request(app).get(`/recomendacoes/produtos/${id}${query}`), token);
const paraMim = (token, query = "") => comToken(request(app).get(`/recomendacoes/eu${query}`), token);

describe("GET /recomendacoes/produtos/:id", () => {
  test("repassa a IA na ordem dela, com os dados do banco e fonte \"ia\"", async () => {
    ia.itens = [
      { id: 5, criterio: "mesmo-artesao", score: 6, preco: 1 }, // preço da IA é ignorado
      { id: 3, criterio: "popularidade", score: 0.9 },
    ];
    const r = await doProduto(1, "?limite=2");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.fonte, "ia");
    assert.equal(r.body.produtoReferenciaId, 1);
    assert.deepEqual(r.body.recomendacoes.map((p) => [p.id, p.criterio, p.score]), [[5, "mesmo-artesao", 6], [3, "popularidade", 0.9]]);
    const precoDoBanco = (await pool.query("SELECT preco::float FROM produto WHERE id = 5")).rows[0].preco;
    assert.equal(r.body.recomendacoes[0].preco, precoDoBanco);
    assert.ok(r.body.recomendacoes[0].nome && r.body.recomendacoes[0].imagem !== undefined);
    assert.equal(ia.pedidos[0].url, "/api/produtos/1/recomendados?limite=2");
    assert.equal(ia.pedidos[0].chamador, "backend");
  });

  test("tira o que não está mais na vitrine, o que não existe e a própria referência", async () => {
    // Produto inativo criado só para o teste (mexer no seed atrapalharia os outros arquivos, que rodam em paralelo).
    const { rows } = await pool.query(
      `INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque, status)
       VALUES (2, 1, 1, 1, 'Peça inativa do teste de recomendação', 10, 1, 'inativo') RETURNING id`,
    );
    const inativo = Number(rows[0].id);
    try {
      ia.itens = [inativo, 999999, 1, 4].map((id) => ({ id, criterio: "x", score: 1 }));
      const r = await doProduto(1);
      assert.deepEqual(r.body.recomendacoes.map((p) => p.id), [4]);
    } finally {
      await pool.query("DELETE FROM produto WHERE id = $1", [inativo]);
    }
  });

  test("IA fora do ar, com erro ou com resposta sem sentido: mais vendidos, fonte \"popularidade\"", async () => {
    for (const modo of ["erro", "lixo"]) {
      ia.modo = modo;
      const r = await doProduto(1, "?limite=3");
      assert.equal(r.status, 200, modo);
      assert.equal(r.body.fonte, "popularidade", modo);
      assert.equal(r.body.recomendacoes.length, 3, modo);
      assert.ok(r.body.recomendacoes.every((p) => p.criterio === "popularidade" && p.id !== 1), modo);
    }
    config.recomendacaoUrl = "http://127.0.0.1:1"; // ninguém escutando
    try {
      assert.equal((await doProduto(1)).body.fonte, "popularidade");
    } finally {
      config.recomendacaoUrl = `http://127.0.0.1:${servidor.address().port}`;
    }
  });

  test("IA lenta: responde pela popularidade logo depois do timeout (RF-08)", async () => {
    ia.modo = "lenta";
    const inicio = Date.now();
    const r = await doProduto(1);
    assert.equal(r.body.fonte, "popularidade");
    assert.ok(Date.now() - inicio < 900, `levou ${Date.now() - inicio} ms`);
  });

  test("popularidade: mais vendidos primeiro e no máximo 2 do mesmo artesão (RNF-06)", async () => {
    ia.modo = "erro";
    const lista = (await doProduto(1, "?limite=10")).body.recomendacoes;
    const porArtesao = {};
    for (const p of lista) porArtesao[p.artesaoId] = (porArtesao[p.artesaoId] ?? 0) + 1;
    assert.ok(Object.values(porArtesao).every((n) => n <= 2), JSON.stringify(porArtesao));
    const scores = lista.map((p) => p.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  });

  test("produto inexistente ou limite inválido: 404 e 400, sem chamar a IA", async () => {
    assert.equal((await doProduto(999999)).status, 404);
    for (const limite of ["0", "21", "abc", "2.5"]) {
      const r = await doProduto(1, `?limite=${limite}`);
      assert.equal(r.status, 400, limite);
      assert.equal(r.body.erro, "CORPO_INVALIDO");
    }
    assert.equal(ia.pedidos.length, 0);
  });
});

describe("GET /recomendacoes/eu", () => {
  test("usa o usuário do TOKEN no caminho e no cabeçalho X-Usuario-Id", async () => {
    ia.itens = [{ id: 2, criterio: "historico-tecnica", score: 3 }];
    const r = await paraMim(t.comprador.token, "?limite=5");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.usuarioId, t.comprador.id);
    assert.equal(r.body.fonte, "ia");
    assert.equal(ia.pedidos[0].url, `/api/usuarios/${t.comprador.id}/recomendados?limite=5`);
    assert.equal(ia.pedidos[0].usuario, String(t.comprador.id));
  });

  test("um X-Usuario-Id forjado pelo cliente não muda nada", async () => {
    ia.itens = [];
    await paraMim(t.comprador.token).set("X-Usuario-Id", "1");
    assert.equal(ia.pedidos[0].usuario, String(t.comprador.id));
  });

  test("sem login: 401; artesão: 403", async () => {
    assert.equal((await paraMim(null)).status, 401);
    assert.equal((await paraMim(t.maria)).status, 403);
  });

  test("IA fora: mais vendidos (padrão de 8 itens)", async () => {
    ia.modo = "erro";
    const r = await paraMim(t.comprador.token);
    assert.equal(r.body.fonte, "popularidade");
    assert.ok(r.body.recomendacoes.length > 0 && r.body.recomendacoes.length <= 8);
  });
});
