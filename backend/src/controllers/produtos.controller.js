// ============================================================================
// Controller de produtos: lê a query/URL, chama o service, responde.
// ============================================================================

import * as produtosService from "../services/produtos.service.js";
import { idDaUrl, invalido } from "../utils/validacao.js";

/** Valor de filtro da query string: ausente, vazio ou "Todas" = sem filtro. */
function filtro(valor, campo) {
  if (valor === undefined) return null;
  if (typeof valor !== "string") throw invalido(`Informe um único valor para ${campo}.`);
  const limpo = valor.trim();
  return limpo === "" || limpo === "Todas" ? null : limpo;
}

export async function listar(req, res) {
  const textoArtesao = filtro(req.query.artesaoId, "artesaoId");
  let artesaoId = null;
  if (textoArtesao !== null) {
    artesaoId = Number(textoArtesao);
    if (!Number.isSafeInteger(artesaoId) || artesaoId < 1) throw invalido("artesaoId precisa ser um número inteiro.");
  }
  const filtros = {
    busca: filtro(req.query.busca, "busca"),
    regiao: filtro(req.query.regiao, "regiao"),
    tecnica: filtro(req.query.tecnica, "tecnica"),
    categoria: filtro(req.query.categoria, "categoria"),
    artesaoId,
  };
  res.json(await produtosService.listar(filtros, req.usuario));
}

export async function buscarPorId(req, res) {
  res.json(await produtosService.buscarPorId(idDaUrl(req.params.id, "Produto"), req.usuario));
}

export async function listarAvaliacoes(req, res) {
  res.json(await produtosService.listarAvaliacoes(idDaUrl(req.params.id, "Produto"), req.usuario));
}
