// ============================================================================
// O WORKER — processo separado que consome a fila.
//
// Subir:  npm run worker            (em OUTRO terminal, junto com a API)
// Vários: npm run worker & npm run worker &   -> dividem o trabalho sozinhos
//
// POR QUE UM PROCESSO SEPARADO, e não uma thread dentro do servidor web?
//
//   Processo = programa em execução com memória PRÓPRIA e isolada.
//   Thread   = linha de execução DENTRO de um processo; threads do mesmo
//              processo compartilham memória.
//
//   1. Isolamento de falha: se o worker travar ou estourar a memória
//      processando uma imagem enorme, ele morre sozinho. A API continua
//      vendendo. Numa thread interna, o tombo derrubaria o servidor inteiro.
//   2. Escala independente: 3 workers e 1 API, ou 1 worker e 5 APIs, conforme
//      o gargalo — sem redeploy do outro lado.
//   3. Especificamente em Node: o JavaScript da aplicação roda em UMA thread
//      só. Trabalho pesado dentro do servidor ocupa essa thread e congela
//      TODAS as requisições, inclusive as que nada têm a ver com a tarefa.
//   4. Deploy/restart do worker não derruba o site.
//
//   Isso é o DESACOPLAMENTO que a rubrica pede: os dois lados só se conhecem
//   através da tabela da fila. Nenhum chama o outro; nenhum precisa saber se o
//   outro está de pé. A API funciona com o worker desligado — os jobs
//   simplesmente se acumulam e são processados quando ele voltar.
// ============================================================================

import os from "node:os";
import { pool } from "./config/database.js";
import { reservar, confirmar, falhar, recuperarOrfaos } from "./repositories/fila.repository.js";
import { executarTarefa } from "./services/tarefas.service.js";

// Quantos jobs pegar por rodada. Pegar em lote reduz idas ao banco; lote muito
// grande faz um worker açambarcar trabalho que outro poderia estar fazendo.
const LOTE = Number(process.env.LOTE ?? 5);

// Espera entre rodadas quando a fila está VAZIA. Este worker usa POLLING
// ("ficar perguntando"): a cada intervalo ele pergunta ao banco se há trabalho.
// É simples e suficiente aqui. A alternativa seria LISTEN/NOTIFY do Postgres,
// em que o banco avisa o worker na hora — menos latência, mais uma peça para
// entender e sem ganho para esta entrega.
const INTERVALO_MS = Number(process.env.INTERVALO_MS ?? 500);

// Identificação nos logs. Rodando dois workers, o PID (número do processo no
// sistema operacional) mostra qual pegou qual job — é a evidência visível de
// que o SKIP LOCKED dividiu a fila em vez de duplicá-la.
const EU = `${os.hostname()}#${process.pid}`;

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Flag do desligamento gracioso (ver o final do arquivo).
let rodando = true;

const agora = () => new Date().toISOString().slice(11, 23);
const log = (...partes) => console.log(`[${agora()}] [worker ${EU}]`, ...partes);

/**
 * Executa UM job e responde à fila: ack em caso de sucesso, nack em caso de erro.
 *
 * A ORDEM AQUI É O CONTRATO DA FILA:
 *   1. executa a tarefa
 *   2. SÓ ENTÃO dá o ack
 * Se o processo morrer entre 1 e 2, o job fica em 'processando', a varredura de
 * órfãos o devolve à fila e ele roda de novo — por isso as tarefas são
 * idempotentes. Isto é at-least-once, e é uma escolha: o contrário seria dar o
 * ack antes de executar, o que perderia a tarefa de vez numa queda (at-most-once).
 * Numa notificação de compra, executar duas vezes é chato; não executar é falha
 * de negócio. Escolhemos o lado certo do trade-off.
 *
 * O try/catch precisa ser LARGO: qualquer erro não capturado aqui derrubaria o
 * worker e deixaria o job pendurado. Erro é o caminho normal de uma fila, não
 * uma exceção rara.
 */
async function processar(job) {
  try {
    const detalhe = await executarTarefa(pool, job);
    await confirmar(pool, job.id);
    log(`✅ job ${job.id} [${job.tipo}] ok (tentativa ${job.tentativas}) — ${detalhe}`);
  } catch (erro) {
    const { morto, esperaMs } = await falhar(pool, job, erro);
    if (morto) {
      log(
        `☠️  job ${job.id} [${job.tipo}] MORTO após ${job.tentativas} tentativas ` +
          `— vai para a dead-letter. Motivo: ${erro.message}`,
      );
    } else {
      log(
        `⚠️  job ${job.id} [${job.tipo}] falhou (tentativa ${job.tentativas}/${job.maxTentativas}) ` +
          `— nova tentativa em ${esperaMs} ms. Motivo: ${erro.message}`,
      );
    }
  }
}

/** Laço principal: recupera órfãos, reserva um lote, processa, repete. */
async function laco() {
  log(`iniciado. lote=${LOTE} intervalo=${INTERVALO_MS}ms taxaFalha=${process.env.TAXA_FALHA ?? 0}`);
  log("aguardando jobs… (Ctrl+C para encerrar com elegância)");

  while (rodando) {
    try {
      // 1) Jobs que um worker morto deixou presos em 'processando' voltam à fila.
      const recuperados = await recuperarOrfaos(pool);
      if (recuperados > 0) {
        log(`♻️  ${recuperados} job(s) órfão(s) recuperado(s) — algum worker caiu sem dar ack.`);
      }

      // 2) Reserva um lote só para este worker (UPDATE ... FOR UPDATE SKIP LOCKED).
      const jobs = await reservar(pool, LOTE);

      // 3) Fila vazia: dorme um pouco. Sem esta pausa, o worker consultaria o
      //    banco milhares de vezes por segundo sem fazer nada útil.
      if (jobs.length === 0) {
        await dormir(INTERVALO_MS);
        continue;
      }

      // 4) Processa os jobs do lote, um a um. Sequencial de propósito: é mais
      //    fácil de acompanhar no log e a concorrência de verdade vem de subir
      //    MAIS PROCESSOS worker, que é o que a fila foi feita para suportar.
      for (const job of jobs) {
        if (!rodando) break; // pedido de desligamento no meio do lote
        await processar(job);
      }
    } catch (erro) {
      // Erro de infraestrutura (banco fora do ar, rede). Não pode matar o
      // worker: ele espera e tenta de novo — o mesmo espírito do backoff.
      log(`💥 erro no laço principal: ${erro.message}. Tentando de novo em 2s.`);
      await dormir(2000);
    }
  }

  log("encerrando: fechando o pool de conexões.");
  await pool.end();
  log("encerrado.");
  process.exit(0);
}

// ----------------------------------------------------------------------------
// DESLIGAMENTO GRACIOSO
//
// Ctrl+C (SIGINT) ou `docker stop` (SIGTERM) não matam o worker na hora: a flag
// `rodando` vira false e o laço termina o job que está na mão antes de sair.
// Sem isso, todo restart abandonaria jobs em 'processando', que só voltariam
// depois do timeout de órfãos — e poderiam rodar duas vezes à toa.
//
// Isto trata a saída EDUCADA. A saída brutal (kill -9, queda de energia) é
// impossível de tratar por definição: contra ela, a proteção é a varredura de
// órfãos — e é exatamente esse cenário que o teste da Etapa 3 vai provocar.
// ----------------------------------------------------------------------------
for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => {
    if (!rodando) return;
    log(`recebi ${sinal} — terminando o job atual antes de sair…`);
    rodando = false;
  });
}

laco();
