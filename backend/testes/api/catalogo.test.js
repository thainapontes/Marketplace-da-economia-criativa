// ============================================================================
// Testes da etapa 1.2 (catálogo, só leitura) — docs/api.md, seções 3, 5 e 9.
//
// Usam o catálogo do seed e criam DOIS artesãos de teste (e-mail terminado em
// "@teste.origem.invalid"), apagados no fim junto com os produtos deles:
//   pendente  → artesão NÃO aprovado, com 1 produto ativo
//   aprovado  → artesão aprovado, com 1 produto ativo e 1 inativo
// ============================================================================

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/db.js";
import { gerarToken } from "../../src/middlewares/autenticacao.js";

const DOMINIO_TESTE = "@teste.origem.invalid";
const rodada = Date.now();
const t = {}; // ids e tokens criados no before()

async function criarArtesao(apelido, aprovado) {
  const { rows } = await pool.query(
    `INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1, $2, 'x', 'artesao') RETURNING id`,
    [`Artesão ${apelido} Teste`, `${apelido}${rodada}${DOMINIO_TESTE}`],
  );
  const id = Number(rows[0].id);
  await pool.query(
    `INSERT INTO artesao (usuario_id, nome_atelie, regiao_id, aprovado) VALUES ($1, $2, 1, $3)`,
    [id, `Ateliê ${apelido}`, aprovado],
  );
  return id;
}

async function criarProduto(artesaoId, nome, status = "ativo") {
  const { rows } = await pool.query(
    `INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque, status)
     VALUES ($1, 1, 1, 1, $2, 10, 1, $3) RETURNING id`,
    [artesaoId, nome, status],
  );
  return Number(rows[0].id);
}

const ids = (resposta) => resposta.body.map((item) => item.id);
const comToken = (req, token) => (token ? req.set("Authorization", `Bearer ${token}`) : req);
const listar = (query = "", token) => comToken(request(app).get(`/produtos${query}`), token);

before(async () => {
  t.pendente = await criarArtesao("pendente", false);
  t.aprovado = await criarArtesao("aprovado", true);
  t.produtoDoPendente = await criarProduto(t.pendente, "Peça do Pendente");
  t.ativo = await criarProduto(t.aprovado, "Peça Teste Ação 100% algodão");
  t.inativo = await criarProduto(t.aprovado, "Peça Teste Inativa", "inativo");
  t.tokenAprovado = gerarToken({ id: t.aprovado, perfil: "artesao" });
  t.tokenPendente = gerarToken({ id: t.pendente, perfil: "artesao" });
  t.tokenMaria = gerarToken({ id: 2, perfil: "artesao" });
  t.tokenAdmin = gerarToken({ id: 6, perfil: "administrador" });
  t.tokenComprador = gerarToken({ id: 1, perfil: "comprador" });
});

after(async () => {
  // produto.artesao_id não tem ON DELETE CASCADE: apaga os produtos antes.
  await pool.query(
    `DELETE FROM produto WHERE artesao_id IN (SELECT id FROM usuario WHERE email LIKE $1)`,
    [`%${DOMINIO_TESTE}`],
  );
  await pool.query("DELETE FROM usuario WHERE email LIKE $1", [`%${DOMINIO_TESTE}`]);
  await pool.end();
});

describe("GET /filtros", () => {
  test("devolve as opções do banco", async () => {
    const r = await request(app).get("/filtros");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.regioes, ["Agreste", "Zona da Mata", "RMR", "Sertão"]);
    assert.deepEqual(r.body.categorias, ["Cerâmica", "Madeira", "Renda", "Couro"]);
    assert.ok(r.body.tecnicas.includes("Renda Renascença"));
  });
});

