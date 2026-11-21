// ============================================================================
// Acesso ao banco para a reserva das recomendações: os mais vendidos.
// ============================================================================

import { prisma } from "../config/prisma.js";
import { INCLUDE_PRODUTO } from "./produtos.repository.js";

/**
 * Produtos da vitrine (ativos, de artesão aprovado) com as unidades vendidas
 * em pedidos não cancelados. Devolve [{ registro, vendas }], sem ordenar.
 */
export async function publicosComVendas() {
  const [produtos, vendas] = await Promise.all([
    prisma.produto.findMany({ where: { status: "ativo", artesao: { aprovado: true } }, include: INCLUDE_PRODUTO }),
    prisma.item_pedido.groupBy({
      by: ["produto_id"],
      where: { pedido: { status: { not: "cancelado" } } },
      _sum: { quantidade: true },
    }),
  ]);
  const porProduto = new Map(vendas.map((v) => [String(v.produto_id), v._sum.quantidade ?? 0]));
  return produtos.map((registro) => ({ registro, vendas: porProduto.get(String(registro.id)) ?? 0 }));
}
