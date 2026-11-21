// ============================================================================
// Controller das recomendações (E.4).
// ============================================================================

import * as recomendacoesService from "../services/recomendacoes.service.js";
import { idDaUrl, invalido } from "../utils/validacao.js";

/** ?limite= inteiro de 1 a 20 (RF-05), como no módulo de IA. Ausente = padrão. */
function limite(valor, padrao) {
  if (valor === undefined) return padrao;
  const numero = Number(valor);
  if (typeof valor !== "string" || !Number.isInteger(numero) || numero < 1 || numero > 20) {
    throw invalido("limite deve ser um inteiro entre 1 e 20.");
  }
  return numero;
}

export async function porProduto(req, res) {
  const id = idDaUrl(req.params.id, "Produto");
  res.json(await recomendacoesService.porProduto(id, req.usuario, limite(req.query.limite, 4)));
}

export async function paraMim(req, res) {
  res.json(await recomendacoesService.paraMim(req.usuario, limite(req.query.limite, 8)));
}
