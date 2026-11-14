// ============================================================================
// Controller de artesãos.
// ============================================================================

import * as artesoesService from "../services/artesoes.service.js";
import { idDaUrl } from "../utils/validacao.js";

export async function listar(_req, res) {
  res.json(await artesoesService.listar());
}

export async function buscarPorId(req, res) {
  res.json(await artesoesService.buscarPorId(idDaUrl(req.params.id, "Artesão"), req.usuario));
}

export async function indicadores(req, res) {
  res.json(await artesoesService.indicadores(req.usuario));
}
