// ============================================================================
// Rotas do carrinho (HU08) — docs/api.md, seção 6.
//
//   GET    /carrinho          (comprador) → 200 ItemCarrinho[]
//   PUT    /carrinho          (comprador) { itens: [{ produtoId, quantidade }] } → 200 ItemCarrinho[]
//   DELETE /carrinho          (comprador) → 204
//   POST   /carrinho/validar  (público)   { itens } → 200 ProblemaEstoque[] (vazio = tudo certo)
// ============================================================================

import { Router } from "express";
import { autenticar, exigirPerfil } from "../middlewares/autenticacao.js";
import * as carrinhoController from "../controllers/carrinho.controller.js";

export const rotasCarrinho = Router();

const comprador = [autenticar, exigirPerfil("comprador")];

rotasCarrinho.get("/carrinho", ...comprador, carrinhoController.listar);
rotasCarrinho.put("/carrinho", ...comprador, carrinhoController.substituir);
rotasCarrinho.delete("/carrinho", ...comprador, carrinhoController.esvaziar);
rotasCarrinho.post("/carrinho/validar", carrinhoController.validar);
