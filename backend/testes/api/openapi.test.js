// ============================================================================
// Testes da documentação (etapa F): o Swagger abre e o openapi.yaml cobre
// exatamente as rotas que existem no Express — nem a mais, nem a menos.
// Lê as rotas dos arquivos src/routes/*.routes.js, então uma rota nova sem
// documentação faz este teste falhar.
// ============================================================================

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";
import { especificacao } from "../../src/routes/docs.routes.js";

after(() => pool.end());

const PASTA_ROTAS = new URL("../../src/routes/", import.meta.url);

/** "get /produtos/{id}" para cada rota declarada nos arquivos de rotas (exceto a própria documentação). */
function rotasDoExpress() {
  const rotas = new Set();
  for (const arquivo of readdirSync(PASTA_ROTAS).filter((a) => a.endsWith(".routes.js") && a !== "docs.routes.js")) {
    const codigo = readFileSync(new URL(arquivo, PASTA_ROTAS), "utf8");
    for (const [, metodo, caminho] of codigo.matchAll(/\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      rotas.add(`${metodo} ${caminho.replace(/:(\w+)/g, "{$1}")}`);
    }
  }
  return rotas;
}

function rotasDocumentadas() {
  const rotas = new Set();
  for (const [caminho, operacoes] of Object.entries(especificacao.paths)) {
    for (const metodo of Object.keys(operacoes)) {
      if (metodo !== "parameters") rotas.add(`${metodo} ${caminho}`);
    }
  }
  return rotas;
}

describe("openapi.yaml", () => {
  test("documenta todas as rotas do Express, e só elas", () => {
    const expressRotas = rotasDoExpress();
    const documentadas = rotasDocumentadas();
    assert.ok(expressRotas.size > 30, `só ${expressRotas.size} rotas encontradas: o regex quebrou?`);
    assert.deepEqual([...expressRotas].filter((r) => !documentadas.has(r)), [], "rotas sem documentação");
    assert.deepEqual([...documentadas].filter((r) => !expressRotas.has(r)), [], "documentadas mas inexistentes");
  });

  test("todo $ref aponta para algo que existe", () => {
    const refs = JSON.stringify(especificacao).match(/"\$ref":"#\/components\/[^"]+"/g) ?? [];
    for (const ref of new Set(refs)) {
      const [, tipo, nome] = ref.match(/components\/(\w+)\/([^"]+)/);
      assert.ok(especificacao.components[tipo]?.[nome], `${ref} não existe`);
    }
  });

  test("toda rota com cadeado (security) tem resposta 401", () => {
    for (const [caminho, operacoes] of Object.entries(especificacao.paths)) {
      for (const [metodo, op] of Object.entries(operacoes)) {
        if (op.security) assert.ok(op.responses["401"], `${metodo} ${caminho} sem 401`);
      }
    }
  });
});

describe("Swagger UI", () => {
  test("GET /docs/ abre a interface", async () => {
    const r = await request(app).get("/docs/");
    assert.equal(r.status, 200);
    assert.match(r.text, /swagger-ui/i);
  });

  test("GET /openapi.yaml devolve a especificação", async () => {
    const r = await request(app).get("/openapi.yaml");
    assert.equal(r.status, 200);
    assert.match(r.headers["content-type"], /yaml/);
    assert.match(r.text, /^openapi: 3\.0\.3/);
  });
});
