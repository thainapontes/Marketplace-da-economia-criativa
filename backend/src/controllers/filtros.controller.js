// ============================================================================
// Controller das opções de filtro.
// ============================================================================

import * as filtrosService from "../services/filtros.service.js";

export async function listarOpcoes(_req, res) {
  res.json(await filtrosService.listarOpcoes());
}
