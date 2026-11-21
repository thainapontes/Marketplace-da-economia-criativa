// ============================================================================
// Testes da administração (etapa E.2/E.3) — docs/api.md, seção 7.
//
// Usam o admin do seed (admin@origem.com.br) e criam artesãos e compradores
// próprios (e-mail "@admin.teste.origem.invalid"). Tudo o que criam é apagado
// no fim; o seed não muda.
// ============================================================================

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";

const DOMINIO_TESTE = "@admin.teste.origem.invalid";
const rodada = Date.now();
const t = {};
let contador = 0;

async function criarUsuario(apelido, perfil) {
  const r = await request(app)
    .post("/auth/registrar")
    .send({ nome: `Teste ${apelido}`, email: `${apelido}${rodada}-${contador++}${DOMINIO_TESTE}`, senha: "segredo1", perfil, regiao: "Sertão" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.usuario.id, token: r.body.token };
}

const login = async (email) => (await request(app).post("/auth/login").send({ email, senha: "origem123" })).body.token;
const como = (req, token) => (token ? req.set("Authorization", `Bearer ${token}`) : req);
const get = (rota, token) => como(request(app).get(rota), token);
const aprovar = (id, token) => como(request(app).patch(`/admin/artesoes/${id}/aprovar`), token);
const rejeitar = (id, token) => como(request(app).delete(`/admin/artesoes/${id}`), token);

/** Produto de um artesão (direto no banco: artesão pendente também pode cadastrar). */
async function criarProduto(artesaoId) {
  const { rows } = await pool.query(
    `INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque)
     VALUES ($1, 1, 1, 1, 'Peça do teste de admin', 10, 2) RETURNING id`,
    [artesaoId],
  );
  return rows[0].id;
}

before(async () => {
  t.admin = await login("admin@origem.com.br");
  t.comprador = await criarUsuario("comprador", "comprador");
  t.pendente = await criarUsuario("pendente", "artesao");
  t.produtoDoPendente = await criarProduto(t.pendente.id);
});

after(async () => {
  const usuarios = `SELECT id FROM usuario WHERE email LIKE '%${DOMINIO_TESTE}'`;
  await pool.query(`DELETE FROM classificacao_produto WHERE produto_id IN (SELECT id FROM produto WHERE artesao_id IN (${usuarios}))`);
  await pool.query(`DELETE FROM produto WHERE artesao_id IN (${usuarios})`);
  await pool.query(`DELETE FROM usuario WHERE email LIKE '%${DOMINIO_TESTE}'`);
  await pool.end();
});

describe("permissões", () => {
  const rotas = [
    ["GET", "/admin/indicadores"],
    ["GET", "/admin/artesoes/pendentes"],
    ["PATCH", "/admin/artesoes/2/aprovar"],
    ["DELETE", "/admin/artesoes/2"],
  ];

  test("sem login: 401 em todas as rotas", async () => {
    for (const [metodo, rota] of rotas) {
      const r = await request(app)[metodo.toLowerCase()](rota);
      assert.equal(r.status, 401, `${metodo} ${rota}`);
    }
  });

  test("comprador e artesão: 403 em todas as rotas", async () => {
    for (const token of [t.comprador.token, t.pendente.token]) {
      for (const [metodo, rota] of rotas) {
        const r = await como(request(app)[metodo.toLowerCase()](rota), token);
        assert.equal(r.status, 403, `${metodo} ${rota}`);
        assert.equal(r.body.erro, "SEM_PERMISSAO");
      }
    }
  });
});

describe("GET /admin/indicadores", () => {
  // Os arquivos de teste rodam em paralelo e criam/apagam usuários e pedidos ao
  // mesmo tempo, então um número exato pode mudar entre a leitura do teste e a
  // da API. Por isso a view é lida antes e depois: a resposta tem que ficar entre as duas.
  const daView = async () => (await pool.query(`
    SELECT total_usuarios::int AS "totalUsuarios", produtos_ativos::int AS "produtosAtivos",
           total_pedidos::int AS "totalPedidos", total_vendas::float AS "totalVendas"
      FROM vw_indicadores_admin`)).rows[0];

  test("os quatro números vêm da vw_indicadores_admin", async () => {
    const antes = await daView();
    const r = await get("/admin/indicadores", t.admin);
    const depois = await daView();
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ["produtosAtivos", "totalPedidos", "totalUsuarios", "totalVendas"]);
    for (const campo of Object.keys(antes)) {
      const [min, max] = [Math.min(antes[campo], depois[campo]), Math.max(antes[campo], depois[campo])];
      assert.equal(typeof r.body[campo], "number", campo);
      assert.ok(r.body[campo] >= min && r.body[campo] <= max, `${campo}: ${r.body[campo]} fora de [${min}, ${max}]`);
    }
    assert.ok(r.body.totalUsuarios >= 13 && r.body.totalVendas > 0); // pelo menos o seed
  });
});

