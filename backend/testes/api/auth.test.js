// ============================================================================
// Testes da etapa 1.1 (autenticação) — docs/api.md, seções 1, 2 e 4.
//
// Estes testes CRIAM usuários (cadastro), sempre com e-mail terminado em
// "@teste.origem.invalid", e os APAGAM no fim. Os usuários do seed não são
// alterados.
// ============================================================================

import { test, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";
import { config } from "../../src/config/env.js";

const DOMINIO_TESTE = "@teste.origem.invalid";
const rodada = Date.now();
let contador = 0;
const emailNovo = () => `u${rodada}-${++contador}${DOMINIO_TESTE}`;

after(async () => {
  // artesao tem ON DELETE CASCADE a partir de usuario.
  await pool.query("DELETE FROM usuario WHERE email LIKE $1", [`%${DOMINIO_TESTE}`]);
  await pool.end();
});

function assertErro(resposta, status, codigo) {
  assert.equal(resposta.status, status, JSON.stringify(resposta.body));
  assert.equal(resposta.body.erro, codigo);
  assert.equal(typeof resposta.body.mensagem, "string");
}

const login = (email, senha = "origem123") => request(app).post("/auth/login").send({ email, senha });
const eu = (token) => request(app).get("/auth/eu").set("Authorization", `Bearer ${token}`);

describe("POST /auth/login", () => {
  test("comprador do seed entra e recebe token + usuário, sem senha", async () => {
    const r = await login("comprador@origem.com.br");
    assert.equal(r.status, 200);
    assert.equal(typeof r.body.token, "string");
    assert.deepEqual(r.body.usuario, {
      id: 1,
      nome: "Camila Torres",
      email: "comprador@origem.com.br",
      perfil: "comprador",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&auto=format",
      criadoEm: "2025-02-10T12:00:00.000Z", // UTC, sem deslocamento de fuso
    });
    assert.ok(!JSON.stringify(r.body).includes("senha"));
  });

  test("artesão recebe artesaoId igual ao próprio id", async () => {
    const r = await login("maria@origem.com.br");
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.perfil, "artesao");
    assert.equal(r.body.usuario.artesaoId, r.body.usuario.id);
  });

  test("e-mail não diferencia maiúsculas", async () => {
    assert.equal((await login("  Comprador@ORIGEM.com.br ")).status, 200);
  });

  test("senha errada e e-mail inexistente dão a MESMA resposta", async () => {
    const senhaErrada = await login("comprador@origem.com.br", "errada");
    const semConta = await login(`ninguem${DOMINIO_TESTE}`);
    assertErro(senhaErrada, 401, "CREDENCIAIS_INVALIDAS");
    assertErro(semConta, 401, "CREDENCIAIS_INVALIDAS");
    assert.equal(senhaErrada.body.mensagem, semConta.body.mensagem);
  });

  test("corpo sem senha devolve 400", async () => {
    assertErro(await request(app).post("/auth/login").send({ email: "a@b.com" }), 400, "CORPO_INVALIDO");
  });
});

