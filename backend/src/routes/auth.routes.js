// ============================================================================
// Rotas de autenticação (HU01) — docs/api.md, seção 4.
//
//   POST /auth/registrar  { nome, email, senha, perfil, regiao? } → 201 { token, usuario }
//   POST /auth/login      { email, senha }                        → 200 { token, usuario }
//   GET  /auth/eu         (logado)                                → 200 Usuario
//   POST /auth/sair       —                                       → 204 (apaga o cookie de sessão)
//
// Login e cadastro também gravam o token no cookie httpOnly `origem_sessao`.
// ============================================================================

import { Router } from "express";
import { autenticar } from "../middlewares/autenticacao.js";
import * as authController from "../controllers/auth.controller.js";

export const rotasAuth = Router();

rotasAuth.post("/auth/registrar", authController.registrar);
rotasAuth.post("/auth/login", authController.login);
rotasAuth.get("/auth/eu", autenticar, authController.eu);
rotasAuth.post("/auth/sair", authController.sair);
