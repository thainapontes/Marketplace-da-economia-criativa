// ============================================================================
// Regras de pedidos (HU09 a HU11) — docs/api.md, seção 6.
// ============================================================================

import { config } from "../config/env.js";
import { ErroApi } from "../middlewares/erros.js";
import { paraPedido } from "../utils/mapeadores/pedido.js";
import { criarPedidoSeguro } from "./checkout-seguro.service.js";
import { criarPedidoIngenuo } from "./checkout-ingenuo.service.js";
import { ProdutoInexistente } from "../repositories/pedido.repository.js";
import * as pedidosRepository from "../repositories/pedidos.repository.js";
import * as produtosRepository from "../repositories/produtos.repository.js";
import * as carrinhoRepository from "../repositories/carrinho.repository.js";

const naoEncontrado = (mensagem) => new ErroApi(404, "NAO_ENCONTRADO", mensagem);

/**
 * Checkout. Reaproveita o checkout SEGURO do FCCPD U1 (UPDATE condicional
 * atômico + ordem por produto_id contra deadlock): estoque, pedido, itens,
 * pagamento simulado e as notificações (comprador e cada artesão) entram
 * numa transação só. O comprador vem do login; o preço vem do banco.
 * NAIVE_CHECKOUT=true troca pelo ingênuo (só para o experimento da U1).
 */
export async function criar({ enderecoEntrega, metodoPagamento, itens }, comprador) {
  // Só produtos da vitrine. O checkout já recusa produto inativo; aqui também
  // fica de fora o de artesão ainda não aprovado.
  const produtos = await produtosRepository.buscarPorIds(itens.map((item) => item.produtoId));
  for (const item of itens) {
    const produto = produtos.find((p) => Number(p.id) === item.produtoId);
    if (!produtosRepository.ehPublico(produto)) throw naoEncontrado(`Produto ${item.produtoId} não encontrado.`);
  }

  const checkout = config.checkoutIngenuo ? criarPedidoIngenuo : criarPedidoSeguro;
  let resultado;
  try {
    resultado = await checkout({ compradorId: Number(comprador.id), enderecoEntrega, metodoPagamento, itens });
  } catch (erro) {
    // Produto desativado entre a conferência acima e a baixa de estoque.
    if (erro instanceof ProdutoInexistente) throw naoEncontrado(erro.message);
    throw erro; // ESTOQUE_INSUFICIENTE (409) e o resto seguem para o tratador central
  }

  // O que foi comprado sai do carrinho salvo. Não faz parte da transação do
  // pedido: se falhar, o pedido continua válido e o carrinho só fica com sobra.
  await carrinhoRepository.esvaziar(comprador.id).catch((erro) => {
    console.error("[AVISO] pedido criado, mas o carrinho não foi esvaziado:", erro.message);
  });

  return paraPedido(await pedidosRepository.buscarPorId(resultado.pedidoId));
}
