// ============================================================================
// A FILA ASSÍNCRONA — as quatro operações.
//
//   enfileirar()          a API deposita um bilhete e vai embora  (produtor)
//   reservar()            o worker pega jobs para si              (consumidor)
//   confirmar()           ack: deu certo, pode encerrar
//   falhar()              erro: agenda nova tentativa, ou mata o job
//
// Vocabulário (primeira vez que aparece):
//   JOB      = uma tarefa pendente. Uma linha em evento_assincrono.
//   PRODUTOR = quem cria jobs (a API, dentro do checkout).
//   CONSUMIDOR / WORKER = quem executa (src/worker.js, processo separado).
//   ACK (acknowledge) = a confirmação de "terminei com sucesso". Só depois dela
//                       o job sai da fila. Se o worker morrer antes, o job
//                       continua lá para outro pegar — nada se perde.
// ============================================================================

// Quanto tempo um job pode ficar em 'processando' antes de ser considerado
// ÓRFÃO (o worker que o pegou morreu). Em jargão de filas: visibility timeout.
const TIMEOUT_JOB_MS = Number(process.env.TIMEOUT_JOB_MS ?? 30_000);

// Base do backoff exponencial: 1ª falha espera 2s, depois 4s, 8s, 16s...
const BACKOFF_BASE_MS = Number(process.env.BACKOFF_BASE_MS ?? 2_000);

// ----------------------------------------------------------------------------
// PRODUTOR
// ----------------------------------------------------------------------------
/**
 * Deposita um job na fila.
 *
 * Recebe `cliente` (uma conexão dentro de uma transação já aberta), e NÃO o
 * pool. Isso é deliberado e é o ponto mais forte deste desenho:
 *
 *   TRANSACTIONAL OUTBOX — o bilhete da fila é gravado na MESMA transação que
 *   grava o pedido. Ou os dois existem, ou nenhum dos dois existe.
 *   - Se o checkout der ROLLBACK, o job some junto: ninguém é notificado de uma
 *     compra que não aconteceu.
 *   - Se o pedido for confirmado, o job está gravado no mesmo COMMIT: é
 *     impossível o processo cair "no meio" e perder a notificação.
 *   Uma fila externa (Redis, RabbitMQ) NÃO consegue isso, porque está fora da
 *   transação do banco — precisaria de um protocolo bem mais complicado.
 *
 * `ON CONFLICT DO NOTHING` + índice UNIQUE = idempotência na entrada: mandar
 * enfileirar a mesma coisa duas vezes cria UM job. Repare que quem garante isso
 * é o BANCO, não um `if` da aplicação: um `if` seria "consultar e depois
 * inserir" — o mesmo check-then-act que causou o bug de estoque na Etapa 1.
 *
 * @returns {number|null} o id do job criado, ou null se já existia (duplicado).
 */
