// ============================================================================
// Controller de pedidos.
// ============================================================================

import * as pedidosService from "../services/pedidos.service.js";
import { exigirCorpo, texto, itensDeCompra, invalido } from "../utils/validacao.js";

const METODOS_PAGAMENTO = ["cartao", "pix", "boleto"];

export async function criar(req, res) {
  const corpo = exigirCorpo(req.body);
  if (!METODOS_PAGAMENTO.includes(corpo.metodoPagamento)) {
    throw invalido("O método de pagamento precisa ser cartao, pix ou boleto.");
  }
  const dados = {
    enderecoEntrega: texto(corpo.enderecoEntrega, "enderecoEntrega", { min: 5, max: 255 }),
    metodoPagamento: corpo.metodoPagamento,
    itens: itensDeCompra(corpo.itens),
  };
  res.status(201).json(await pedidosService.criar(dados, req.usuario));
}

export async function listar(req, res) {
  res.json(await pedidosService.listar(req.usuario));
}

export async function buscarPorCodigo(req, res) {
  res.json(await pedidosService.buscarPorCodigo(String(req.params.codigo).slice(0, 20), req.usuario));
}
