// ============================================================================
// Acesso ao banco: artesãos, via Prisma.
// ============================================================================

import { prisma } from "../config/prisma.js";

/** Relações que montam um `Artesao` (ver utils/mapeadores/catalogo.js). */
const INCLUDE_ARTESAO = {
  usuario: { select: { nome: true } },
  regiao: { select: { nome: true, polo: true } },
  artesao_tecnica: { include: { tecnica: { select: { nome: true } } }, orderBy: { tecnica_id: "asc" } },
  // Contagem filtrada: só os produtos ativos entram em totalProdutos.
  _count: { select: { produto: { where: { status: "ativo" } } } },
};

export function listar({ somenteAprovados }) {
  return prisma.artesao.findMany({
    where: somenteAprovados ? { aprovado: true } : {},
    include: INCLUDE_ARTESAO,
    orderBy: { usuario_id: "asc" },
  });
}

export function buscarPorId(id) {
  return prisma.artesao.findUnique({ where: { usuario_id: BigInt(id) }, include: INCLUDE_ARTESAO });
}

/** Média das notas de todos os produtos do artesão (null se não houver avaliação). */
export async function mediaDasAvaliacoes(artesaoId) {
  const resultado = await prisma.avaliacao_produto.aggregate({
    _avg: { nota: true },
    where: { produto: { artesao_id: BigInt(artesaoId) } },
  });
  return resultado._avg.nota;
}

/** Pedidos não cancelados que têm pelo menos um item do artesão. */
export function totalDeVendas(artesaoId) {
  return prisma.pedido.count({
    where: { status: { not: "cancelado" }, item_pedido: { some: { artesao_id: BigInt(artesaoId) } } },
  });
}
