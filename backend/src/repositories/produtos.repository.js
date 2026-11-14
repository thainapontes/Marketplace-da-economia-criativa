// ============================================================================
// Acesso ao banco: produtos, via Prisma.
// ============================================================================

import { prisma } from "../config/prisma.js";

/** Relações que montam um `Produto` (ver utils/mapeadores/catalogo.js). */
export const INCLUDE_PRODUTO = {
  artesao: { select: { aprovado: true, usuario: { select: { nome: true } } } },
  categoria: { select: { nome: true } },
  tecnica: { select: { nome: true } },
  regiao: { select: { nome: true } },
  // Só as fotos `disponivel`: uma imagem ainda na fila do FCCPD (`processando`)
  // ou reprovada (`indisponivel`) não aparece na vitrine.
  produto_imagem: {
    where: { status: "disponivel" },
    orderBy: [{ ordem: "asc" }, { id: "asc" }],
    select: { chave_armazenamento: true },
  },
};

/** Escapa os curingas do LIKE: buscar "100%" procura o texto "100%", não "100" + qualquer coisa. */
const escaparLike = (texto) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Ids dos produtos cujo nome, artesão ou técnica contém o termo, sem diferenciar
 * maiúsculas nem acentos ("ceramica" acha "Cerâmica").
 *
 * É SQL escrito à mão porque o Prisma não tem `unaccent`: o `contains` com
 * mode "insensitive" ignora maiúsculas, mas não acentos. O termo vai como
 * parâmetro (${...} no $queryRaw), nunca colado no texto do SQL.
 */
async function idsDaBusca(termo) {
  const linhas = await prisma.$queryRaw`
    SELECT p.id
      FROM produto p
      JOIN usuario u ON u.id = p.artesao_id
      JOIN tecnica t ON t.id = p.tecnica_id
     WHERE unaccent(p.nome || ' ' || u.nome || ' ' || t.nome) ILIKE unaccent(${`%${escaparLike(termo)}%`})`;
  return linhas.map((linha) => linha.id);
}

/**
 * Lista com filtros. `somentePublicos` = só produto ativo de artesão aprovado
 * (a vitrine); o dono do painel pede com `somentePublicos: false`.
 */
export async function listar({ somentePublicos, artesaoId, regiao, tecnica, categoria, busca }) {
  const where = {
    ...(somentePublicos && { status: "ativo", artesao: { aprovado: true } }),
    ...(artesaoId && { artesao_id: BigInt(artesaoId) }),
    ...(regiao && { regiao: { nome: regiao } }),
    ...(tecnica && { tecnica: { nome: tecnica } }),
    ...(categoria && { categoria: { nome: categoria } }),
    ...(busca && { id: { in: await idsDaBusca(busca) } }),
  };
  return prisma.produto.findMany({ where, include: INCLUDE_PRODUTO, orderBy: { id: "asc" } });
}

export function buscarPorId(id) {
  return prisma.produto.findUnique({ where: { id: BigInt(id) }, include: INCLUDE_PRODUTO });
}

/** Vários produtos de uma vez (carrinho, pedido). Os que não existem simplesmente não vêm. */
export function buscarPorIds(ids) {
  return prisma.produto.findMany({ where: { id: { in: ids.map(BigInt) } }, include: INCLUDE_PRODUTO });
}

/** Produto que aparece na vitrine: ativo e de artesão aprovado. */
export const ehPublico = (produto) => produto?.status === "ativo" && produto.artesao.aprovado;


/** Cria o produto e a imagem principal (ordem 0) num comando só (transação do Prisma). */
export function criar({ artesaoId, categoriaId, tecnicaId, regiaoId, nome, descricao, preco, estoque, imagem }) {
  return prisma.produto.create({
    data: {
      artesao_id: BigInt(artesaoId),
      categoria_id: categoriaId,
      tecnica_id: tecnicaId,
      regiao_id: regiaoId,
      nome,
      descricao,
      preco,
      estoque,
      produto_imagem: { create: { chave_armazenamento: imagem, content_type: "image/jpeg", ordem: 0 } },
    },
    include: INCLUDE_PRODUTO,
  });
}

/**
 * Atualiza os dados do produto e troca a imagem principal (ordem 0), numa
 * transação. As outras fotos (ordem 1, 2...) ficam como estão.
 */
export function atualizar(id, { categoriaId, tecnicaId, regiaoId, nome, descricao, preco, estoque, imagem }) {
  const produtoId = BigInt(id);
  return prisma.$transaction(async (tx) => {
    await tx.produto.update({
      where: { id: produtoId },
      data: { categoria_id: categoriaId, tecnica_id: tecnicaId, regiao_id: regiaoId, nome, descricao, preco, estoque, atualizado_em: new Date() },
    });
    const principal = await tx.produto_imagem.findFirst({ where: { produto_id: produtoId, ordem: 0 }, orderBy: { id: "asc" } });
    if (principal) {
      await tx.produto_imagem.update({ where: { id: principal.id }, data: { chave_armazenamento: imagem } });
    } else {
      await tx.produto_imagem.create({ data: { produto_id: produtoId, chave_armazenamento: imagem, content_type: "image/jpeg", ordem: 0 } });
    }
    return tx.produto.findUnique({ where: { id: produtoId }, include: INCLUDE_PRODUTO });
  });
}

/**
 * Exclusão LÓGICA: o produto pode estar em pedidos antigos (item_pedido), e a
 * chave estrangeira impede apagar a linha. Inativo, ele some da vitrine.
 */
export function desativar(id) {
  return prisma.produto.update({ where: { id: BigInt(id) }, data: { status: "inativo", atualizado_em: new Date() } });
}
