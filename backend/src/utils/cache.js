// ============================================================================
// Cache em memória, com validade (Web: "cache em pelo menos um ponto relevante").
//
// Guarda o resultado de consultas muito repetidas e pouco mutáveis (a vitrine
// e as opções de filtro) por alguns segundos. Quem altera o dado de origem
// chama esquecer() para que a próxima leitura vá ao banco.
//
// Guardamos a PROMESSA, não o valor: se 50 visitantes abrirem a vitrine ao
// mesmo tempo com o cache vazio, só UMA consulta vai ao banco e as outras 49
// esperam por ela.
//
// É memória do processo: cada instância da API tem o seu cache. Para uma
// instância só (o nosso deploy), basta; com várias, seria caso de Redis.
// ============================================================================

import { config } from "../config/env.js";

const entradas = new Map();

/** true se a chave está no cache e ainda vale. */
export function valido(chave) {
  const entrada = entradas.get(chave);
  return Boolean(entrada && entrada.expira > Date.now());
}

/** Devolve o valor guardado ou chama gerar() e guarda o resultado por `ttlMs`. */
export function lembrar(chave, gerar, ttlMs = config.cacheTtlMs) {
  if (ttlMs <= 0) return gerar(); // cache desligado (CACHE_TTL_MS=0)
  if (valido(chave)) return entradas.get(chave).valor;
  const valor = Promise.resolve().then(gerar);
  entradas.set(chave, { valor, expira: Date.now() + ttlMs });
  // Erro não fica guardado: a próxima leitura tenta de novo.
  valor.catch(() => entradas.delete(chave));
  return valor;
}

/** Apaga todas as chaves que começam com `prefixo`. */
export function esquecer(prefixo) {
  for (const chave of entradas.keys()) if (chave.startsWith(prefixo)) entradas.delete(chave);
}
