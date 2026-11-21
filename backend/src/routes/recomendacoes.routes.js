// ============================================================================
// Rotas de recomendação (E.4) — docs/api.md, seção 7b. A API repassa o módulo
// de IA; se ele não responder em 2 s, devolve os mais vendidos.
//
//   GET /recomendacoes/produtos/:id?limite=  (público)    → { produtoReferenciaId, fonte, recomendacoes }
//   GET /recomendacoes/eu?limite=            (comprador)  → { usuarioId, fonte, recomendacoes }
//
// recomendacoes = (Produto & { criterio, score })[]; fonte = "ia" ou "popularidade".
// ============================================================================

import { Router } from "express";
import { autenticar, autenticarSeHouver, exigirPerfil } from "../middlewares/autenticacao.js";
import * as recomendacoesController from "../controllers/recomendacoes.controller.js";

export const rotasRecomendacoes = Router();

rotasRecomendacoes.get("/recomendacoes/produtos/:id", autenticarSeHouver, recomendacoesController.porProduto);
rotasRecomendacoes.get("/recomendacoes/eu", autenticar, exigirPerfil("comprador"), recomendacoesController.paraMim);
