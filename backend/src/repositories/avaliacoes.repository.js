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

/**
 * Grava a avaliação. Devolve null se o comprador já avaliou este produto:
 * a regra "uma por comprador por produto" é a UNIQUE (produto_id, usuario_id)
 * do banco, e o Prisma avisa com o código P2002. Confiar na constraint (e não
 * num "SELECT antes do INSERT") evita que dois cliques simultâneos gravem duas.
 */
export async function criar({ produtoId, usuarioId, nota, comentario }) {
  try {
    return await prisma.avaliacao_produto.create({
      data: { produto_id: BigInt(produtoId), usuario_id: BigInt(usuarioId), nota, comentario },
      include: { usuario: { select: { nome: true } } },
    });
  } catch (erro) {
    if (erro?.code === "P2002") return null;
    throw erro;
  }
}
