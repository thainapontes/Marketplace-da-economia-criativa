// ============================================================================
// Testes de pedidos (etapa D) — docs/api.md, seção 6.
//
// Criam um artesão aprovado, um artesão pendente, dois compradores e produtos
// próprios (e-mail "@pedidos.teste.origem.invalid"): as compras daqui não
// mexem no estoque do seed. Tudo é apagado no fim, inclusive os jobs da fila.
// ============================================================================

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";

const DOMINIO_TESTE = "@pedidos.teste.origem.invalid";
const rodada = Date.now();
const t = {};

async function criarUsuario(apelido, perfil, aprovado = true) {
  const r = await request(app)
    .post("/auth/registrar")
    .send({ nome: `Teste ${apelido}`, email: `${apelido}${rodada}${DOMINIO_TESTE}`, senha: "segredo1", perfil, regiao: "RMR" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (perfil === "artesao" && aprovado) await pool.query("UPDATE artesao SET aprovado = TRUE WHERE usuario_id = $1", [r.body.usuario.id]);
  return { id: r.body.usuario.id, token: r.body.token };
}

async function criarProduto(artesaoId, { preco, estoque, status = "ativo" }) {
  const { rows } = await pool.query(
    `INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque, status)
     VALUES ($1, 1, 1, 3, 'Peça de teste de pedido', $2, $3, $4) RETURNING id`,
    [artesaoId, preco, estoque, status],
  );
  return Number(rows[0].id);
}

const estoque = async (id) => (await pool.query("SELECT estoque FROM produto WHERE id = $1", [id])).rows[0].estoque;
const auth = (req, token) => req.set("Authorization", `Bearer ${token}`);
const comprar = (token, itens, extra = {}) =>
  auth(request(app).post("/pedidos"), token).send({
    enderecoEntrega: "Rua do Bom Jesus, 10 — Recife/PE",
    metodoPagamento: "pix",
    itens,
    ...extra,
  });
const mudarStatus = (token, codigo, status) => auth(request(app).patch(`/pedidos/${codigo}/status`), token).send({ status });

before(async () => {
  t.artesao = await criarUsuario("artesao", "artesao");
  t.outroArtesao = await criarUsuario("outroartesao", "artesao");
  t.pendente = await criarUsuario("pendente", "artesao", false);
  t.comprador = await criarUsuario("comprador", "comprador");
  t.outroComprador = await criarUsuario("outrocomprador", "comprador");
  t.admin = (await request(app).post("/auth/login").send({ email: "admin@origem.com.br", senha: "origem123" })).body.token;

  t.barato = await criarProduto(t.artesao.id, { preco: 100, estoque: 20 }); // < 400: paga frete
  t.caro = await criarProduto(t.artesao.id, { preco: 450, estoque: 20 }); // >= 400: frete grátis
  t.escasso = await criarProduto(t.artesao.id, { preco: 50, estoque: 2 });
  t.inativo = await criarProduto(t.artesao.id, { preco: 50, estoque: 5, status: "inativo" });
  t.doOutro = await criarProduto(t.outroArtesao.id, { preco: 80, estoque: 20 });
  t.doPendente = await criarProduto(t.pendente.id, { preco: 80, estoque: 20 });
});

after(async () => {
  const usuarios = `SELECT id FROM usuario WHERE email LIKE '%${DOMINIO_TESTE}'`;
  const pedidos = `SELECT id FROM pedido WHERE comprador_id IN (${usuarios})`;
  await pool.query(
    `DELETE FROM evento_assincrono WHERE tipo = 'notificar_pedido' AND (payload->>'pedidoId')::bigint IN (${pedidos})`,
  );
  await pool.query(`DELETE FROM pedido WHERE comprador_id IN (${usuarios})`); // itens e pagamento: CASCADE
  await pool.query(`DELETE FROM carrinho WHERE usuario_id IN (${usuarios})`);
  await pool.query(`DELETE FROM produto WHERE artesao_id IN (${usuarios})`);
  await pool.query(`DELETE FROM usuario WHERE email LIKE '%${DOMINIO_TESTE}'`);
  await pool.end();
});

describe("POST /pedidos", () => {
  test("cria o pedido do contrato: preço do banco, frete, previsão +8 dias, pagamento e baixa de estoque", async () => {
    const antes = await estoque(t.barato);
    const r = await comprar(t.comprador.token, [{ produtoId: t.barato, quantidade: 2 }], { preco: 1 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const p = r.body;
    assert.match(p.codigo, /^PE-\d+$/);
    assert.equal(p.status, "confirmado");
    assert.equal(p.clienteEmail, `comprador${rodada}${DOMINIO_TESTE}`);
    assert.deepEqual(p.itens.map((i) => [i.produto.id, i.produto.preco, i.quantidade]), [[t.barato, 100, 2]]);
    assert.equal(p.subtotal, 200);
    assert.equal(p.frete, 35.9);
    assert.equal(p.total, 235.9);
    assert.deepEqual(p.pagamento && { ...p.pagamento, processadoEm: undefined }, {
      metodo: "pix", status: "aprovado", valor: 235.9, processadoEm: undefined,
    });
    const dias = (Date.parse(p.previsaoEntrega) - Date.parse(p.data.slice(0, 10))) / 86_400_000;
    assert.equal(dias, 8);
    assert.equal(await estoque(t.barato), antes - 2);

    // Frete e previsão também ficam gravados no banco (antes o frete ficava 0).
    const { rows } = await pool.query("SELECT frete, previsao_entrega FROM pedido WHERE codigo = $1", [p.codigo]);
    assert.equal(Number(rows[0].frete), 35.9);
    assert.ok(rows[0].previsao_entrega);
    t.pedidoBarato = p.codigo;
  });

  test("frete grátis a partir de R$ 400", async () => {
    const r = await comprar(t.comprador.token, [{ produtoId: t.caro, quantidade: 1 }], { metodoPagamento: "cartao" });
    assert.equal(r.status, 201);
    assert.equal(r.body.frete, 0);
    assert.equal(r.body.total, 450);
    assert.equal(r.body.pagamento.metodo, "cartao");
  });

  test("enfileira o aviso ao comprador e a cada artesão do pedido (fila do FCCPD U1)", async () => {
    const r = await comprar(t.comprador.token, [{ produtoId: t.barato, quantidade: 1 }, { produtoId: t.doOutro, quantidade: 1 }]);
    assert.equal(r.status, 201);
    const { rows } = await pool.query(
      `SELECT chave_idempotencia FROM evento_assincrono
        WHERE tipo = 'notificar_pedido' AND payload->>'pedidoId' = (SELECT id::text FROM pedido WHERE codigo = $1)
        ORDER BY chave_idempotencia`,
      [r.body.codigo],
    );
    const pedidoId = (await pool.query("SELECT id FROM pedido WHERE codigo = $1", [r.body.codigo])).rows[0].id;
    assert.deepEqual(rows.map((l) => l.chave_idempotencia).sort(), [
      `notificar-artesao:${pedidoId}:${t.artesao.id}`,
      `notificar-artesao:${pedidoId}:${t.outroArtesao.id}`,
      `notificar-comprador:${pedidoId}`,
    ].sort());
  });

  test("sem estoque: 409 e NADA muda (nem o item que tinha estoque)", async () => {
    const antes = [await estoque(t.barato), await estoque(t.escasso)];
    const pedidosAntes = (await pool.query("SELECT count(*) FROM pedido")).rows[0].count;
    const r = await comprar(t.comprador.token, [{ produtoId: t.barato, quantidade: 1 }, { produtoId: t.escasso, quantidade: 3 }]);
    assert.equal(r.status, 409);
    assert.equal(r.body.erro, "ESTOQUE_INSUFICIENTE");
    assert.equal(r.body.produtoId, t.escasso);
    assert.deepEqual([await estoque(t.barato), await estoque(t.escasso)], antes);
    assert.equal((await pool.query("SELECT count(*) FROM pedido")).rows[0].count, pedidosAntes);
  });

  test("produto inexistente, inativo ou de artesão não aprovado: 404", async () => {
    for (const produtoId of [999999, t.inativo, t.doPendente]) {
      const r = await comprar(t.comprador.token, [{ produtoId, quantidade: 1 }]);
      assert.equal(r.status, 404, String(produtoId));
      assert.equal(r.body.erro, "NAO_ENCONTRADO");
    }
  });

  test("corpo inválido: 400", async () => {
    const item = [{ produtoId: t.barato, quantidade: 1 }];
    for (const extra of [
      { metodoPagamento: "dinheiro" },
      { enderecoEntrega: "Rua" },
      { itens: [] },
      { itens: [{ produtoId: t.barato, quantidade: 1 }, { produtoId: t.barato, quantidade: 1 }] },
      { itens: [{ produtoId: t.barato, quantidade: 0 }] },
    ]) {
      const r = await comprar(t.comprador.token, item, extra);
      assert.equal(r.status, 400, JSON.stringify(extra));
      assert.equal(r.body.erro, "CORPO_INVALIDO");
    }
  });

  test("sem login: 401; artesão ou admin comprando: 403", async () => {
    assert.equal((await request(app).post("/pedidos").send({})).status, 401);
    assert.equal((await comprar(t.artesao.token, [{ produtoId: t.barato, quantidade: 1 }])).status, 403);
    assert.equal((await comprar(t.admin, [{ produtoId: t.barato, quantidade: 1 }])).status, 403);
  });

  test("o pedido esvazia o carrinho salvo", async () => {
    await auth(request(app).put("/carrinho"), t.outroComprador.token).send({ itens: [{ produtoId: t.barato, quantidade: 1 }] });
    assert.equal((await comprar(t.outroComprador.token, [{ produtoId: t.barato, quantidade: 1 }])).status, 201);
    assert.deepEqual((await auth(request(app).get("/carrinho"), t.outroComprador.token)).body, []);
  });

  test("compras simultâneas do último estoque: vendem exatamente o que existe", async () => {
    const id = await criarProduto(t.artesao.id, { preco: 10, estoque: 10 });
    const respostas = await Promise.all(
      Array.from({ length: 50 }, () => comprar(t.comprador.token, [{ produtoId: id, quantidade: 1 }])),
    );
    // 50 compras para 10 unidades (o cenário da bateria do FCCPD U1): com o
    // checkout ingênuo (sem proteção), este teste vende mais do que existe.
    const aprovadas = respostas.filter((r) => r.status === 201).length;
    assert.equal(aprovadas, 10);
    assert.ok(respostas.every((r) => r.status === 201 || r.body.erro === "ESTOQUE_INSUFICIENTE"));
    assert.equal(await estoque(id), 0);
  });

  test("o pedido guarda o preço pago, mesmo se o produto ficar mais caro depois", async () => {
    const id = await criarProduto(t.artesao.id, { preco: 60, estoque: 3 });
    const { codigo } = (await comprar(t.comprador.token, [{ produtoId: id, quantidade: 1 }])).body;
    await pool.query("UPDATE produto SET preco = 99 WHERE id = $1", [id]);
    const r = await auth(request(app).get(`/pedidos/${codigo}`), t.comprador.token);
    assert.equal(r.body.itens[0].produto.preco, 60);
  });
});

describe("GET /pedidos e GET /pedidos/:codigo", () => {
  test("comprador vê só os dele, mais recentes primeiro", async () => {
    const r = await auth(request(app).get("/pedidos"), t.comprador.token);
    assert.equal(r.status, 200);
    assert.ok(r.body.length >= 3);
    assert.ok(r.body.every((p) => p.clienteEmail === `comprador${rodada}${DOMINIO_TESTE}`));
    const datas = r.body.map((p) => p.data);
    assert.deepEqual(datas, [...datas].sort().reverse());
  });

  test("artesão vê os que têm item dele; admin vê todos, inclusive os do seed", async () => {
    const doOutro = await auth(request(app).get("/pedidos"), t.outroArtesao.token);
    assert.ok(doOutro.body.length >= 1);
    assert.ok(doOutro.body.every((p) => p.itens.some((i) => i.produto.artesaoId === t.outroArtesao.id)));

    const todos = (await auth(request(app).get("/pedidos"), t.admin)).body.map((p) => p.codigo);
    assert.ok(["PE-4821", "PE-4790", "PE-4705", t.pedidoBarato].every((c) => todos.includes(c)));
  });

  test("pedidos do seed para o comprador de demonstração", async () => {
    const token = (await request(app).post("/auth/login").send({ email: "comprador@origem.com.br", senha: "origem123" })).body.token;
    const r = await auth(request(app).get("/pedidos/PE-4821"), token);
    assert.equal(r.status, 200);
    assert.equal(r.body.subtotal, 735);
    assert.equal(r.body.previsaoEntrega, "2026-08-28T00:00:00.000Z");
    assert.deepEqual(r.body.itens.map((i) => [i.produto.id, i.produto.preco]), [[1, 285], [4, 450]]);
  });

  test("detalhe: dono e artesão com item sim; outro comprador e artesão sem item 403; inexistente 404", async () => {
    const ver = (token) => auth(request(app).get(`/pedidos/${t.pedidoBarato}`), token);
    assert.equal((await ver(t.comprador.token)).status, 200);
    assert.equal((await ver(t.artesao.token)).status, 200);
    assert.equal((await ver(t.admin)).status, 200);
    assert.equal((await ver(t.outroComprador.token)).status, 403);
    assert.equal((await ver(t.outroArtesao.token)).status, 403);
    assert.equal((await auth(request(app).get("/pedidos/PE-0"), t.comprador.token)).status, 404);
    assert.equal((await request(app).get(`/pedidos/${t.pedidoBarato}`)).status, 401);
  });
});

describe("PATCH /pedidos/:codigo/status", () => {
  test("segue as transições até entregue; pular etapa ou voltar é 400", async () => {
    const { codigo } = (await comprar(t.comprador.token, [{ produtoId: t.barato, quantidade: 1 }])).body;
    assert.equal((await mudarStatus(t.artesao.token, codigo, "entregue")).status, 400);
    for (const status of ["em_producao", "enviado", "entregue"]) {
      const r = await mudarStatus(t.artesao.token, codigo, status);
      assert.equal(r.status, 200, status);
      assert.equal(r.body.status, status);
    }
    assert.equal((await mudarStatus(t.artesao.token, codigo, "cancelado")).status, 400);
    assert.equal((await mudarStatus(t.artesao.token, codigo, "voando")).status, 400);
  });

  test("cancelar devolve o estoque de todos os itens", async () => {
    const antes = [await estoque(t.barato), await estoque(t.doOutro)];
    const { codigo } = (await comprar(t.comprador.token, [{ produtoId: t.barato, quantidade: 3 }, { produtoId: t.doOutro, quantidade: 2 }])).body;
    assert.deepEqual([await estoque(t.barato), await estoque(t.doOutro)], [antes[0] - 3, antes[1] - 2]);
    const r = await mudarStatus(t.outroArtesao.token, codigo, "cancelado");
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "cancelado");
    assert.deepEqual([await estoque(t.barato), await estoque(t.doOutro)], antes);
  });

  test("dois cancelamentos ao mesmo tempo devolvem o estoque UMA vez", async () => {
    const antes = await estoque(t.barato);
    const { codigo } = (await comprar(t.comprador.token, [{ produtoId: t.barato, quantidade: 4 }])).body;
    const respostas = await Promise.all([1, 2, 3].map(() => mudarStatus(t.artesao.token, codigo, "cancelado")));
    assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 400, 400]);
    assert.equal(await estoque(t.barato), antes);
  });

  test("só o artesão com item no pedido: comprador, admin e outro artesão recebem 403", async () => {
    assert.equal((await mudarStatus(t.comprador.token, t.pedidoBarato, "em_producao")).status, 403);
    assert.equal((await mudarStatus(t.admin, t.pedidoBarato, "em_producao")).status, 403);
    assert.equal((await mudarStatus(t.outroArtesao.token, t.pedidoBarato, "em_producao")).status, 403);
    assert.equal((await mudarStatus(t.artesao.token, "PE-0", "em_producao")).status, 404);
  });
});
