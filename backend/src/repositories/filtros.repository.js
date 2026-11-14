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
