// ============================================================================
// [FCCPD — Etapa 3] TESTE DE CONFIABILIDADE DA FILA
//
// Uso: node testes/teste-fila.js [--jobs=200]
// Pré-requisito: API de pé (npm run api). O script sobe e derruba os workers
// sozinho — NÃO deixe um `npm run worker` rodando, senão ele rouba os jobs e o
// teste perde o sentido.
//
// Três provas, na ordem:
//
//   PARTE 1 — SOBREVIVÊNCIA À QUEDA (a principal)
//     Enfileira 200 jobs, sobe um worker, mata ele com `kill -9` no meio do
//     trabalho e sobe outro. `kill -9` (SIGKILL) é a morte súbita: o processo
//     não recebe aviso e não roda nenhuma limpeza — o equivalente a arrancar o
//     cabo da tomada. Nenhum job pode se perder e nenhum efeito pode duplicar.
//
//   PARTE 2 — RETRY, BACKOFF E DEAD-LETTER
//     Com TAXA_FALHA=1 (tudo falha), acompanha as tentativas espaçadas e o job
//     terminando em 'morto'.
//
//   PARTE 3 — SKIP LOCKED
//     Três workers ao mesmo tempo: eles dividem a fila em vez de disputá-la, e
//     nenhum job é executado por dois.
// ============================================================================

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pool } from "../src/config/database.js";

const API = process.env.API ?? "http://localhost:3333";
const achado = process.argv.find((a) => a.startsWith("--jobs="));
const JOBS = Number(achado ? achado.split("=")[1] : 200);

// Pasta backend/, onde o worker é iniciado.
// fileURLToPath, e NÃO url.pathname: `pathname` devolve o caminho
// PERCENT-ENCODED (espaço vira %20), e o caminho deste projeto tem espaços no
// nome. Com %20 a pasta simplesmente não existe e o spawn falha com ENOENT.
const PASTA_BACKEND = fileURLToPath(new URL("..", import.meta.url));

const linha = (c = "─") => console.log(c.repeat(78));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sobe um worker como PROCESSO FILHO, com variáveis de ambiente próprias. */
function subirWorker(env = {}, rotulo = "worker") {
  const filho = spawn("node", ["src/worker.js"], {
    cwd: PASTA_BACKEND,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  filho.stdout.on("data", (d) => process.stdout.write(`   │ ${d}`.replace(/\n(?!$)/g, "\n   │ ")));
  filho.stderr.on("data", (d) => process.stderr.write(`   │ ${d}`));
  // Sem este ouvinte, um erro ao iniciar o processo (ex.: caminho errado) vira
  // um 'error' não tratado e derruba o teste inteiro com um rastro confuso.
  filho.on("error", (e) => console.error(`   ✖ falha ao iniciar ${rotulo}: ${e.message}`));
  console.log(`   ▸ ${rotulo} iniciado (PID ${filho.pid})`);
  return filho;
}

async function contagens() {
  const r = await pool.query(`
    SELECT
      COUNT(*)::int                                          AS jobs,
      COUNT(*) FILTER (WHERE status = 'processado')::int      AS processados,
      COUNT(*) FILTER (WHERE status = 'processando')::int     AS em_processamento,
      COUNT(*) FILTER (WHERE status IN ('pendente','falha'))::int AS na_fila,
      COUNT(*) FILTER (WHERE status = 'morto')::int           AS mortos,
      COUNT(*) FILTER (WHERE tentativas > 1)::int             AS reentregues,
      COALESCE(MAX(tentativas), 0)::int                       AS max_tentativas
    FROM evento_assincrono`);
  const n = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(DISTINCT chave_idempotencia)::int AS distintos FROM notificacao`,
  );
  return { ...r.rows[0], efeitos: n.rows[0].total, efeitosDistintos: n.rows[0].distintos };
}

/** Espera até a fila esvaziar (ou desistir). */
async function esperarFilaVazia(limiteSegundos = 90) {
  for (let i = 0; i < limiteSegundos * 2; i++) {
    const c = await contagens();
    if (c.na_fila === 0 && c.em_processamento === 0) return c;
    await dormir(500);
  }
  return contagens();
}

async function reiniciar() {
  await fetch(`${API}/teste/reiniciar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estoque: 10 }),
  });
}

