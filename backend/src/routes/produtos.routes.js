// ============================================================================
// Rotas de produtos, só leitura (HU03 a HU06) — docs/api.md, seção 5.
//
//   GET /produtos                 → Produto[]  (?busca=&regiao=&tecnica=&categoria=&artesaoId=)
//   GET /produtos/:id             → Produto
//   GET /produtos/:id/avaliacoes  → Avaliacao[] (mais recentes primeiro)
//   POST   /produtos              (artesão) NovoProduto → 201 Produto
//   PUT    /produtos/:id          (artesão dono) NovoProduto → 200 Produto
//   DELETE /produtos/:id          (artesão dono) → 204 (desativa: exclusão lógica)
//
// Token opcional (autenticarSeHouver): o dono vê os próprios produtos inativos.
// ============================================================================

import { Router } from "express";
import { autenticar, autenticarSeHouver, exigirPerfil } from "../middlewares/autenticacao.js";
import * as produtosController from "../controllers/produtos.controller.js";

export const rotasProdutos = Router();

rotasProdutos.get("/produtos", autenticarSeHouver, produtosController.listar);
// Mantém id, nome, preco, estoque e status: o teste de concorrência do FCCPD U1 lê o estoque por aqui.
rotasProdutos.get("/produtos/:id", autenticarSeHouver, produtosController.buscarPorId);
rotasProdutos.get("/produtos/:id/avaliacoes", autenticarSeHouver, produtosController.listarAvaliacoes);

const artesao = [autenticar, exigirPerfil("artesao")];
rotasProdutos.post("/produtos", ...artesao, produtosController.criar);
rotasProdutos.put("/produtos/:id", ...artesao, produtosController.atualizar);
rotasProdutos.delete("/produtos/:id", ...artesao, produtosController.desativar);

