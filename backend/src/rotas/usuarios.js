// ============================================================================
// Usuários (HU02) — docs/api.md, seção 4.
//
//   GET /usuarios/:id   (o próprio usuário ou administrador) → 200 Usuario
// ============================================================================

import { Router } from "express";
import { pool } from "../db.js";
import { ErroApi } from "../middlewares/erros.js";
import { autenticar } from "../middlewares/autenticacao.js";
import { COLUNAS_USUARIO, paraUsuario } from "../mapeadores/usuario.js";
import { idDaUrl } from "../validacao.js";

export const rotasUsuarios = Router();

rotasUsuarios.get("/usuarios/:id", autenticar, async (req, res) => {
  const id = idDaUrl(req.params.id, "Usuário");
  const ehAdmin = req.usuario.perfil === "administrador";

  // A checagem de permissão vem ANTES de consultar: assim um usuário comum não
  // consegue descobrir quais ids existem comparando 403 com 404.
  if (!ehAdmin && Number(req.usuario.id) !== id) {
    throw new ErroApi(403, "SEM_PERMISSAO", "Você só pode ver os seus próprios dados.");
  }

  const resultado = await pool.query(`SELECT ${COLUNAS_USUARIO} FROM usuario WHERE id = $1`, [id]);
  if (resultado.rowCount === 0) throw new ErroApi(404, "NAO_ENCONTRADO", `Usuário ${id} não encontrado.`);
  res.json(paraUsuario(resultado.rows[0]));
});
