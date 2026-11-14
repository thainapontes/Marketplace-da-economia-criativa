// ============================================================================
// Opções dos filtros do catálogo e do formulário de produto.
// ============================================================================

import * as filtrosRepository from "../repositories/filtros.repository.js";

export function listarOpcoes() {
  return filtrosRepository.listarOpcoes();
}
