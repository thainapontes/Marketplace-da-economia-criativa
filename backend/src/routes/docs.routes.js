// ============================================================================
// Documentação da API (etapa F) — Swagger UI.
//
//   GET /docs          → interface do Swagger (testar as rotas no navegador)
//   GET /openapi.yaml  → a especificação, escrita à mão em backend/openapi.yaml
//
// O arquivo é lido UMA vez, quando a API sobe. O teste testes/api/openapi.test.js
// falha se aparecer uma rota no Express que não esteja documentada (ou o contrário).
// ============================================================================

import { readFileSync } from "node:fs";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

const ARQUIVO = new URL("../../openapi.yaml", import.meta.url);
const texto = readFileSync(ARQUIVO, "utf8");
export const especificacao = YAML.parse(texto);

export const rotasDocs = Router();

rotasDocs.get("/openapi.yaml", (_req, res) => res.type("application/yaml").send(texto));
rotasDocs.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(especificacao, {
    customSiteTitle: "API do Origem",
    // Mantém o token do "Authorize" ao recarregar a página.
    swaggerOptions: { persistAuthorization: true },
  }),
);
