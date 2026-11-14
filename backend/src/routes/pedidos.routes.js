// ============================================================================
// Rotas de pedidos (HU09 a HU11) — docs/api.md, seção 6.
//
//   POST /pedidos          (comprador) { enderecoEntrega, metodoPagamento, itens: [{ produtoId, quantidade }] } → 201 Pedido
//   GET  /pedidos          (logado) → 200 Pedido[] — o escopo vem do perfil (comprador, artesão, admin)
//   GET  /pedidos/:codigo  (comprador dono, artesão com item no pedido, admin) → 200 Pedido
// ============================================================================

import { Router } from "express";
import { autenticar, exigirPerfil } from "../middlewares/autenticacao.js";
import * as pedidosController from "../controllers/pedidos.controller.js";

export const rotasPedidos = Router();

rotasPedidos.post("/pedidos", autenticar, exigirPerfil("comprador"), pedidosController.criar);
rotasPedidos.get("/pedidos", autenticar, pedidosController.listar);
rotasPedidos.get("/pedidos/:codigo", autenticar, pedidosController.buscarPorCodigo);
