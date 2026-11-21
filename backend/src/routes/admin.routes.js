// ============================================================================
// Rotas da administração (HU14) — docs/api.md, seção 7. Todas só para admin.
//
//   GET    /admin/indicadores            → { totalUsuarios, produtosAtivos, totalPedidos, totalVendas }
//   GET    /admin/artesoes/pendentes     → Artesao[]
//   PATCH  /admin/artesoes/:id/aprovar   → Artesao
//   DELETE /admin/artesoes/:id           → 204 (só cadastro pendente; aprovado → 400)
// ============================================================================

import { Router } from "express";
import { autenticar, exigirPerfil } from "../middlewares/autenticacao.js";
import * as adminController from "../controllers/admin.controller.js";

export const rotasAdmin = Router();

const admin = [autenticar, exigirPerfil("administrador")];
rotasAdmin.get("/admin/indicadores", ...admin, adminController.indicadores);
rotasAdmin.get("/admin/artesoes/pendentes", ...admin, adminController.listarPendentes);
rotasAdmin.patch("/admin/artesoes/:id/aprovar", ...admin, adminController.aprovar);
rotasAdmin.delete("/admin/artesoes/:id", ...admin, adminController.rejeitar);
