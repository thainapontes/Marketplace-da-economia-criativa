// ============================================================================
// Configuração lida do ambiente, num lugar só.
//
// Todas as variáveis têm valor padrão para desenvolvimento e estão
// documentadas em .env.example. Nenhum outro arquivo lê process.env direto
// (exceção: db.js e o worker, que vêm da U1 e continuam como estão).
// ============================================================================

export const config = {
  porta: Number(process.env.PORT ?? 3333),

  // Flag de ambiente do FCCPD U1: roda POST /pedidos no modo ingênuo.
  checkoutIngenuo: process.env.NAIVE_CHECKOUT === "true",

  // Origens que o navegador pode usar para chamar a API (CORS). O frontend
  // Next.js roda na 3000; em produção entra a URL da Vercel. Separadas por vírgula.
  origensPermitidas: (process.env.CORS_ORIGEM ?? "http://localhost:3000")
    .split(",")
    .map((origem) => origem.trim())
    .filter(Boolean),
};
