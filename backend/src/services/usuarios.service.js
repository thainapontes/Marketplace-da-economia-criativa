// ============================================================================
// Regras de consulta de usuários (HU02) — docs/api.md, seção 4.
// ============================================================================

import { ErroApi } from "../middlewares/erros.js";
import { paraUsuario } from "../utils/mapeadores/usuario.js";
import * as usuariosRepository from "../repositories/usuarios.repository.js";

export async function buscarPorId(id, quemPede) {
  // A checagem de permissão vem ANTES de consultar: assim um usuário comum não
  // consegue descobrir quais ids existem comparando 403 com 404.
  if (quemPede.perfil !== "administrador" && Number(quemPede.id) !== id) {
    throw new ErroApi(403, "SEM_PERMISSAO", "Você só pode ver os seus próprios dados.");
  }
  const usuario = await usuariosRepository.buscarPorId(id);
  if (!usuario) throw new ErroApi(404, "NAO_ENCONTRADO", `Usuário ${id} não encontrado.`);
  return paraUsuario(usuario);
}
