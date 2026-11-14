// ============================================================================
// Controller de usuários.
// ============================================================================

import * as usuariosService from "../services/usuarios.service.js";
import { idDaUrl } from "../utils/validacao.js";

export async function buscarPorId(req, res) {
  res.json(await usuariosService.buscarPorId(idDaUrl(req.params.id, "Usuário"), req.usuario));
}
