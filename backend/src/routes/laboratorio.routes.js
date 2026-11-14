// ============================================================================
// Rotas do FCCPD U1 (concorrência no checkout + fila assíncrona).
//
// Movidas de src/server.js na etapa 1.0 da U2 SEM mudança de comportamento:
// os testes e as evidências da U1 dependem delas. Na U2 (etapa A) foram
// divididas em controller, service e repository; o SQL é o mesmo da U1.
//
//   GET  /saude                — o banco está de pé? (usado pelos scripts de teste)
//   POST /pedidos-naive        — checkout INGÊNUO sempre, para o teste comparativo
//   POST /produtos/:id/imagens — registra a imagem e ENFILEIRA o processamento; 202 na hora
//   GET  /fila                 — estado da fila por status + dead-letter
//   POST /teste/reiniciar      — zera pedidos, fila e estoque (auxiliar de teste)
//   POST /teste/fila           — enfileira N jobs de uma vez (teste de carga)
//
// GET /produtos/:id saiu daqui na etapa 1.2 (hoje em routes/produtos.routes.js,
// com os mesmos campos id/nome/preco/estoque/status que o teste de concorrência
// lê). POST /pedidos saiu na etapa D (routes/pedidos.routes.js): agora exige
// login de comprador, e o checkout por trás é o mesmo checkout seguro da U1.
// ============================================================================

import { Router } from "express";
import * as laboratorioController from "../controllers/laboratorio.controller.js";

export const rotasLaboratorio = Router();

rotasLaboratorio.get("/saude", laboratorioController.saude);
rotasLaboratorio.post("/pedidos-naive", laboratorioController.criarPedidoSemProtecao);
rotasLaboratorio.post("/produtos/:id/imagens", laboratorioController.registrarImagem);
rotasLaboratorio.get("/fila", laboratorioController.resumoDaFila);
rotasLaboratorio.post("/teste/fila", laboratorioController.enfileirarLoteDeTeste);
rotasLaboratorio.post("/teste/reiniciar", laboratorioController.reiniciar);
