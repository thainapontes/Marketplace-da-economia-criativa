// ============================================================================
// [FCCPD — Etapa 3] TESTE DE DEADLOCK
//
// Uso: node testes/teste-deadlock.js [--requisicoes=40]
//
// DEADLOCK (impasse) = duas transações presas esperando uma pela outra para
// sempre: cada uma segura a linha que a outra precisa. Analogia: corredor
// estreito com duas portas — Ana entrou pela A e precisa da B, Bruno entrou
// pela B e precisa da A. Nenhum sai.
//
// COMO ESTE TESTE PROVOCA O IMPASSE: metade das compras leva o carrinho
// [produto 2, produto 3] e a outra metade leva [produto 3, produto 2] — os
// MESMOS produtos em ordem INVERSA. É a receita exata do deadlock.
//
// POR QUE ELE NÃO ACONTECE: checkout-seguro.service.js ordena os itens por produto_id
// antes de dar os UPDATEs. Todas as transações passam a pegar as travas na
// MESMA ordem, então o ciclo de espera é impossível e a espera vira uma fila
// reta — que sempre anda.
//
// O que observar: DEADLOCK_DETECTADO deve ser ZERO. Se aparecer, a ordenação
// falhou em algum caminho. (O PostgreSQL detecta o impasse em ~1s e mata uma
// das transações com o código 40P01; a API traduz isso em HTTP 409.)
// ============================================================================

import { cabecalhosDoComprador } from "./sessao-comprador.js";

const API = process.env.API ?? "http://localhost:3333";

// Preenchido uma vez, antes da rajada (login do comprador; ver sessao-comprador.js).
let cabecalhos = { "Content-Type": "application/json" };
const achado = process.argv.find((a) => a.startsWith("--requisicoes="));
const REQUISICOES = Number(achado ? achado.split("=")[1] : 40);
const ESTOQUE = REQUISICOES; // estoque sobrando de propósito: aqui o alvo é o
                             // impasse de travas, não a disputa por estoque.

const linha = (c = "─") => console.log(c.repeat(78));

async function comprar(itens) {
  const resposta = await fetch(`${API}/pedidos`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({
      compradorId: 1, // usado só pela rota /pedidos-naive (laboratório)
      enderecoEntrega: "Rua da Aurora, 100 - Recife/PE",
      metodoPagamento: "pix",
      itens,
    }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  return { status: resposta.status, erro: corpo?.erro ?? null };
}

async function principal() {
  linha("═");
  console.log("TESTE DE DEADLOCK — carrinhos com os mesmos produtos em ordem inversa");
  console.log(`${REQUISICOES} compras simultâneas · metade [2,3] · metade [3,2] · estoque ${ESTOQUE}`);
  console.log(`quando: ${new Date().toISOString()}`);
  linha("═");

  await fetch(`${API}/teste/reiniciar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estoque: ESTOQUE }),
  });
  cabecalhos = await cabecalhosDoComprador();

  const promessas = Array.from({ length: REQUISICOES }, (_, i) =>
    comprar(
      i % 2 === 0
        ? [{ produtoId: 2, quantidade: 1 }, { produtoId: 3, quantidade: 1 }]
        : [{ produtoId: 3, quantidade: 1 }, { produtoId: 2, quantidade: 1 }],
    ),
  );

  const inicio = Date.now();
  const respostas = await Promise.all(promessas);
  const duracaoMs = Date.now() - inicio;

  const porStatus = {};
  const porErro = {};
  for (const r of respostas) {
    porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
    if (r.erro) porErro[r.erro] = (porErro[r.erro] ?? 0) + 1;
  }
  const deadlocks = porErro.DEADLOCK_DETECTADO ?? 0;

  linha();
  for (const [status, total] of Object.entries(porStatus).sort()) {
    console.log(`  HTTP ${status}: ${total}`);
  }
  console.log(`  DEADLOCK_DETECTADO: ${deadlocks}`);
  console.log(`  duração: ${duracaoMs} ms`);
  linha();
  if (deadlocks === 0 && (porStatus[201] ?? 0) === REQUISICOES) {
    console.log("✅ VEREDITO: nenhum deadlock. A ordenação por produto_id eliminou o ciclo de espera.");
  } else {
    console.log(`🔴 VEREDITO: ${deadlocks} deadlock(s). A ordem de aquisição das travas não está única.`);
  }
  linha("═");
}

principal().catch((e) => {
  console.error("Falha no teste:", e);
  process.exit(1);
});
