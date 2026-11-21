import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
// [U2 · J.3] Endereço da API publicada (ex.: https://origem-api.onrender.com),
// definido na Vercel. Com ele, o navegador chama /api/... no PRÓPRIO domínio do
// site e a Vercel repassa para a API. Assim o cookie de sessão é do mesmo site
// (SameSite=Lax funciona) e o navegador nem precisa de CORS. Sem a variável
// (desenvolvimento), nada muda.
const API_URL = process.env.API_URL?.replace(/\/+$/, "");

const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  outputFileTracingRoot: frontendRoot,
  async rewrites() {
    return API_URL ? [{ source: "/api/:caminho*", destination: `${API_URL}/:caminho*` }] : [];
  },
};

export default nextConfig;