async function enfileirar(quantidade, lote) {
  const resposta = await fetch(`${API}/teste/fila`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantidade, lote }),
  });
  return resposta.json();
}

// ----------------------------------------------------------------------------
async function parte1() {
  linha("═");
  console.log(`PARTE 1 — ${JOBS} JOBS, WORKER MORTO COM kill -9 NO MEIO`);
  linha("═");

  await reiniciar();
  const enfileirados = await enfileirar(JOBS, `crash-${Date.now()}`);
  console.log(`   enfileirados: ${enfileirados.enfileirados} jobs`);

  // TIMEOUT_JOB_MS curto (3s) para o teste não demorar: é o tempo que a fila
  // espera antes de considerar órfão um job preso em 'processando'.
  const workerA = subirWorker({ TIMEOUT_JOB_MS: "3000" }, "worker A");

  // Deixa processar ~15% e mata sem aviso.
  for (let i = 0; i < 60; i++) {
    const c = await contagens();
    if (c.processados >= Math.max(5, Math.floor(JOBS * 0.15))) break;
    await dormir(250);
  }
  const antes = await contagens();
  console.log(`\n   ☠️  kill -9 no worker A (PID ${workerA.pid}) — morte súbita, sem limpeza`);
  workerA.kill("SIGKILL");
  await dormir(500);
  console.log(`   estado no instante da queda: ${antes.processados} processados · ` +
    `${antes.em_processamento} presos em 'processando' · ${antes.na_fila} na fila\n`);

  const workerB = subirWorker({ TIMEOUT_JOB_MS: "3000" }, "worker B");
  const fim = await esperarFilaVazia();
  workerB.kill("SIGTERM");
  await dormir(600);

  linha();
  console.log("RESULTADO");
  console.log(`  jobs enfileirados ...................... ${JOBS}`);
  console.log(`  jobs processados ....................... ${fim.processados}`);
  console.log(`  jobs reentregues (tentativa > 1) ....... ${fim.reentregues}   <- os órfãos do worker morto`);
  console.log(`  efeitos gravados (notificações) ........ ${fim.efeitos}`);
  console.log(`  efeitos DISTINTOS ...................... ${fim.efeitosDistintos}`);
  console.log(`  jobs perdidos .......................... ${JOBS - fim.processados}`);
  linha();

  const ok = fim.processados === JOBS && fim.efeitos === JOBS && fim.efeitosDistintos === JOBS;
  if (ok) {
    console.log("✅ VEREDITO: nada perdido, nada duplicado.");
    console.log(`   Os ${fim.reentregues} job(s) que o worker A segurava quando morreu voltaram à fila`);
    console.log("   (varredura de órfãos) e foram refeitos pelo worker B. Como a entrega é");
    console.log("   at-least-once, algum pôde executar duas vezes — e a idempotência garantiu");
    console.log(`   que o EFEITO acontecesse uma vez só: ${fim.efeitos} notificações, ${fim.efeitosDistintos} distintas.`);
  } else {
    console.log("🔴 VEREDITO: a fila perdeu ou duplicou trabalho.");
  }
  return ok;
}

// ----------------------------------------------------------------------------
async function parte2() {
  console.log("\n");
  linha("═");
  console.log("PARTE 2 — RETRY COM BACKOFF EXPONENCIAL E DEAD-LETTER (TAXA_FALHA=1)");
  linha("═");

  await reiniciar();
  await enfileirar(1, `deadletter-${Date.now()}`);

  // BACKOFF_BASE_MS=500 encurta a espera (500ms, 1s, 2s) para o teste caber em
  // segundos. Em produção o padrão é 2s -> 4s -> 8s -> 16s.
  const worker = subirWorker({ TAXA_FALHA: "1", BACKOFF_BASE_MS: "500" }, "worker (100% de falha)");

  for (let i = 0; i < 60; i++) {
    const c = await contagens();
    if (c.mortos > 0) break;
    await dormir(500);
  }
  worker.kill("SIGTERM");
  await dormir(600);

  const morto = await pool.query(
    `SELECT id, tipo, tentativas, max_tentativas, status, ultimo_erro FROM evento_assincrono WHERE status = 'morto'`,
  );
  linha();
  console.log("RESULTADO");
  if (morto.rowCount > 0) {
    const j = morto.rows[0];
    console.log(`  job ${j.id} [${j.tipo}] — status '${j.status}' após ${j.tentativas}/${j.max_tentativas} tentativas`);
    console.log(`  último erro registrado: ${j.ultimo_erro}`);
    linha();
    console.log("✅ VEREDITO: o job tentou de novo com espera crescente (veja os intervalos no log acima),");
    console.log("   desistiu no limite e foi para a DEAD-LETTER com o motivo guardado — em vez de");
    console.log("   tentar para sempre e entupir a fila.");
    return true;
  }
  console.log("🔴 VEREDITO: nenhum job chegou à dead-letter.");
  return false;
}

