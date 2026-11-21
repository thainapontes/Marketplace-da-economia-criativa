// ============================================================================
// Testes de POST /produtos/:id/avaliacoes (etapa E.1) — docs/api.md, seção 5.
//
// Criam compradores e um artesão próprios (e-mail "@avaliacoes.teste.origem.invalid")
// e avaliam produtos do seed. Tudo o que criam é apagado no fim; o seed não muda.
// ============================================================================

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";

const DOMINIO_TESTE = "@avaliacoes.teste.origem.invalid";
const rodada = Date.now();
const t = {};

async function criarUsuario(apelido, perfil) {
  const r = await request(app)
    .post("/auth/registrar")
    .send({ nome: `Teste ${apelido}`, email: `${apelido}${rodada}${DOMINIO_TESTE}`, senha: "segredo1", perfil, regiao: "Sertão" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.usuario.id, token: r.body.token };
}

const avaliar = (token, produtoId, corpo) => {
  const req = request(app).post(`/produtos/${produtoId}/avaliacoes`);
  return (token ? req.set("Authorization", `Bearer ${token}`) : req).send(corpo);
};

before(async () => {
  t.comprador = await criarUsuario("comprador", "comprador");
  t.outro = await criarUsuario("outro", "comprador");
  t.artesao = await criarUsuario("artesao", "artesao"); // fica pendente
  // Produto de artesão pendente: escondido da vitrine.
  const { rows } = await pool.query(
    `INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque)
     VALUES ($1, 1, 1, 1, 'Peça de artesão pendente', 10, 1) RETURNING id`,
    [t.artesao.id],
  );
  t.produtoEscondido = rows[0].id;
});

after(async () => {
  const usuarios = `SELECT id FROM usuario WHERE email LIKE '%${DOMINIO_TESTE}'`;
  await pool.query(`DELETE FROM avaliacao_produto WHERE usuario_id IN (${usuarios})`);
  await pool.query(`DELETE FROM produto WHERE artesao_id IN (${usuarios})`);
  await pool.query(`DELETE FROM usuario WHERE email LIKE '%${DOMINIO_TESTE}'`);
  await pool.end();
});

describe("POST /produtos/:id/avaliacoes", () => {
  test("comprador avalia: 201, autor do login, e a avaliação aparece primeiro na lista", async () => {
    const r = await avaliar(t.comprador.token, 3, { nota: 4, comentario: "  Renda delicada.  ", usuarioNome: "Outra Pessoa" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.usuarioNome, "Teste comprador"); // o nome do corpo é ignorado
    assert.deepEqual([r.body.produtoId, r.body.nota, r.body.comentario], [3, 4, "Renda delicada."]);
    const lista = await request(app).get("/produtos/3/avaliacoes");
    assert.equal(lista.body[0].id, r.body.id);
  });

  test("segunda avaliação do mesmo comprador no mesmo produto: 409", async () => {
    const r = await avaliar(t.comprador.token, 3, { nota: 1 });
    assert.equal(r.status, 409);
    assert.equal(r.body.erro, "AVALIACAO_DUPLICADA");
  });

  test("outro comprador pode avaliar o mesmo produto; comentário é opcional", async () => {
    const r = await avaliar(t.outro.token, 3, { nota: 5 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.comentario, "");
  });

  test("nota fora de 1 a 5, não inteira ou ausente, e comentário longo demais: 400", async () => {
    for (const corpo of [{ nota: 0 }, { nota: 6 }, { nota: 4.5 }, { nota: "5" }, {}, { nota: 3, comentario: "x".repeat(1001) }, { nota: 3, comentario: 7 }]) {
      const r = await avaliar(t.comprador.token, 1, corpo);
      assert.equal(r.status, 400, JSON.stringify(corpo));
      assert.equal(r.body.erro, "CORPO_INVALIDO");
    }
  });

  test("sem login: 401; artesão: 403", async () => {
    assert.equal((await avaliar(null, 1, { nota: 5 })).status, 401);
    const r = await avaliar(t.artesao.token, 1, { nota: 5 });
    assert.equal(r.status, 403);
    assert.equal(r.body.erro, "SEM_PERMISSAO");
  });

  test("produto inexistente ou escondido da vitrine: 404", async () => {
    assert.equal((await avaliar(t.comprador.token, 999999, { nota: 5 })).status, 404);
    assert.equal((await avaliar(t.comprador.token, t.produtoEscondido, { nota: 5 })).status, 404);
  });

  test("duas avaliações ao mesmo tempo: só uma entra (a UNIQUE do banco decide)", async () => {
    const [a, b] = await Promise.all([avaliar(t.outro.token, 1, { nota: 5 }), avaliar(t.outro.token, 1, { nota: 4 })]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  });
});
