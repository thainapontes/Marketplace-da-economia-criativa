// ============================================================================
// Controller do carrinho.
// ============================================================================

import * as carrinhoService from "../services/carrinho.service.js";
import { exigirCorpo, itensDeCompra } from "../utils/validacao.js";

export async function listar(req, res) {
  res.json(await carrinhoService.listar(req.usuario));
}

export async function substituir(req, res) {
  const itens = itensDeCompra(exigirCorpo(req.body).itens, { min: 0 });
  res.json(await carrinhoService.substituir(req.usuario, itens));
}

export async function esvaziar(req, res) {
  await carrinhoService.esvaziar(req.usuario);
  res.status(204).end();
}

export async function validar(req, res) {
  res.json(await carrinhoService.validar(itensDeCompra(exigirCorpo(req.body).itens)));
}
