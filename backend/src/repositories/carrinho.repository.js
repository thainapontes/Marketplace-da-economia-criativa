// ============================================================================
// Acesso ao banco: carrinho do usuário (tabelas carrinho e item_carrinho), via Prisma.
// Um carrinho por usuário (carrinho.usuario_id é UNIQUE).
// ============================================================================

import { prisma } from "../config/prisma.js";
import { INCLUDE_PRODUTO } from "./produtos.repository.js";

export function listarItens(usuarioId) {
  return prisma.item_carrinho.findMany({
    where: { carrinho: { usuario_id: BigInt(usuarioId) } },
    include: { produto: { include: INCLUDE_PRODUTO } },
    orderBy: { id: "asc" },
  });
}

/**
 * Troca o conteúdo inteiro do carrinho pelos itens recebidos, numa transação:
 * cria o carrinho se ainda não existir, apaga os itens antigos e grava os novos.
 * `itens` = [{ produtoId, quantidade, precoUnitario }].
 */
export function substituir(usuarioId, itens) {
  const usuario = BigInt(usuarioId);
  return prisma.$transaction(async (tx) => {
    const carrinho = await tx.carrinho.upsert({
      where: { usuario_id: usuario },
      create: { usuario_id: usuario },
      update: { atualizado_em: new Date() },
    });
    await tx.item_carrinho.deleteMany({ where: { carrinho_id: carrinho.id } });
    if (itens.length > 0) {
      await tx.item_carrinho.createMany({
        data: itens.map((item) => ({
          carrinho_id: carrinho.id,
          produto_id: BigInt(item.produtoId),
          quantidade: item.quantidade,
          preco_unitario: item.precoUnitario,
        })),
      });
    }
  });
}

export function esvaziar(usuarioId) {
  return prisma.item_carrinho.deleteMany({ where: { carrinho: { usuario_id: BigInt(usuarioId) } } });
}
