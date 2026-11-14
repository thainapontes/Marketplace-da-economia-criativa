// ============================================================================
// Validação de entrada. Cada função devolve o valor já limpo ou lança
// ErroApi 400 CORPO_INVALIDO com uma mensagem que pode ir direto para a tela.
// ============================================================================

import { ErroApi } from "../middlewares/erros.js";

export function invalido(mensagem) {
  return new ErroApi(400, "CORPO_INVALIDO", mensagem);
}

/** Garante que o corpo é um objeto JSON (e não ausente, lista ou texto). */
export function exigirCorpo(corpo) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw invalido("Envie os dados em JSON no corpo da requisição.");
  }
  return corpo;
}

export function texto(valor, campo, { min = 1, max = 255 } = {}) {
  if (typeof valor !== "string") throw invalido(`O campo ${campo} é obrigatório.`);
  const limpo = valor.trim();
  if (limpo.length < min) {
    throw invalido(min <= 1 ? `O campo ${campo} é obrigatório.` : `O campo ${campo} precisa de pelo menos ${min} caracteres.`);
  }
  if (limpo.length > max) throw invalido(`O campo ${campo} aceita no máximo ${max} caracteres.`);
  return limpo;
}

/** E-mail em minúsculas: "Maria@Origem.com.br" e "maria@origem.com.br" são a mesma conta. */
export function email(valor) {
  const limpo = texto(valor, "email", { max: 180 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) throw invalido("Informe um e-mail válido.");
  return limpo;
}

/** Id numérico de URL (/usuarios/:id). Inválido → 404, como um id que não existe. */
export function idDaUrl(valor, recurso) {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ErroApi(404, "NAO_ENCONTRADO", `${recurso} ${valor} não encontrado.`);
  }
  return id;
}

/**
 * Lista de itens { produtoId, quantidade } (carrinho e pedido).
 * Sem produto repetido: cada produto aparece uma vez, com a quantidade total.
 */
export function itensDeCompra(valor, { min = 1, max = 50 } = {}) {
  if (!Array.isArray(valor)) throw invalido("Envie os itens como uma lista.");
  if (valor.length < min) throw invalido("Envie pelo menos um item.");
  if (valor.length > max) throw invalido(`No máximo ${max} itens por vez.`);
  const vistos = new Set();
  return valor.map((item) => {
    const produtoId = item?.produtoId;
    const quantidade = item?.quantidade;
    if (!Number.isSafeInteger(produtoId) || produtoId < 1) throw invalido("Cada item precisa de um produtoId inteiro.");
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) {
      throw invalido("A quantidade de cada item precisa ser um número inteiro de 1 a 99.");
    }
    if (vistos.has(produtoId)) throw invalido(`O produto ${produtoId} aparece mais de uma vez.`);
    vistos.add(produtoId);
    return { produtoId, quantidade };
  });
}
