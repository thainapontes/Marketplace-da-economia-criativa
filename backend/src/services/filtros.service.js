// ============================================================================
// Opções dos filtros do catálogo e do formulário de produto.
// ============================================================================

import * as filtrosRepository from "../repositories/filtros.repository.js";
import * as cache from "../utils/cache.js";

/**
 * Regiões, categorias e técnicas quase nunca mudam e são pedidas em toda tela
 * de catálogo e no formulário de produto: ficam no cache. Devolve { opcoes, doCache }.
 */
export async function listarOpcoes() {
  const doCache = cache.valido("filtros");
  return { opcoes: await cache.lembrar("filtros", filtrosRepository.listarOpcoes), doCache };
}
