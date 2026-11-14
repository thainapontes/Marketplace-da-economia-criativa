// ============================================================================
// Configuração lida do ambiente, num lugar só.
//
// Todas as variáveis têm valor padrão para desenvolvimento e estão
// documentadas em .env.example. Nenhum outro arquivo lê process.env direto
// (exceção: config/database.js e o worker, que vêm da U1 e continuam como estão).
// ============================================================================

// Só para desenvolvimento e testes. Nunca use em produção.
const SEGREDO_DESENVOLVIMENTO = "origem-dev-segredo-nao-usar-em-producao";

export const config = {
  porta: Number(process.env.PORT ?? 3333),

  // Endereço do PostgreSQL (o mesmo para o Prisma e para o driver pg).
  databaseUrl: process.env.DATABASE_URL ?? "postgres://origem:origem@localhost:5434/origem",

  // Flag de ambiente do FCCPD U1: roda POST /pedidos no modo ingênuo.
  checkoutIngenuo: process.env.NAIVE_CHECKOUT === "true",

  // Origens que o navegador pode usar para chamar a API (CORS). O frontend
  // Next.js roda na 3000; em produção entra a URL da Vercel. Separadas por vírgula.
  origensPermitidas: (process.env.CORS_ORIGEM ?? "http://localhost:3000")
    .split(",")
    .map((origem) => origem.trim())
    .filter(Boolean),

  // [U2 · 1.1] Assinatura dos tokens JWT. Quem conhece o segredo consegue
  // fabricar um token de administrador, então em produção ele é obrigatório
  // (veja a checagem abaixo). Em desenvolvimento há um valor padrão.
  jwtSegredo: process.env.JWT_SECRET ?? SEGREDO_DESENVOLVIMENTO,
  jwtValidade: process.env.JWT_VALIDADE ?? "8h",

  // [U2 · B] O token também vai num cookie httpOnly (o JavaScript da página
  // não consegue lê-lo). `Secure` = o navegador só envia o cookie por HTTPS:
  // ligado em produção; em desenvolvimento a API roda em http://localhost.
  // [U2 · C] Validade do cache da vitrine e dos filtros, em ms (0 = desligado).
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 30_000),

  cookieSeguro: (process.env.COOKIE_SECURE ?? (process.env.NODE_ENV === "production" ? "true" : "false")) === "true",
};

if (process.env.NODE_ENV === "production" && config.jwtSegredo === SEGREDO_DESENVOLVIMENTO) {
  throw new Error("JWT_SECRET não definido: obrigatório com NODE_ENV=production.");
}