describe("artesãos pendentes", () => {
  test("a lista traz o pendente e nenhum aprovado", async () => {
    const r = await get("/admin/artesoes/pendentes", t.admin);
    assert.equal(r.status, 200);
    assert.ok(r.body.some((a) => a.id === t.pendente.id));
    assert.ok(r.body.every((a) => a.aprovado === false));
    assert.ok(!r.body.some((a) => a.id === 2)); // Maria, aprovada no seed
  });

  test("aprovar: 200, sai da lista de pendentes e o produto dele entra na vitrine", async () => {
    const outro = await criarUsuario("aprovar", "artesao");
    const produto = await criarProduto(outro.id);
    assert.equal((await request(app).get(`/produtos/${produto}`)).status, 404); // pendente: escondido
    await request(app).get("/produtos"); // aquece o cache da vitrine

    const r = await aprovar(outro.id, t.admin);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.aprovado, true);
    assert.equal(r.body.id, outro.id);

    const pendentes = (await get("/admin/artesoes/pendentes", t.admin)).body;
    assert.ok(!pendentes.some((a) => a.id === outro.id));
    assert.equal((await request(app).get(`/produtos/${produto}`)).status, 200);
    // O cache foi limpo: a vitrine já mostra o produto.
    assert.ok((await request(app).get("/produtos")).body.some((p) => p.id === Number(produto)));
    t.aprovado = outro;
  });

  test("aprovar de novo quem já está aprovado: 200, sem mudar nada", async () => {
    const r = await aprovar(t.aprovado.id, t.admin);
    assert.equal(r.status, 200);
    assert.equal(r.body.aprovado, true);
  });

  test("rejeitar artesão aprovado: 400, e ele continua lá", async () => {
    const r = await rejeitar(t.aprovado.id, t.admin);
    assert.equal(r.status, 400);
    assert.equal(r.body.erro, "CORPO_INVALIDO");
    assert.equal((await request(app).get(`/artesoes/${t.aprovado.id}`)).status, 200);
  });

  test("rejeitar pendente: 204, apaga o usuário e os produtos dele (inclusive classificados pela IA)", async () => {
    await pool.query(
      "INSERT INTO classificacao_produto (produto_id, classe, confianca, status) VALUES ($1, 'Cerâmica', 1, 'aprovado')",
      [t.produtoDoPendente],
    );
    const r = await rejeitar(t.pendente.id, t.admin);
    assert.equal(r.status, 204, JSON.stringify(r.body));
    const { rows } = await pool.query(
      "SELECT (SELECT COUNT(*) FROM usuario WHERE id = $1)::int AS u, (SELECT COUNT(*) FROM produto WHERE id = $2)::int AS p",
      [t.pendente.id, t.produtoDoPendente],
    );
    assert.deepEqual(rows[0], { u: 0, p: 0 });
    // O token antigo dele não abre mais nada.
    assert.equal((await get("/auth/eu", t.pendente.token)).status, 401);
  });

  test("id inexistente, de comprador ou não numérico: 404", async () => {
    for (const id of [999999, t.comprador.id, "abc"]) {
      assert.equal((await aprovar(id, t.admin)).status, 404, `aprovar ${id}`);
      assert.equal((await rejeitar(id, t.admin)).status, 404, `rejeitar ${id}`);
    }
  });
});
