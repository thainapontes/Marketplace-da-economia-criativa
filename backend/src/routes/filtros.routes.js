// ============================================================================
// GET /filtros → { regioes, categorias, tecnicas } — docs/api.md, seção 5.
// ============================================================================

import { Router } from "express";
import * as filtrosController from "../controllers/filtros.controller.js";

export const rotasFiltros = Router();

rotasFiltros.get("/filtros", filtrosController.listarOpcoes);
