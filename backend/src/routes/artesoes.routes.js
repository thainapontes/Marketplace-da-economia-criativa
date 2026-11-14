// ============================================================================
// Rotas de artesãos (HU07) — docs/api.md, seção 5.
//
//   GET /artesoes      → Artesao[] (só aprovados)
//   GET /artesoes/:id  → Artesao   (pendente: só ele mesmo e o admin)
// ============================================================================

import { Router } from "express";
import { autenticarSeHouver } from "../middlewares/autenticacao.js";
import * as artesoesController from "../controllers/artesoes.controller.js";

export const rotasArtesoes = Router();

rotasArtesoes.get("/artesoes", artesoesController.listar);
rotasArtesoes.get("/artesoes/:id", autenticarSeHouver, artesoesController.buscarPorId);