describe("GET /produtos", () => {
  test("lista o catálogo do seed no formato Produto, em ordem de id", async () => {
    const r = await listar();
    assert.equal(r.status, 200);
    const seed = r.body.filter((p) => p.id <= 10);
    assert.deepEqual(seed.map((p) => p.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const p1 = seed[0];
    assert.deepEqual(Object.keys(p1).sort(), [
      "artesao", "artesaoId", "categoria", "descricao", "estoque", "id", "imagem", "imagens",
      "nome", "preco", "precoOriginal", "regiao", "status", "tecnica",
    ]);
    assert.equal(p1.preco, 285);
    assert.equal(p1.precoOriginal, 340);
    assert.equal(p1.artesao, "Maria das Graças Silva");
    assert.equal(p1.artesaoId, 2);
    assert.equal(p1.categoria, "Cerâmica");
    assert.equal(p1.regiao, "Agreste");
    assert.equal(p1.imagens.length, 2);
    assert.equal(p1.imagem, p1.imagens[0]);
    assert.ok(!("precoOriginal" in seed[1]), "produto sem preço 'de' não traz o campo");
  });

  test("vitrine pública: sem inativo e sem produto de artesão não aprovado", async () => {
    const lista = ids(await listar());
    assert.ok(lista.includes(t.ativo));
    assert.ok(!lista.includes(t.inativo));
    assert.ok(!lista.includes(t.produtoDoPendente));
  });

  test("o dono, filtrando pelo próprio artesaoId, vê também os inativos", async () => {
    assert.deepEqual(ids(await listar(`?artesaoId=${t.aprovado}`, t.tokenAprovado)), [t.ativo, t.inativo]);
    // Outra pessoa (ou visitante) filtrando pelo mesmo artesão só vê o ativo.
    assert.deepEqual(ids(await listar(`?artesaoId=${t.aprovado}`, t.tokenMaria)), [t.ativo]);
    assert.deepEqual(ids(await listar(`?artesaoId=${t.aprovado}`)), [t.ativo]);
  });

  test("filtros por nome; 'Todas' e vazio são ignorados", async () => {
    const agreste = (await listar("?regiao=Agreste&categoria=Cerâmica")).body.filter((p) => p.id <= 10);
    assert.deepEqual(agreste.map((p) => p.id), [1, 5, 9]);
    assert.deepEqual(ids(await listar("?tecnica=Couro Cru")), [4, 8]);
    assert.deepEqual(ids(await listar("?regiao=Todas&categoria=&tecnica=Todas")), ids(await listar()));
    assert.deepEqual(ids(await listar("?regiao=Lua")), []);
  });

  test("busca sem diferenciar maiúsculas e acentos, em produto, artesão e técnica", async () => {
    assert.deepEqual(ids(await listar("?busca=ORATORIO")), [2]); // "Oratório"
    assert.deepEqual(ids(await listar(`?busca=${encodeURIComponent("oratório")}`)), [2]); // acento no termo
    assert.deepEqual(ids(await listar("?busca=sebastiao")), [4, 8]); // nome do artesão
    assert.deepEqual(ids(await listar("?busca=renascenca")), [3, 7]); // técnica
    assert.deepEqual(ids(await listar("?busca=acao")), [t.ativo]);
  });

  test("% e _ na busca são texto, não curinga", async () => {
    assert.deepEqual(ids(await listar(`?busca=${encodeURIComponent("100%")}`)), [t.ativo]);
    assert.deepEqual(ids(await listar("?busca=%25")), [t.ativo]); // só o nosso tem "%"
    assert.deepEqual(ids(await listar("?busca=_")), []);
  });

  test("artesaoId inválido ou parâmetro repetido → 400", async () => {
    assert.equal((await listar("?artesaoId=abc")).status, 400);
    assert.equal((await listar("?regiao=Agreste&regiao=RMR")).status, 400);
  });

  test("token vencido ou inválido não derruba a vitrine: segue como visitante", async () => {
    const r = await listar(`?artesaoId=${t.aprovado}`, "token-quebrado");
    assert.equal(r.status, 200);
    assert.deepEqual(ids(r), [t.ativo]);
  });
});

describe("GET /produtos/:id", () => {
  test("produto público para qualquer um", async () => {
    const r = await request(app).get(`/produtos/${t.ativo}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.imagem, ""); // sem foto cadastrada
    assert.deepEqual(r.body.imagens, []);
  });

  test("inativo: 404 para visitante e outros; visível para o dono e o admin", async () => {
    const ver = (id, token) => comToken(request(app).get(`/produtos/${id}`), token);
    assert.equal((await ver(t.inativo)).status, 404);
    assert.equal((await ver(t.inativo, t.tokenMaria)).status, 404);
    assert.equal((await ver(t.inativo, t.tokenComprador)).status, 404);
    assert.equal((await ver(t.inativo, t.tokenAprovado)).body.status, "inativo");
    assert.equal((await ver(t.inativo, t.tokenAdmin)).status, 200);
    // Produto de artesão não aprovado: mesma regra.
    assert.equal((await ver(t.produtoDoPendente)).status, 404);
    assert.equal((await ver(t.produtoDoPendente, t.tokenPendente)).status, 200);
  });

  test("id inexistente ou não numérico → 404 NAO_ENCONTRADO", async () => {
    for (const id of ["999999", "abc", "0"]) {
      const r = await request(app).get(`/produtos/${id}`);
      assert.equal(r.status, 404);
      assert.equal(r.body.erro, "NAO_ENCONTRADO");
    }
  });
});

describe("GET /produtos/:id/avaliacoes", () => {
  test("mais recentes primeiro, com o nome do autor", async () => {
    const r = await request(app).get("/produtos/1/avaliacoes");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((a) => a.id), [1, 2]);
    assert.deepEqual(r.body[0], {
      id: 1,
      produtoId: 1,
      usuarioNome: "Camila Torres",
      nota: 5,
      comentario: "Peça linda, chegou muito bem embalada e com certificado de autenticidade.",
      criadoEm: "2026-08-22T10:00:00.000Z",
    });
  });

  test("produto sem avaliação → lista vazia; produto escondido → 404", async () => {
    assert.deepEqual((await request(app).get(`/produtos/${t.ativo}/avaliacoes`)).body, []);
    assert.equal((await request(app).get(`/produtos/${t.inativo}/avaliacoes`)).status, 404);
    assert.equal((await request(app).get("/produtos/999999/avaliacoes")).status, 404);
  });
});

describe("GET /artesoes", () => {
  test("só aprovados, com os campos calculados", async () => {
    const r = await request(app).get("/artesoes");
    assert.equal(r.status, 200);
    const lista = ids(r);
    assert.deepEqual(lista.filter((id) => id <= 5), [2, 3, 4, 5]);
    assert.ok(lista.includes(t.aprovado));
    assert.ok(!lista.includes(t.pendente));

    const maria = r.body.find((a) => a.id === 2);
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT pe.id)::int AS n FROM pedido pe JOIN item_pedido ip ON ip.pedido_id = pe.id
        WHERE ip.artesao_id = 2 AND pe.status <> 'cancelado'`,
    );
    assert.deepEqual({ ...maria, totalVendas: undefined }, {
      id: 2,
      usuarioId: 2,
      nome: "Maria das Graças Silva",
      nomeAtelie: "Ateliê Alto do Moura",
      cidade: "Caruaru",
      regiao: "Agreste",
      biografia: maria.biografia,
      fotoUrl: maria.fotoUrl,
      capaUrl: maria.capaUrl,
      tecnicas: ["Cerâmica", "Barro Cozido", "Alto do Moura"],
      avaliacaoMedia: 4.5, // notas 5 e 4 no produto 1
      totalVendas: undefined,
      totalProdutos: 3,
      desde: 1993,
      aprovado: true,
    });
    assert.ok(maria.biografia.startsWith("Nascida no coração"));
    assert.equal(maria.totalVendas, rows[0].n);
  });

  test("artesão sem avaliação, sem venda e sem ano informado", async () => {
    const novo = (await request(app).get("/artesoes")).body.find((a) => a.id === t.aprovado);
    assert.equal(novo.avaliacaoMedia, 0);
    assert.equal(novo.totalVendas, 0);
    assert.equal(novo.totalProdutos, 1); // o inativo não conta
    assert.deepEqual(novo.tecnicas, []);
    assert.equal(novo.desde, new Date().getUTCFullYear());
  });
});

describe("GET /artesoes/:id", () => {
  test("aprovado é público", async () => {
    const r = await request(app).get("/artesoes/3");
    assert.equal(r.status, 200);
    assert.equal(r.body.nome, "João Ferreira Neto");
  });

  test("pendente: 404 para o público, visível para ele mesmo e para o admin", async () => {
    const ver = (token) => comToken(request(app).get(`/artesoes/${t.pendente}`), token);
    assert.equal((await ver()).status, 404);
    assert.equal((await ver(t.tokenMaria)).status, 404);
    assert.equal((await ver(t.tokenPendente)).body.aprovado, false);
    assert.equal((await ver(t.tokenAdmin)).status, 200);
  });

  test("comprador não é artesão → 404; id inválido → 404", async () => {
    assert.equal((await request(app).get("/artesoes/1")).status, 404);
    assert.equal((await request(app).get("/artesoes/xyz")).status, 404);
  });
});