// ----------------------------------------------------------------------------
async function parte3() {
  console.log("\n");
  linha("═");
  console.log("PARTE 3 — TRÊS WORKERS SIMULTÂNEOS (SELECT ... FOR UPDATE SKIP LOCKED)");
  linha("═");

  const QUANTIDADE = 60;
  await reiniciar();
  await enfileirar(QUANTIDADE, `skiplocked-${Date.now()}`);

  const porWorker = new Map();
  const jobsVistos = new Map(); // job -> quantos workers relataram sucesso nele
  const workers = [1, 2, 3].map((n) => {
    const filho = spawn("node", ["src/worker.js"], {
      cwd: PASTA_BACKEND,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    filho.stdout.on("data", (dados) => {
      for (const l of String(dados).split("\n")) {
        const m = l.match(/✅ job (\d+)/);
        if (!m) continue;
        porWorker.set(filho.pid, (porWorker.get(filho.pid) ?? 0) + 1);
        jobsVistos.set(m[1], (jobsVistos.get(m[1]) ?? 0) + 1);
      }
    });
    console.log(`   ▸ worker ${n} iniciado (PID ${filho.pid})`);
    return filho;
  });

  const fim = await esperarFilaVazia(60);
  for (const w of workers) w.kill("SIGTERM");
  await dormir(600);

  const duplicados = [...jobsVistos.entries()].filter(([, n]) => n > 1);
  linha();
  console.log("RESULTADO");
  console.log(`  jobs enfileirados ...................... ${QUANTIDADE}`);
  console.log(`  jobs processados ....................... ${fim.processados}`);
  console.log("  divisão do trabalho entre os processos:");
  for (const [pid, total] of porWorker) console.log(`    PID ${pid}: ${total} jobs`);
  console.log(`  jobs executados por MAIS DE UM worker ... ${duplicados.length}`);
  linha();
  if (duplicados.length === 0 && fim.processados === QUANTIDADE) {
    console.log("✅ VEREDITO: os três processos dividiram a fila e nenhum job foi entregue duas vezes.");
    console.log("   É o SKIP LOCKED: cada worker PULA as linhas que os outros já travaram, em vez de");
    console.log("   ficar esperando por elas. Sem ele, três workers renderiam o mesmo que um.");
    return true;
  }
  console.log("🔴 VEREDITO: houve entrega duplicada ou jobs não processados.");
  return false;
}

// ----------------------------------------------------------------------------
async function principal() {
  const saude = await fetch(`${API}/saude`).catch(() => null);
  if (!saude?.ok) {
    console.error(`✖ A API não respondeu em ${API}. Suba com: npm run api`);
    process.exit(1);
  }
  console.log(`TESTE DE CONFIABILIDADE DA FILA · ${new Date().toISOString()}\n`);

  const r1 = await parte1();
  const r2 = await parte2();
  const r3 = await parte3();

  console.log("\n");
  linha("═");
  console.log("RESUMO");
  console.log(`  Parte 1 — sobrevive à queda do worker, sem perder nem duplicar: ${r1 ? "✅" : "🔴"}`);
  console.log(`  Parte 2 — retry com backoff exponencial e dead-letter .........: ${r2 ? "✅" : "🔴"}`);
  console.log(`  Parte 3 — SKIP LOCKED divide a fila entre 3 processos .........: ${r3 ? "✅" : "🔴"}`);
  linha("═");

  await pool.end();
  process.exit(r1 && r2 && r3 ? 0 : 1);
}

principal().catch(async (e) => {
  console.error("Falha no teste:", e);
  await pool.end().catch(() => {});
  process.exit(1);
});
