// ============================================================================
// [U2 · etapa D] Login do comprador para os testes de carga do FCCPD U1.
//
// Na U2, POST /pedidos passou a identificar o comprador pelo login (token),
// e não mais por um "compradorId" no corpo. Os testes de concorrência e de
// deadlock fazem login UMA vez antes da rajada e mandam o token em todas as
// compras. O comprador é a conta de demonstração do seed (id 1), o mesmo
// compradorId que os testes usavam na U1. A rota /pedidos-naive (checkout
// ingênuo, laboratório) continua lendo o compradorId do corpo.
// ============================================================================

const API = process.env.API ?? "http://localhost:3333";

export async function cabecalhosDoComprador() {
  const resposta = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "comprador@origem.com.br", senha: "origem123" }),
  });
  if (resposta.status !== 200) {
    throw new Error(`Login do comprador de teste falhou (HTTP ${resposta.status}). O banco está com o seed?`);
  }
  const { token } = await resposta.json();
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
