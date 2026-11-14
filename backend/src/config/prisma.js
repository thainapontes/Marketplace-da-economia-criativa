// ============================================================================
// Cliente do Prisma (ORM) — um só para a aplicação inteira.
//
// O schema (prisma/schema.prisma) é GERADO a partir do banco com
// `npm run prisma:pull`: quem manda nas tabelas continua sendo o SQL da equipe
// em sql/. O Prisma é usado para as consultas do dia a dia (cadastro, catálogo).
// As partes do FCCPD U1 (checkout concorrente e fila) continuam em SQL puro
// pelo driver `pg` (src/config/database.js), porque dependem de comandos que o Prisma não
// expressa (UPDATE condicional atômico, FOR UPDATE SKIP LOCKED).
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { config } from "./env.js";

// datasourceUrl: o mesmo endereço do banco que o resto da API usa, com o mesmo
// valor padrão de desenvolvimento (não depende de arquivo .env).
export const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
