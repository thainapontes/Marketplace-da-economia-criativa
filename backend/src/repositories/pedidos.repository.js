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
