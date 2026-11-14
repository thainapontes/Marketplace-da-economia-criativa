// ============================================================================
// Acesso ao banco: avaliações de produto, via Prisma.
// ============================================================================

import { prisma } from "../config/prisma.js";

/** Mais recentes primeiro (empate na data: a de id maior primeiro). */
export function listarPorProduto(produtoId) {
  return prisma.avaliacao_produto.findMany({
    where: { produto_id: BigInt(produtoId) },
    include: { usuario: { select: { nome: true } } },
    orderBy: [{ criado_em: "desc" }, { id: "desc" }],
  });
}
