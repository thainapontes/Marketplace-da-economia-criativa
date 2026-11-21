// ============================================================================
// Controller da administração (HU14).
// ============================================================================

import * as adminService from "../services/admin.service.js";
import { idDaUrl } from "../utils/validacao.js";

export async function indicadores(_req, res) {
  res.json(await adminService.indicadores());
}

export async function listarPendentes(_req, res) {
  res.json(await adminService.listarPendentes());
}

export async function aprovar(req, res) {
  res.json(await adminService.aprovar(idDaUrl(req.params.id, "Artesão")));
}

export async function rejeitar(req, res) {
  await adminService.rejeitar(idDaUrl(req.params.id, "Artesão"));
  res.status(204).end();
}
