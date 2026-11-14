// ============================================================================
// Regras das rotas do laboratório do FCCPD U1 (checkout concorrente e fila).
// ============================================================================

import { config } from "../config/env.js";
import { criarPedidoIngenuo } from "./checkout-ingenuo.service.js";
import * as laboratorioRepository from "../repositories/laboratorio.repository.js";

export async function saude() {
  await laboratorioRepository.verificarConexao();
  return { ok: true, checkoutPadrao: config.checkoutIngenuo ? "ingenuo" : "seguro" };
}

/** Checkout ingênuo, sempre. Existe só para o teste comparativo. */
export function criarPedidoSemProtecao(dados) {
  return criarPedidoIngenuo(dados);
}

export function registrarImagem(dados) {
  return laboratorioRepository.registrarImagemEEnfileirar(dados);
}

export function resumoDaFila() {
  return laboratorioRepository.resumoDaFila();
}

export async function enfileirarLoteDeTeste({ quantidade, lote }) {
  const ids = await laboratorioRepository.enfileirarLote({ quantidade, lote });
  return { ok: true, lote, enfileirados: ids.length, duplicadosIgnorados: quantidade - ids.length };
}

export async function reiniciar(estoque) {
  await laboratorioRepository.reiniciar(estoque);
  return { ok: true, estoque };
}
