// ============================================================================
// Acesso ao banco: administração (HU14), via Prisma.
// ============================================================================

import { prisma } from "../config/prisma.js";

/**
 * Indicadores do painel administrativo, lidos da view vw_indicadores_admin
 * do DDL (01_schema.sql). É SQL puro porque o Prisma não mapeia views no
 * schema que veio do `db pull`. COUNT e SUM chegam como BigInt/Decimal.
 */
export async function indicadores() {
  const [linha] = await prisma.$queryRaw`
    SELECT total_usuarios, produtos_ativos, total_pedidos, total_vendas FROM vw_indicadores_admin`;
  return {
    totalUsuarios: Number(linha.total_usuarios),
    produtosAtivos: Number(linha.produtos_ativos),
    totalPedidos: Number(linha.total_pedidos),
    totalVendas: Number(linha.total_vendas),
  };
}

export function aprovar(artesaoId) {
  return prisma.artesao.update({ where: { usuario_id: BigInt(artesaoId) }, data: { aprovado: true } });
}

/**
 * Apaga o cadastro pendente: os produtos que ele chegou a criar (e o que aponta
 * para eles), depois o usuário (o artesão vai junto pelo ON DELETE CASCADE).
 * Tudo numa transação: ou some tudo, ou nada.
 *
 * Um artesão pendente não tem venda (os produtos dele nunca apareceram na
 * vitrine), então não há item_pedido para preservar. Mas o classificar.py do
 * módulo de IA classifica o catálogo inteiro, e um produto pode estar num
 * carrinho antigo; por isso essas tabelas são limpas antes.
 */
export function rejeitar(artesaoId) {
  const id = BigInt(artesaoId);
  const dosProdutos = { produto: { artesao_id: id } };
  return prisma.$transaction([
    prisma.classificacao_produto.deleteMany({ where: dosProdutos }),
    prisma.recomendacao_log.deleteMany({ where: { OR: [dosProdutos, { usuario_id: id }] } }),
    prisma.item_carrinho.deleteMany({ where: dosProdutos }),
    prisma.produto.deleteMany({ where: { artesao_id: id } }),
    prisma.notificacao.deleteMany({ where: { usuario_id: id } }),
    prisma.usuario.delete({ where: { id } }),
  ]);
}
