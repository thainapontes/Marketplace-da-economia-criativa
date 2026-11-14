// ============================================================================
// Acesso ao banco: regiões, via Prisma.
// ============================================================================

import { prisma } from "../config/prisma.js";

/**
 * Região pelo nome, sem diferenciar maiúsculas ("agreste" = "Agreste").
 * A comparação é feita aqui, e não com o `mode: "insensitive"` do Prisma, que
 * vira um ILIKE no banco: nele, "%" ou "_" digitados pelo usuário funcionariam
 * como curinga e casariam com qualquer região. A tabela tem poucas linhas.
 */
export async function buscarPorNome(nome) {
  const regioes = await prisma.regiao.findMany({ orderBy: { id: "asc" } });
  return regioes.find((regiao) => regiao.nome.toLowerCase() === nome.toLowerCase()) ?? null;
}