describe("POST /auth/registrar", () => {
  test("comprador se cadastra e o token já funciona em /auth/eu", async () => {
    const email = emailNovo();
    const r = await request(app)
      .post("/auth/registrar")
      .send({ nome: "  Teste Comprador ", email: email.toUpperCase(), senha: "segredo1", perfil: "comprador" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.usuario.nome, "Teste Comprador");
    assert.equal(r.body.usuario.email, email, "e-mail deve ser salvo em minúsculas");
    assert.equal(r.body.usuario.artesaoId, undefined);

    const sessao = await eu(r.body.token);
    assert.equal(sessao.status, 200);
    assert.equal(sessao.body.id, r.body.usuario.id);

    // E consegue fazer login com a senha cadastrada.
    assert.equal((await login(email, "segredo1")).status, 200);
  });

  test("a senha é guardada com bcrypt, nunca em texto puro", async () => {
    const email = emailNovo();
    await request(app).post("/auth/registrar").send({ nome: "Teste", email, senha: "segredo1", perfil: "comprador" });
    const { rows } = await pool.query("SELECT senha_hash FROM usuario WHERE email = $1", [email]);
    assert.match(rows[0].senha_hash, /^\$2[aby]\$10\$/);
    assert.ok(!rows[0].senha_hash.includes("segredo1"));
  });

  test("artesão com região: cria usuário + artesão NÃO aprovado", async () => {
    const email = emailNovo();
    const r = await request(app)
      .post("/auth/registrar")
      .send({ nome: "Teste Artesã", email, senha: "segredo1", perfil: "artesao", regiao: "agreste" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.usuario.artesaoId, r.body.usuario.id);

    const { rows } = await pool.query(
      `SELECT a.aprovado, a.nome_atelie, r.nome AS regiao
         FROM artesao a JOIN regiao r ON r.id = a.regiao_id WHERE a.usuario_id = $1`,
      [r.body.usuario.id],
    );
    assert.deepEqual(rows[0], { aprovado: false, nome_atelie: "Teste Artesã", regiao: "Agreste" });
  });

  test("artesão sem região ou com região inexistente: 400 e nada é gravado", async () => {
    const email = emailNovo();
    const base = { nome: "Teste", email, senha: "segredo1", perfil: "artesao" };
    assertErro(await request(app).post("/auth/registrar").send(base), 400, "CORPO_INVALIDO");
    assertErro(await request(app).post("/auth/registrar").send({ ...base, regiao: "Atlântida" }), 400, "CORPO_INVALIDO");
    const { rowCount } = await pool.query("SELECT 1 FROM usuario WHERE email = $1", [email]);
    assert.equal(rowCount, 0, "a transação deveria ter desfeito o usuário");
  });

  test("e-mail já cadastrado (qualquer caixa) devolve 409", async () => {
    const r = await request(app)
      .post("/auth/registrar")
      .send({ nome: "Outra Camila", email: "COMPRADOR@origem.com.br", senha: "segredo1", perfil: "comprador" });
    assertErro(r, 409, "EMAIL_EM_USO");
  });

  test("cadastro SIMULTÂNEO com o mesmo e-mail: o segundo recebe 409, não 500", async () => {
    // Disparar várias requisições ao mesmo tempo não garante a disputa (elas
    // tendem a chegar ao banco uma de cada vez). Aqui a disputa é forçada:
    //   1. outra transação insere o e-mail e NÃO confirma;
    //   2. a API faz a checagem (não vê a linha ainda) e tenta o INSERT, que
    //      fica travado no índice UNIQUE esperando a outra transação;
    //   3. a outra transação confirma → o INSERT da API falha com 23505.
    const email = emailNovo();
    const concorrente = await pool.connect();
    try {
      await concorrente.query("BEGIN");
      await concorrente.query(
        "INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ('Concorrente', $1, 'x', 'comprador')",
        [email],
      );
      const pendente = request(app)
        .post("/auth/registrar")
        .send({ nome: "Teste", email, senha: "segredo1", perfil: "comprador" })
        .then((r) => r); // .then() dispara a requisição agora, sem esperar
      await new Promise((resolve) => setTimeout(resolve, 400)); // a API chega ao INSERT e trava
      await concorrente.query("COMMIT");
      assertErro(await pendente, 409, "EMAIL_EM_USO");
    } finally {
      concorrente.release();
    }
  });

  test("ninguém se cadastra como administrador", async () => {
    const r = await request(app)
      .post("/auth/registrar")
      .send({ nome: "Hacker", email: emailNovo(), senha: "segredo1", perfil: "administrador" });
    assertErro(r, 400, "CORPO_INVALIDO");
  });

  test("validações: senha curta, senha longa demais, e-mail inválido, nome vazio", async () => {
    const ok = { nome: "Teste", email: emailNovo(), senha: "segredo1", perfil: "comprador" };
    for (const ruim of [
      { senha: "12345" },
      { senha: "a".repeat(73) },
      { email: "sem-arroba" },
      { nome: "   " },
    ]) {
      assertErro(await request(app).post("/auth/registrar").send({ ...ok, ...ruim }), 400, "CORPO_INVALIDO");
    }
  });

  // CT-26: os limites exatos (6 e 72 caracteres) são ACEITOS, e a senha de 72 funciona no login.
  test("senhas nos limites (6 e 72 caracteres) são aceitas", async () => {
    for (const senha of ["123456", "a".repeat(72)]) {
      const email = emailNovo();
      const r = await request(app).post("/auth/registrar").send({ nome: "Teste", email, senha, perfil: "comprador" });
      assert.equal(r.status, 201, `senha de ${senha.length}: ${JSON.stringify(r.body)}`);
      assert.equal((await login(email, senha)).status, 200);
    }
  });
});

describe("GET /auth/eu e tokens", () => {
  test("sem token: 401", async () => {
    assertErro(await request(app).get("/auth/eu"), 401, "NAO_AUTENTICADO");
  });

  test("cabeçalho em outro formato (Basic): 401", async () => {
    assertErro(await request(app).get("/auth/eu").set("Authorization", "Basic abc"), 401, "NAO_AUTENTICADO");
  });

  test("token adulterado, assinado com outro segredo ou sem assinatura: 401", async () => {
    const { body } = await login("comprador@origem.com.br");
    const adulterado = body.token.slice(0, -2) + (body.token.endsWith("aa") ? "bb" : "aa");
    const outroSegredo = jwt.sign({ perfil: "administrador" }, "segredo-falso", { subject: "6" });
    const semAssinatura = jwt.sign({ perfil: "administrador" }, null, { subject: "6", algorithm: "none" });
    for (const token of [adulterado, outroSegredo, semAssinatura]) {
      assertErro(await eu(token), 401, "NAO_AUTENTICADO");
    }
  });

  test("token expirado: 401 com mensagem de sessão expirada", async () => {
    const expirado = jwt.sign({ perfil: "comprador", exp: Math.floor(Date.now() / 1000) - 60 }, config.jwtSegredo, {
      subject: "1",
    });
    const r = await eu(expirado);
    assertErro(r, 401, "NAO_AUTENTICADO");
    assert.match(r.body.mensagem, /expirou/);
  });

  test("token válido de conta apagada: 401", async () => {
    const email = emailNovo();
    const { body } = await request(app)
      .post("/auth/registrar")
      .send({ nome: "Teste", email, senha: "segredo1", perfil: "comprador" });
    await pool.query("DELETE FROM usuario WHERE email = $1", [email]);
    assertErro(await eu(body.token), 401, "NAO_AUTENTICADO");
  });

  test("o perfil vem do banco, não do token", async () => {
    // Token legítimo do comprador 1, mas com perfil "administrador" no conteúdo.
    const forjado = jwt.sign({ perfil: "administrador" }, config.jwtSegredo, { subject: "1" });
    const r = await eu(forjado);
    assert.equal(r.status, 200);
    assert.equal(r.body.perfil, "comprador");
  });
});

describe("GET /usuarios/:id", () => {
  const tokenDe = async (email) => (await login(email)).body.token;

  test("o próprio usuário: 200", async () => {
    const r = await request(app).get("/usuarios/1").set("Authorization", `Bearer ${await tokenDe("comprador@origem.com.br")}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.id, 1);
  });

  test("outro usuário: 403, exista ou não o id", async () => {
    const token = await tokenDe("comprador@origem.com.br");
    for (const id of [2, 999999]) {
      assertErro(await request(app).get(`/usuarios/${id}`).set("Authorization", `Bearer ${token}`), 403, "SEM_PERMISSAO");
    }
  });

  test("administrador vê qualquer usuário; id inexistente: 404", async () => {
    const token = await tokenDe("admin@origem.com.br");
    const r = await request(app).get("/usuarios/2").set("Authorization", `Bearer ${token}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.nome, "Maria das Graças Silva");
    assertErro(await request(app).get("/usuarios/999999").set("Authorization", `Bearer ${token}`), 404, "NAO_ENCONTRADO");
    assertErro(await request(app).get("/usuarios/abc").set("Authorization", `Bearer ${token}`), 404, "NAO_ENCONTRADO");
  });

  test("sem token: 401", async () => {
    assertErro(await request(app).get("/usuarios/1"), 401, "NAO_AUTENTICADO");
  });
});
