// ============================================================================
// Testes do painel do artesão e do cache (etapa C) — docs/api.md, seções 5 e 7.
//
// Criam dois artesãos aprovados e um comprador (e-mail
// "@painel.teste.origem.invalid"), com produtos e pedidos próprios. O seed
// não é alterado. Tudo é apagado no fim, inclusive os jobs da fila.
// ============================================================================

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";

const DOMINIO_TESTE = "@painel.teste.origem.invalid";
const rodada = Date.now();
const t = {};

async function criarUsuario(apelido, perfil) {
  const r = await request(app)
    .post("/auth/registrar")
    .send({ nome: `Teste ${apelido}`, email: `${apelido}${rodada}${DOMINIO_TESTE}`, senha: "segredo1", perfil, regiao: "Sertão" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (perfil === "artesao") await pool.query("UPDATE artesao SET aprovado = TRUE WHERE usuario_id = $1", [r.body.usuario.id]);
  return { id: r.body.usuario.id, token: r.body.token };
}

const auth = (req, token) => req.set("Authorization", `Bearer ${token}`);
const NOVO = {
  nome: "Moringa de Teste",
  descricao: "Moringa de barro para o teste do painel.",
  preco: 50,
  estoque: 10,
  categoria: "cerâmica", // sem diferenciar maiúsculas
  tecnica: "Barro Cozido",
  regiao: "SERTÃO",
  imagem: "https://exemplo.org/moringa.jpg",
};
const criar = (token, extra = {}) => auth(request(app).post("/produtos"), token).send({ ...NOVO, ...extra });
const editar = (token, id, extra = {}) => auth(request(app).put(`/produtos/${id}`), token).send({ ...NOVO, ...extra });
const indicadores = (token) => auth(request(app).get("/artesoes/eu/indicadores"), token);

before(async () => {
  t.artesao = await criarUsuario("artesao", "artesao");
  t.outro = await criarUsuario("outro", "artesao");
  t.comprador = await criarUsuario("comprador", "comprador");
});

after(async () => {
  const usuarios = `SELECT id FROM usuario WHERE email LIKE '%${DOMINIO_TESTE}'`;
  const pedidos = `SELECT id FROM pedido WHERE comprador_id IN (${usuarios})`;
  await pool.query(`DELETE FROM evento_assincrono WHERE tipo = 'notificar_pedido' AND (payload->>'pedidoId')::bigint IN (${pedidos})`);
  await pool.query(`DELETE FROM pedido WHERE comprador_id IN (${usuarios})`);
  await pool.query(`DELETE FROM carrinho WHERE usuario_id IN (${usuarios})`);
  await pool.query(`DELETE FROM produto WHERE artesao_id IN (${usuarios})`);
  await pool.query(`DELETE FROM usuario WHERE email LIKE '%${DOMINIO_TESTE}'`);
  await pool.end();
});

describe("POST /produtos", () => {
  test("cria com o dono do login, os nomes do banco e a imagem principal", async () => {
    const r = await criar(t.artesao.token, { artesaoId: 2 }); // tenta publicar em nome da Maria
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const p = r.body;
    assert.equal(p.artesaoId, t.artesao.id);
    assert.equal(p.artesao, "Teste artesao");
    assert.deepEqual([p.categoria, p.tecnica, p.regiao], ["Cerâmica", "Barro Cozido", "Sertão"]);
    assert.deepEqual([p.preco, p.estoque, p.status], [50, 10, "ativo"]);
    assert.deepEqual(p.imagens, ["https://exemplo.org/moringa.jpg"]);
    assert.equal(p.imagem, p.imagens[0]);
    // E já está na vitrine.
    assert.equal((await request(app).get(`/produtos/${p.id}`)).status, 200);
    t.produto = p.id;
  });

  test("categoria, técnica ou região desconhecida: 400", async () => {
    for (const extra of [{ categoria: "Plástico" }, { tecnica: "Impressão 3D" }, { regiao: "Lua" }, { regiao: "%" }]) {
      const r = await criar(t.artesao.token, extra);
      assert.equal(r.status, 400, JSON.stringify(extra));
      assert.equal(r.body.erro, "CORPO_INVALIDO");
    }
  });

  test("validações: preço, estoque, imagem e nome", async () => {
    for (const extra of [
      { preco: 0 },
      { preco: -5 },
      { preco: "50" },
      { preco: 10.555 },
      { estoque: -1 },
      { estoque: 1.5 },
      { imagem: "ftp://exemplo.org/a.jpg" },
      { imagem: "" },
      { nome: "ab" },
    ]) {
      const r = await criar(t.artesao.token, extra);
      assert.equal(r.status, 400, JSON.stringify(extra));
    }
  });

  test("sem login: 401; comprador: 403", async () => {
    assert.equal((await request(app).post("/produtos").send(NOVO)).status, 401);
    assert.equal((await criar(t.comprador.token)).status, 403);
  });
});

describe("PUT /produtos/:id", () => {
  test("o dono edita os dados e a foto principal; as outras fotos ficam", async () => {
    await pool.query(
      "INSERT INTO produto_imagem (produto_id, chave_armazenamento, content_type, ordem) VALUES ($1, 'https://exemplo.org/extra.jpg', 'image/jpeg', 1)",
      [t.produto],
    );
    const r = await editar(t.artesao.token, t.produto, { nome: "Moringa Editada", preco: 65.5, estoque: 3, imagem: "https://exemplo.org/nova.jpg" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.nome, r.body.preco, r.body.estoque], ["Moringa Editada", 65.5, 3]);
    assert.deepEqual(r.body.imagens, ["https://exemplo.org/nova.jpg", "https://exemplo.org/extra.jpg"]);
  });

  test("outro artesão: 403; produto inexistente: 404; corpo inválido: 400", async () => {
    assert.equal((await editar(t.outro.token, t.produto)).status, 403);
    assert.equal((await editar(t.artesao.token, 999999)).status, 404);
    assert.equal((await editar(t.artesao.token, t.produto, { preco: 0 })).status, 400);
    assert.equal((await editar(t.comprador.token, t.produto)).status, 403);
  });
});

describe("DELETE /produtos/:id", () => {
  test("desativa (exclusão lógica): some da vitrine, fica no painel e nos pedidos antigos", async () => {
    const id = (await criar(t.artesao.token)).body.id;
    const pedido = await auth(request(app).post("/pedidos"), t.comprador.token).send({
      enderecoEntrega: "Rua do Sol, 5 — Petrolina/PE",
      metodoPagamento: "pix",
      itens: [{ produtoId: id, quantidade: 1 }],
    });
    assert.equal(pedido.status, 201);

    assert.equal((await auth(request(app).delete(`/produtos/${id}`), t.outro.token)).status, 403);
    const r = await auth(request(app).delete(`/produtos/${id}`), t.artesao.token);
    assert.equal(r.status, 204);

    assert.equal((await request(app).get(`/produtos/${id}`)).status, 404);
    const painel = await auth(request(app).get(`/produtos?artesaoId=${t.artesao.id}`), t.artesao.token);
    assert.equal(painel.body.find((p) => p.id === id).status, "inativo");
    const antigo = await auth(request(app).get(`/pedidos/${pedido.body.codigo}`), t.comprador.token);
    assert.equal(antigo.body.itens[0].produto.id, id);
    assert.equal((await auth(request(app).delete("/produtos/999999"), t.artesao.token)).status, 404);
  });
});

describe("GET /artesoes/eu/indicadores", () => {
  test("artesão sem vendas: tudo zero", async () => {
    const r = await indicadores(t.outro.token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { totalVendido: 0, totalPedidos: 0, pedidosPendentes: 0, produtosAtivos: 0 });
  });

  test("conta só a parte dele, sem cancelados; pendente = ainda não começou a produzir", async () => {
    const meu = (await criar(t.outro.token, { preco: 40 })).body.id;
    const doOutro = (await criar(t.artesao.token, { preco: 300 })).body.id;
    const comprar = (itens) =>
      auth(request(app).post("/pedidos"), t.comprador.token).send({ enderecoEntrega: "Rua do Sol, 5", metodoPagamento: "pix", itens });

    const misto = (await comprar([{ produtoId: meu, quantidade: 2 }, { produtoId: doOutro, quantidade: 1 }])).body;
    const cancelado = (await comprar([{ produtoId: meu, quantidade: 1 }])).body;
    assert.equal((await auth(request(app).patch(`/pedidos/${cancelado.codigo}/status`), t.outro.token).send({ status: "cancelado" })).status, 200);

    let r = await indicadores(t.outro.token);
    assert.deepEqual(r.body, { totalVendido: 80, totalPedidos: 1, pedidosPendentes: 1, produtosAtivos: 1 });

    await auth(request(app).patch(`/pedidos/${misto.codigo}/status`), t.outro.token).send({ status: "em_producao" });
    r = await indicadores(t.outro.token);
    assert.equal(r.body.pedidosPendentes, 0);
  });

  test("comprador: 403; sem login: 401", async () => {
    assert.equal((await indicadores(t.comprador.token)).status, 403);
    assert.equal((await request(app).get("/artesoes/eu/indicadores")).status, 401);
  });
});

describe("cache da vitrine e dos filtros", () => {
  // Uma busca só deste teste, para a chave de cache não se misturar com as outras.
  const vitrine = () => request(app).get(`/produtos?busca=CacheTeste${rodada}`);

  test("a segunda leitura vem da memória (X-Cache: HIT)", async () => {
    assert.equal((await vitrine()).headers["x-cache"], "MISS");
    assert.equal((await vitrine()).headers["x-cache"], "HIT");
    await request(app).get("/filtros");
    assert.equal((await request(app).get("/filtros")).headers["x-cache"], "HIT");
  });

  test("produto gravado direto no banco não aparece até o cache vencer; pela API, aparece na hora", async () => {
    await vitrine(); // garante a chave no cache
    await pool.query(
      `INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque)
       VALUES ($1, 1, 1, 4, $2, 10, 1)`,
      [t.artesao.id, `CacheTeste${rodada} por fora`],
    );
    const daMemoria = await vitrine();
    assert.equal(daMemoria.headers["x-cache"], "HIT");
    assert.equal(daMemoria.body.length, 0, "o cache devolveu a lista guardada, sem ir ao banco");

    const criado = await criar(t.artesao.token, { nome: `CacheTeste${rodada} pela API` });
    const depois = await vitrine();
    assert.equal(depois.headers["x-cache"], "MISS", "criar produto limpa o cache");
    assert.deepEqual(depois.body.map((p) => p.nome).sort(), [`CacheTeste${rodada} pela API`, `CacheTeste${rodada} por fora`]);
    t.produtoCache = criado.body.id;
  });

  test("uma compra limpa o cache: o estoque novo aparece na vitrine", async () => {
    await vitrine();
    await auth(request(app).post("/pedidos"), t.comprador.token).send({
      enderecoEntrega: "Rua do Sol, 5",
      metodoPagamento: "pix",
      itens: [{ produtoId: t.produtoCache, quantidade: 4 }],
    });
    const r = await vitrine();
    assert.equal(r.headers["x-cache"], "MISS");
    assert.equal(r.body.find((p) => p.id === t.produtoCache).estoque, 6);
  });

  test("o painel do dono nunca usa cache", async () => {
    const painel = () => auth(request(app).get(`/produtos?artesaoId=${t.artesao.id}`), t.artesao.token);
    assert.equal((await painel()).headers["x-cache"], "MISS");
    assert.equal((await painel()).headers["x-cache"], "MISS");
  });
});