export async function enfileirar(cliente, { tipo, payload, chave = null, maxTentativas = 4 }) {
  const resultado = await cliente.query(
    `INSERT INTO evento_assincrono (tipo, payload, chave_idempotencia, max_tentativas)
     VALUES ($1, $2::jsonb, $3, $4)
     ON CONFLICT (chave_idempotencia) WHERE chave_idempotencia IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [tipo, JSON.stringify(payload), chave, maxTentativas],
  );
  return resultado.rowCount === 0 ? null : Number(resultado.rows[0].id);
}

// ----------------------------------------------------------------------------
// CONSUMIDOR
// ----------------------------------------------------------------------------
/**
 * Reserva até `limite` jobs para ESTE worker.
 *
 * O comando abaixo é o núcleo técnico da entrega. Lendo de dentro para fora:
 *
 * 1) SELECT ... WHERE status IN ('pendente','falha') AND disponivel_em <= now()
 *    Pega só o que está pronto AGORA. Um job que falhou e está de backoff tem
 *    disponivel_em no futuro e simplesmente não aparece.
 *
 * 2) ORDER BY disponivel_em, id
 *    Ordem de chegada (FIFO, first in first out — o primeiro que entra é o
 *    primeiro que sai). Também evita deadlock entre workers, pelo mesmo motivo
 *    da Etapa 1: todo mundo adquire os locks na mesma ordem.
 *
 * 3) FOR UPDATE
 *    Trava as linhas selecionadas. Um lock de linha, igual ao da Etapa 1.
 *
 * 4) SKIP LOCKED  <- a peça que faz isto virar uma fila de verdade
 *    Sem ele, o worker 2 ficaria PARADO esperando as linhas que o worker 1 já
 *    travou — dois workers renderiam o mesmo que um. Com ele, o worker 2 pula
 *    as linhas ocupadas e leva as próximas livres. Resultado: os workers
 *    dividem o trabalho e NENHUM job vai para dois workers ao mesmo tempo.
 *
 * 5) UPDATE ... SET status='processando', tentativas = tentativas + 1
 *    Marcar antes de executar é o que impede a entrega dupla depois que o lock
 *    cair. O contador sobe AQUI, na entrega — não na falha — porque um worker
 *    que morre sem dizer nada também consumiu uma tentativa.
 *
 * Tudo isso é UM comando SQL, logo atômico: não existe instante em que outro
 * worker veja o job como disponível depois de ele ter sido reservado.
 */
export async function reservar(executor, limite = 5) {
  const resultado = await executor.query(
    `UPDATE evento_assincrono
        SET status        = 'processando',
            tentativas    = tentativas + 1,
            atualizado_em = now()
      WHERE id IN (
            SELECT id
              FROM evento_assincrono
             WHERE status IN ('pendente', 'falha')
               AND disponivel_em <= now()
             ORDER BY disponivel_em, id
             FOR UPDATE SKIP LOCKED
             LIMIT $1
      )
      RETURNING id, tipo, payload, tentativas, max_tentativas, chave_idempotencia`,
    [limite],
  );
  return resultado.rows.map((linha) => ({
    id: Number(linha.id),
    tipo: linha.tipo,
    payload: linha.payload,
    tentativas: linha.tentativas,
    maxTentativas: linha.max_tentativas,
    chave: linha.chave_idempotencia,
  }));
}

/**
 * ACK — o job terminou com sucesso.
 *
 * Roda DEPOIS do trabalho, nunca antes. Essa ordem é a diferença entre
 * at-least-once e "perdi a tarefa": se o worker cair entre executar e dar o
 * ack, o job fica em 'processando' e a varredura de órfãos o devolve à fila —
 * e ele roda de novo. É justamente por isso que a tarefa precisa ser
 * idempotente (ver `tarefas.js`).
 */
export async function confirmar(executor, jobId) {
  await executor.query(
    `UPDATE evento_assincrono
        SET status = 'processado', processado_em = now(), atualizado_em = now(), ultimo_erro = NULL
      WHERE id = $1`,
    [jobId],
  );
}

/**
 * NACK — o job falhou.
 *
 * Duas saídas possíveis:
 *
 *  a) Ainda há tentativas: volta para 'falha' com `disponivel_em` no futuro.
 *     BACKOFF EXPONENCIAL — 2s, 4s, 8s, 16s. Dobrar a espera serve para não
 *     martelar um serviço que já está com problema (se o servidor de e-mail
 *     caiu, 1000 tentativas por segundo atrapalham a recuperação dele e ainda
 *     queimam todas as suas chances em 2 segundos).
 *
 *  b) Acabaram as tentativas: status 'morto' — a DEAD-LETTER. O job para de
 *     tentar, mas fica guardado com o motivo do erro, para alguém investigar.
 *     Sem isso, um job impossível (ex.: pedido apagado) tentaria para sempre.
 *
 * O `interval` é calculado pelo próprio Postgres a partir de `tentativas`, então
 * o backoff não depende de nada que a aplicação guarde na memória — outro
 * worker, em outra máquina, chega ao mesmo número.
 */
export async function falhar(executor, job, erro) {
  const mensagem = String(erro?.message ?? erro).slice(0, 1000);
  const esgotou = job.tentativas >= job.maxTentativas;

  if (esgotou) {
    await executor.query(
      `UPDATE evento_assincrono
          SET status = 'morto', ultimo_erro = $2, atualizado_em = now()
        WHERE id = $1`,
      [job.id, mensagem],
    );
    return { morto: true, esperaMs: 0 };
  }

  const esperaMs = BACKOFF_BASE_MS * 2 ** (job.tentativas - 1);
  await executor.query(
    `UPDATE evento_assincrono
        SET status        = 'falha',
            ultimo_erro   = $2,
            disponivel_em = now() + ($3 || ' milliseconds')::interval,
            atualizado_em = now()
      WHERE id = $1`,
    [job.id, mensagem, esperaMs],
  );
  return { morto: false, esperaMs };
}

/**
 * Devolve à fila os jobs ÓRFÃOS.
 *
 * Órfão = job preso em 'processando' porque o worker que o pegou morreu de
 * repente (queda de energia, `kill -9`, deploy). Ninguém vai dar ack por ele, e
 * sem esta varredura ele ficaria parado para sempre — a fila "vazaria" tarefas.
 *
 * O critério é tempo: passou de TIMEOUT_JOB_MS sem notícia, presume-se morto e
 * o job volta para 'pendente'. É o mesmo mecanismo que o SQS da AMZ chama de
 * visibility timeout. Como `tentativas` já foi incrementado na reserva, um job
 * que derruba o worker toda vez também acaba na dead-letter em vez de ficar em
 * loop infinito.
 *
 * Nota honesta para a defesa: o timeout precisa ser MAIOR que a tarefa mais
 * lenta. Se for curto demais, a fila reentrega um job que ainda está rodando e
 * ele executa em dobro — e aí é a idempotência que segura o estrago.
 */
export async function recuperarOrfaos(executor, timeoutMs = TIMEOUT_JOB_MS) {
  const resultado = await executor.query(
    `UPDATE evento_assincrono
        SET status = 'pendente', atualizado_em = now()
      WHERE status = 'processando'
        AND atualizado_em < now() - ($1 || ' milliseconds')::interval
      RETURNING id`,
    [timeoutMs],
  );
  return resultado.rowCount;
}

/** Fotografia da fila por status — usada pela rota GET /fila e pelos testes. */
export async function resumo(executor) {
  const porStatus = await executor.query(
    `SELECT status, COUNT(*)::int AS total FROM evento_assincrono GROUP BY status ORDER BY status`,
  );
  const mortos = await executor.query(
    `SELECT id, tipo, tentativas, ultimo_erro
       FROM evento_assincrono WHERE status = 'morto' ORDER BY id DESC LIMIT 10`,
  );
  const contagem = { pendente: 0, processando: 0, processado: 0, falha: 0, morto: 0 };
  for (const linha of porStatus.rows) contagem[linha.status] = linha.total;
  return {
    porStatus: contagem,
    total: Object.values(contagem).reduce((a, b) => a + b, 0),
    deadLetter: mortos.rows.map((l) => ({
      id: Number(l.id),
      tipo: l.tipo,
      tentativas: l.tentativas,
      ultimoErro: l.ultimo_erro,
    })),
  };
}
