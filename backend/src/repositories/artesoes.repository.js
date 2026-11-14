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

/**
 * Indicadores do painel do artesão (HU13).
 *
 * Calculados aqui, e não pela view vw_indicadores_artesao do DDL, porque a
 * view ainda (1) soma pedidos CANCELADOS no total vendido e (2) só conta como
 * pendente o status 'pendente' — mas desde a U2 todo pedido nasce
 * 'confirmado', então o número seria sempre 0. A correção da view está com a
 * equipe de banco; quando entrar, esta função pode passar a lê-la.
 */
export async function indicadores(artesaoId) {
  const artesao = BigInt(artesaoId);
  const comItemDele = { item_pedido: { some: { artesao_id: artesao } } };
  const [vendido, totalPedidos, pedidosPendentes, produtosAtivos] = await Promise.all([
    prisma.item_pedido.aggregate({
      _sum: { subtotal: true },
      where: { artesao_id: artesao, pedido: { status: { not: "cancelado" } } },
    }),
    prisma.pedido.count({ where: { ...comItemDele, status: { not: "cancelado" } } }),
    // "Pendente" para o artesão = ainda não começou a produzir (igual à tela do painel).
    prisma.pedido.count({ where: { ...comItemDele, status: { in: ["pendente", "confirmado"] } } }),
    prisma.produto.count({ where: { artesao_id: artesao, status: "ativo" } }),
  ]);
  return {
    totalVendido: Number(vendido._sum.subtotal ?? 0),
    totalPedidos,
    pedidosPendentes,
    produtosAtivos,
  };
}
