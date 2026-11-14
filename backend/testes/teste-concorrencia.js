// ============================================================================
// [FCCPD — Etapa 3] TESTE DE CARGA DO CHECKOUT
//
// Dispara N compras SIMULTÂNEAS do mesmo produto e mede se o estoque sobreviveu.
//
// Uso:
//   node testes/teste-concorrencia.js                    # versão segura
//   node testes/teste-concorrencia.js --rota=/pedidos-naive
//   node testes/teste-concorrencia.js --requisicoes=50 --estoque=10
//
// Pré-requisito: a API precisa estar de pé (npm run api).
//
// O QUE SIGNIFICA "SIMULTÂNEAS" AQUI: o script monta as 50 requisições sem
// esperar nenhuma resposta e só depois espera todas juntas (Promise.all). Elas
// saem em rajada, e é o servidor + o banco que decidem a ordem — que é
// exatamente a condição em que a race condition aparece. Se o script mandasse
// uma, esperasse, mandasse a próxima (sequencial), NADA quebraria, nem na
// versão ingênua: sem simultaneidade não existe race condition.
// ============================================================================

import { cabecalhosDoComprador } from "./sessao-comprador.js";

const API = process.env.API ?? "http://localhost:3333";

// Preenchido uma vez, antes da rajada (login do comprador; ver sessao-comprador.js).
let cabecalhos = { "Content-Type": "application/json" };

// Lê --chave=valor da linha de comando.
function argumento(nome, padrao) {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split("=")[1] : padrao;
}

const ROTA = argumento("rota", "/pedidos");
const REQUISICOES = Number(argumento("requisicoes", 50));
const ESTOQUE_INICIAL = Number(argumento("estoque", 10));
const PRODUTO_ID = Number(argumento("produto", 1));

const linha = (c = "─") => console.log(c.repeat(78));

async function json(caminho, opcoes) {
  const resposta = await fetch(`${API}${caminho}`, opcoes);
  return { status: resposta.status, corpo: await resposta.json().catch(() => ({})) };
}

/** Uma tentativa de compra. Devolve o status HTTP e o código de erro, se houver. */
async function comprar() {
  try {
    const resposta = await fetch(`${API}${ROTA}`, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({
        compradorId: 1, // usado só pela rota /pedidos-naive (laboratório)
        enderecoEntrega: "Rua da Aurora, 100 - Recife/PE",
        metodoPagamento: "pix",
        itens: [{ produtoId: PRODUTO_ID, quantidade: 1 }],
      }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    return { status: resposta.status, erro: corpo?.erro ?? null };
  } catch (e) {
    return { status: 0, erro: `REDE: ${e.message}` };
  }
}

async function principal() {
  linha("═");
  console.log(`TESTE DE CONCORRÊNCIA NO CHECKOUT — rota ${ROTA}`);
  console.log(`versão: ${ROTA === "/pedidos-naive" ? "INGÊNUA (com race condition)" : "SEGURA (UPDATE condicional)"}`);
  console.log(`${REQUISICOES} compras simultâneas de 1 unidade · produto ${PRODUTO_ID} · estoque inicial ${ESTOQUE_INICIAL}`);
  console.log(`quando: ${new Date().toISOString()}`);
  linha("═");

  const saude = await json("/saude").catch(() => null);
  if (!saude || saude.status !== 200) {
    console.error(`✖ A API não respondeu em ${API}. Suba com: npm run api`);
    process.exit(1);
  }

  // Estado conhecido: sem esta limpeza, a sobra do teste anterior falsearia o número.
  await json("/teste/reiniciar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estoque: ESTOQUE_INICIAL }),
  });

  cabecalhos = await cabecalhosDoComprador();

  const inicio = Date.now();
  // AQUI está a simultaneidade: as N promessas são criadas de uma vez...
  const promessas = Array.from({ length: REQUISICOES }, () => comprar());
  // ...e só agora esperamos todas.
  const respostas = await Promise.all(promessas);
  const duracaoMs = Date.now() - inicio;

  // Contagem por status HTTP e por código de erro do domínio.
  const porStatus = {};
  const porErro = {};
  for (const r of respostas) {
    porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
    if (r.erro) porErro[r.erro] = (porErro[r.erro] ?? 0) + 1;
  }

  const produto = await json(`/produtos/${PRODUTO_ID}`);
  const estoqueFinal = produto.corpo.estoque;
  const aprovados = porStatus[201] ?? 0;
  const vendidosAlemDoEstoque = aprovados - ESTOQUE_INICIAL;
  const baixaRegistrada = ESTOQUE_INICIAL - estoqueFinal;
  const escritasPerdidas = aprovados - baixaRegistrada;

  linha();
  console.log("RESPOSTAS");
  for (const [status, total] of Object.entries(porStatus).sort()) {
    const rotulo =
      { 201: "criado", 409: "conflito (rejeitado)", 404: "produto inexistente", 400: "corpo inválido", 500: "erro interno" }[status] ??
      "outro";
    console.log(`  HTTP ${status} (${rotulo}): ${total}`);
  }
  if (Object.keys(porErro).length > 0) {
    console.log("  códigos de erro:");
    for (const [erro, total] of Object.entries(porErro)) console.log(`    ${erro}: ${total}`);
  }

  linha();
  console.log("ESTOQUE");
  console.log(`  inicial ................................ ${ESTOQUE_INICIAL}`);
  console.log(`  final .................................. ${estoqueFinal}`);
  console.log(`  compras aprovadas (HTTP 201) ........... ${aprovados}`);
  console.log(`  baixa efetivamente registrada .......... ${baixaRegistrada}`);
  console.log(`  ESCRITAS PERDIDAS (lost update) ........ ${escritasPerdidas}`);
  console.log(`  unidades vendidas além do estoque ...... ${vendidosAlemDoEstoque > 0 ? vendidosAlemDoEstoque : 0}`);
  console.log(`  duração da rajada ...................... ${duracaoMs} ms`);

  linha();
  const consistente = aprovados === ESTOQUE_INICIAL && estoqueFinal === 0 && escritasPerdidas === 0;
  if (consistente) {
    console.log("✅ VEREDITO: CONSISTENTE.");
    console.log(`   Foram vendidas exatamente as ${ESTOQUE_INICIAL} unidades que existiam,`);
    console.log(`   as outras ${REQUISICOES - ESTOQUE_INICIAL} compras receberam 409, e o estoque zerou sem ficar negativo.`);
  } else {
    console.log("🔴 VEREDITO: INCONSISTENTE.");
    if (vendidosAlemDoEstoque > 0) {
      console.log(`   OVERSELLING: ${aprovados} vendas confirmadas para ${ESTOQUE_INICIAL} unidades em estoque.`);
    }
    if (escritasPerdidas > 0) {
      console.log(`   LOST UPDATE: ${aprovados} baixas foram executadas, mas o estoque caiu apenas ${baixaRegistrada}.`);
      console.log(`   ${escritasPerdidas} escritas foram sobrescritas por outras — o número do estoque perdeu o sentido.`);
    }
    if (estoqueFinal < 0) console.log(`   Estoque NEGATIVO (${estoqueFinal}).`);
  }
  linha("═");
}

principal().catch((e) => {
  console.error("Falha no teste:", e);
  process.exit(1);
});
