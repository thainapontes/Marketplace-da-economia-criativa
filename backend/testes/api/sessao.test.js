// ============================================================================
// Testes da etapa B (sessão por cookie) — docs/api.md, seção 1.
//
// Usam as contas do seed e criam usuários com e-mail terminado em
// "@teste.origem.invalid", apagados no fim.
// ============================================================================

import { test, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";
import { config } from "../../src/config/env.js";
import { COOKIE_SESSAO, opcoesDoCookie } from "../../src/middlewares/autenticacao.js";

const DOMINIO_TESTE = "@teste.origem.invalid";
const rodada = Date.now();

after(async () => {
  await pool.query("DELETE FROM usuario WHERE email LIKE $1", [`%${DOMINIO_TESTE}`]);
  await pool.end();
});

const login = (email, senha = "origem123") => request(app).post("/auth/login").send({ email, senha });

/** O cabeçalho Set-Cookie do cookie de sessão, já separado em atributos. */
function cookieDaResposta(resposta) {
  const linha = (resposta.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${COOKIE_SESSAO}=`));
  assert.ok(linha, "a resposta não gravou o cookie de sessão");
  const [par, ...atributos] = linha.split("; ");
  return { valor: par.slice(COOKIE_SESSAO.length + 1), atributos, linha };
}

const comCookie = (req, token) => req.set("Cookie", `${COOKIE_SESSAO}=${token}`);

describe("gravação do cookie", () => {
  test("login grava o mesmo token do corpo, httpOnly, SameSite=Lax, vencendo junto com o token", async () => {
    const r = await login("comprador@origem.com.br");
    assert.equal(r.status, 200);
    const cookie = cookieDaResposta(r);
    assert.equal(cookie.valor, r.body.token);
    assert.ok(cookie.atributos.includes("HttpOnly"));
    assert.ok(cookie.atributos.includes("SameSite=Lax"));
    assert.ok(cookie.atributos.includes("Path=/"));
    assert.ok(!cookie.atributos.includes("Secure"), "em desenvolvimento (http) o cookie não pode exigir HTTPS");

    const expira = Date.parse(cookie.atributos.find((a) => a.startsWith("Expires=")).slice(8));
    assert.equal(expira / 1000, jwt.decode(r.body.token).exp);
  });

  test("cadastro também grava o cookie", async () => {
    const r = await request(app)
      .post("/auth/registrar")
      .send({ nome: "Teste Cookie", email: `c${rodada}${DOMINIO_TESTE}`, senha: "segredo1", perfil: "comprador" });
    assert.equal(r.status, 201);
    assert.equal(cookieDaResposta(r).valor, r.body.token);
  });

  test("login recusado não grava cookie", async () => {
    const r = await login("comprador@origem.com.br", "errada");
    assert.equal(r.status, 401);
    assert.equal(r.headers["set-cookie"], undefined);
  });

  test("em produção o cookie exige HTTPS (Secure)", () => {
    assert.equal(opcoesDoCookie(true).secure, true);
    assert.equal(opcoesDoCookie(false).secure, false);
    assert.equal(opcoesDoCookie(true).httpOnly, true);
  });
});

describe("autenticação pelo cookie", () => {
  test("/auth/eu funciona só com o cookie", async () => {
    const { body } = await login("maria@origem.com.br");
    const r = await comCookie(request(app).get("/auth/eu"), body.token);
    assert.equal(r.status, 200);
    assert.equal(r.body.email, "maria@origem.com.br");
  });

  test("regras de permissão valem igual: o próprio usuário sim, outro não", async () => {
    const { body } = await login("comprador@origem.com.br");
    assert.equal((await comCookie(request(app).get(`/usuarios/${body.usuario.id}`), body.token)).status, 200);
    assert.equal((await comCookie(request(app).get("/usuarios/2"), body.token)).status, 403);
  });

  test("cookie adulterado ou vencido em rota protegida: 401", async () => {
    const { body } = await login("comprador@origem.com.br");
    const vencido = jwt.sign({ perfil: "comprador", exp: Math.floor(Date.now() / 1000) - 60 }, config.jwtSegredo, {
      subject: "1",
    });
    for (const token of [body.token.slice(0, -3) + "xyz", vencido, ""]) {
      const r = await comCookie(request(app).get("/auth/eu"), token);
      assert.equal(r.status, 401, `token "${token.slice(0, 10)}..."`);
      assert.equal(r.body.erro, "NAO_AUTENTICADO");
    }
  });

  test("cookie inválido em rota pública: segue como visitante", async () => {
    const r = await comCookie(request(app).get("/produtos"), "lixo");
    assert.equal(r.status, 200);
    assert.ok(r.body.length > 0);
  });

  test("o cabeçalho Bearer manda sobre o cookie", async () => {
    const comprador = (await login("comprador@origem.com.br")).body.token;
    const maria = (await login("maria@origem.com.br")).body.token;
    const r = await comCookie(request(app).get("/auth/eu").set("Authorization", `Bearer ${comprador}`), maria);
    assert.equal(r.body.email, "comprador@origem.com.br");

    // Cabeçalho malformado não "cai" para o cookie: é 401.
    const malformado = await comCookie(request(app).get("/auth/eu").set("Authorization", "Basic abc"), maria);
    assert.equal(malformado.status, 401);
  });
});

describe("POST /auth/sair", () => {
  test("apaga o cookie (mesmo caminho, data no passado) e responde 204, sem exigir login", async () => {
    const r = await request(app).post("/auth/sair");
    assert.equal(r.status, 204);
    const cookie = cookieDaResposta(r);
    assert.equal(cookie.valor, "");
    assert.ok(cookie.atributos.includes("Path=/"));
    assert.ok(cookie.atributos.includes("HttpOnly"));
    assert.ok(Date.parse(cookie.atributos.find((a) => a.startsWith("Expires=")).slice(8)) < Date.now());
  });
});

describe("CORS com credenciais", () => {
  test("a origem do frontend pode enviar o cookie", async () => {
    const r = await request(app)
      .options("/auth/eu")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");
    assert.equal(r.headers["access-control-allow-origin"], "http://localhost:3000");
    assert.equal(r.headers["access-control-allow-credentials"], "true");
  });

  test("origem desconhecida não é liberada", async () => {
    const r = await request(app)
      .options("/auth/eu")
      .set("Origin", "https://site-malicioso.example")
      .set("Access-Control-Request-Method", "GET");
    assert.equal(r.headers["access-control-allow-origin"], undefined);
  });
});
