// ============================================================================
// Testes do carrinho no banco (etapa D.1) — docs/api.md, seção 6.
//
// Usam um comprador criado aqui (e-mail "@carrinho.teste.origem.invalid") e os
// produtos do seed só para LEITURA: o carrinho não mexe no estoque.
// ============================================================================

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";

// Domínio próprio deste arquivo: os arquivos de teste rodam em paralelo, e cada um
// apaga no fim só os usuários que ele criou.
const DOMINIO_TESTE = "@carrinho.teste.origem.invalid";
let token;
let tokenMaria;

before(async () => {
  const r = await request(app)
    .post("/auth/registrar")
    .send({ nome: "Comprador Carrinho", email: `carrinho${Date.now()}${DOMINIO_TESTE}`, senha: "segredo1", perfil: "comprador" });
  token = r.body.token;
  tokenMaria = (await request(app).post("/auth/login").send({ email: "maria@origem.com.br", senha: "origem123" })).body.token;
});

after(async () => {
  // item_carrinho tem CASCADE a partir de carrinho, mas carrinho referencia usuario
  // sem cascade: apagamos o carrinho antes do usuário.
  await pool.query(
    "DELETE FROM carrinho WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE $1)",
    [`%${DOMINIO_TESTE}`],
  );
  await pool.query("DELETE FROM usuario WHERE email LIKE $1", [`%${DOMINIO_TESTE}`]);
  await pool.end();
});

const comToken = (req, t = token) => req.set("Authorization", `Bearer ${t}`);
const colocar = (itens, t) => comToken(request(app).put("/carrinho"), t).send({ itens });

describe("carrinho do comprador", () => {
  test("começa vazio", async () => {
    const r = await comToken(request(app).get("/carrinho"));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, []);
  });

  test("PUT grava os itens com o produto completo e o preço do banco", async () => {
    const r = await colocar([
      { produtoId: 3, quantidade: 2 },
      { produtoId: 1, quantidade: 1 },
    ]);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((i) => [i.produto.id, i.quantidade]), [[3, 2], [1, 1]]);
    assert.equal(r.body[1].produto.preco, 285);
    assert.equal(r.body[1].produto.nome, "Cangaceiro de Barro — Lampião e Maria Bonita");

    // E fica salvo: outra requisição (outro navegador) vê o mesmo carrinho.
    const salvo = await comToken(request(app).get("/carrinho"));
    assert.deepEqual(salvo.body, r.body);
  });

  test("PUT substitui o carrinho inteiro (não soma)", async () => {
    const r = await colocar([{ produtoId: 5, quantidade: 4 }]);
    assert.deepEqual(r.body.map((i) => [i.produto.id, i.quantidade]), [[5, 4]]);
  });

  test("o preço enviado pelo navegador é ignorado", async () => {
    await colocar([{ produtoId: 2, quantidade: 1, preco: 1 }]);
    const { rows } = await pool.query(
      `SELECT ic.preco_unitario FROM item_carrinho ic JOIN carrinho c ON c.id = ic.carrinho_id
         JOIN usuario u ON u.id = c.usuario_id WHERE u.email LIKE $1`,
      [`%${DOMINIO_TESTE}`],
    );
    assert.equal(Number(rows[0].preco_unitario), 620);
  });

  test("DELETE esvazia (204) e PUT com lista vazia também", async () => {
    await colocar([{ produtoId: 1, quantidade: 1 }]);
    assert.equal((await comToken(request(app).delete("/carrinho"))).status, 204);
    assert.deepEqual((await comToken(request(app).get("/carrinho"))).body, []);
    await colocar([{ produtoId: 1, quantidade: 1 }]);
    assert.deepEqual((await colocar([])).body, []);
  });

  test("entradas inválidas: 400 e o carrinho não muda", async () => {
    await colocar([{ produtoId: 1, quantidade: 1 }]);
    for (const itens of [
      "nada",
      [{ produtoId: "1", quantidade: 1 }],
      [{ produtoId: 1, quantidade: 0 }],
      [{ produtoId: 1, quantidade: 100 }],
      [{ produtoId: 1, quantidade: 1.5 }],
      [{ produtoId: 1, quantidade: 1 }, { produtoId: 1, quantidade: 2 }],
      [{ produtoId: 999999, quantidade: 1 }],
    ]) {
      const r = await colocar(itens);
      assert.equal(r.status, 400, JSON.stringify(itens));
      assert.equal(r.body.erro, "CORPO_INVALIDO");
    }
    const atual = await comToken(request(app).get("/carrinho"));
    assert.deepEqual(atual.body.map((i) => [i.produto.id, i.quantidade]), [[1, 1]]);
  });

  test("sem login: 401; artesão: 403", async () => {
    assert.equal((await request(app).get("/carrinho")).status, 401);
    assert.equal((await comToken(request(app).get("/carrinho"), tokenMaria)).status, 403);
    assert.equal((await colocar([{ produtoId: 1, quantidade: 1 }], tokenMaria)).status, 403);
  });
});

describe("POST /carrinho/validar", () => {
  test("tudo em estoque: lista vazia", async () => {
    const r = await request(app).post("/carrinho/validar").send({ itens: [{ produtoId: 1, quantidade: 3 }] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, []);
  });

  test("aponta quantidade acima do estoque, produto esgotado e produto inexistente", async () => {
    const r = await request(app)
      .post("/carrinho/validar")
      .send({ itens: [{ produtoId: 1, quantidade: 4 }, { produtoId: 8, quantidade: 1 }, { produtoId: 999999, quantidade: 1 }] });
    assert.deepEqual(r.body, [
      { produtoId: 1, nome: "Cangaceiro de Barro — Lampião e Maria Bonita", disponivel: 3, solicitado: 4 },
      { produtoId: 8, nome: "Cinto de Vaqueiro em Couro Trançado", disponivel: 0, solicitado: 1 },
      { produtoId: 999999, nome: "Produto 999999", disponivel: 0, solicitado: 1 },
    ]);
  });

  test("lista vazia ou malformada: 400", async () => {
    assert.equal((await request(app).post("/carrinho/validar").send({ itens: [] })).status, 400);
    assert.equal((await request(app).post("/carrinho/validar").send({})).status, 400);
  });
});
