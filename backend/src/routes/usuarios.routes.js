// ============================================================================
// Rotas de usuários (HU02) — docs/api.md, seção 4.
//
//   GET /usuarios/:id   (o próprio usuário ou administrador) → 200 Usuario
// ============================================================================

import { Router } from "express";
import { autenticar } from "../middlewares/autenticacao.js";
import * as usuariosController from "../controllers/usuarios.controller.js";

export const rotasUsuarios = Router();

rotasUsuarios.get("/usuarios/:id", autenticar, usuariosController.buscarPorId);
