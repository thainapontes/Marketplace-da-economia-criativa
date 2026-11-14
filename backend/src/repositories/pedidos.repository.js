// ============================================================================
// Acesso ao banco: leitura de pedidos, via Prisma.
//
// A CRIAÇÃO do pedido não passa por aqui: ela é o checkout seguro do FCCPD U1
// (services/checkout-seguro.service.js + pedido.repository.js, SQL puro).
// ============================================================================

import { prisma } from "../config/prisma.js";
import { INCLUDE_PRODUTO } from "./produtos.repository.js";

/** Relações que montam um `Pedido` (ver utils/mapeadores/pedido.js). */
const INCLUDE_PEDIDO = {
  usuario: { select: { email: true } },
  pagamento: true,
  item_pedido: { include: { produto: { include: INCLUDE_PRODUTO } }, orderBy: { id: "asc" } },
};

export function buscarPorId(id) {
  return prisma.pedido.findUnique({ where: { id: BigInt(id) }, include: INCLUDE_PEDIDO });
}

export function buscarPorCodigo(codigo) {
  return prisma.pedido.findUnique({ where: { codigo }, include: INCLUDE_PEDIDO });
}

/**
 * Pedidos mais recentes primeiro, filtrados por quem pede:
 *   compradorId → os pedidos dele; artesaoId → os que têm item dele; nenhum → todos.
 */
export function listar({ compradorId, artesaoId } = {}) {
  const where = {
    ...(compradorId && { comprador_id: BigInt(compradorId) }),
    ...(artesaoId && { item_pedido: { some: { artesao_id: BigInt(artesaoId) } } }),
  };
  return prisma.pedido.findMany({ where, include: INCLUDE_PEDIDO, orderBy: [{ criado_em: "desc" }, { id: "desc" }] });
}

/**
 * Muda o status de `de` para `para` numa transação, e, se for cancelamento,
 * devolve ao estoque as unidades de cada item.
 *
 * A troca é condicional (WHERE status = de), a mesma ideia do checkout seguro:
 * se dois pedidos de cancelamento chegarem juntos, só UM encontra o status
 * antigo e devolve o estoque; o outro altera 0 linhas e recebe `false`.
 * Os produtos são atualizados em ordem de id, a mesma ordem do checkout, para
 * não criar ciclo de espera (deadlock) com compras simultâneas.
 */
export function trocarStatus(pedido, de, para) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.pedido.updateMany({
      where: { id: pedido.id, status: de },
      data: { status: para, atualizado_em: new Date() },
    });
    if (count === 0) return false;
    if (para === "cancelado") {
      const itens = [...pedido.item_pedido].sort((a, b) => (a.produto_id < b.produto_id ? -1 : 1));
      for (const item of itens) {
        await tx.produto.update({
          where: { id: item.produto_id },
          data: { estoque: { increment: item.quantidade }, atualizado_em: new Date() },
        });
      }
    }
    return true;
  });
}
