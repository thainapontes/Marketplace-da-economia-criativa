// ============================================================================
// Acesso ao banco: opções dos filtros do catálogo, via Prisma.
// ============================================================================

import { prisma } from "../config/prisma.js";

const nomes = (registros) => registros.map((registro) => registro.nome);

export async function listarOpcoes() {
  const [regioes, categorias, tecnicas] = await Promise.all([
    prisma.regiao.findMany({ orderBy: { id: "asc" }, select: { nome: true } }),
    prisma.categoria.findMany({ orderBy: { id: "asc" }, select: { nome: true } }),
    prisma.tecnica.findMany({ orderBy: { id: "asc" }, select: { nome: true } }),
  ]);
  return {
    // regiao é única por (nome, polo): o mesmo nome pode aparecer em dois polos.
    regioes: [...new Set(nomes(regioes))],
    categorias: nomes(categorias),
    tecnicas: nomes(tecnicas),
  };
}

/**
 * Categoria ou técnica pelo nome, sem diferenciar maiúsculas. Comparado em
 * JavaScript (as tabelas são pequenas) para que "%" ou "_" digitados não
 * funcionem como curinga, como aconteceria num ILIKE.
 */
async function porNome(tabela, nome) {
  const registros = await prisma[tabela].findMany({ orderBy: { id: "asc" } });
  return registros.find((registro) => registro.nome.toLowerCase() === nome.toLowerCase()) ?? null;
}

export const buscarCategoriaPorNome = (nome) => porNome("categoria", nome);
export const buscarTecnicaPorNome = (nome) => porNome("tecnica", nome);
