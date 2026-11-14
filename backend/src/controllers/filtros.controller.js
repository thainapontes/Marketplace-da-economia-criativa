// ============================================================================
// Controller das opções de filtro.
// ============================================================================

import * as filtrosService from "../services/filtros.service.js";

export async function listarOpcoes(_req, res) {
  const { opcoes, doCache } = await filtrosService.listarOpcoes();
  res.set("X-Cache", doCache ? "HIT" : "MISS");
  res.json(opcoes);
}
