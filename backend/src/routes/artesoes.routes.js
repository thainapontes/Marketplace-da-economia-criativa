// ============================================================================
// Rotas de artesãos (HU07) — docs/api.md, seção 5.
//
//   GET /artesoes      → Artesao[] (só aprovados)
//   GET /artesoes/:id  → Artesao   (pendente: só ele mesmo e o admin)
//   GET /artesoes/eu/indicadores (artesão) → { totalVendido, totalPedidos, pedidosPendentes, produtosAtivos }
// ============================================================================

import { Router } from "express";
import { autenticar, autenticarSeHouver, exigirPerfil } from "../middlewares/autenticacao.js";
import * as artesoesController from "../controllers/artesoes.controller.js";

export const rotasArtesoes = Router();

rotasArtesoes.get("/artesoes", artesoesController.listar);
rotasArtesoes.get("/artesoes/:id", autenticarSeHouver, artesoesController.buscarPorId);
rotasArtesoes.get("/artesoes/eu/indicadores", autenticar, exigirPerfil("artesao"), artesoesController.indicadores);
