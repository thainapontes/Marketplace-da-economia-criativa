// ============================================================================
// AS TAREFAS — o que o worker realmente executa.
//
// Duas tarefas, exatamente as pedidas no enunciado:
//   notificar_pedido   — avisar comprador e artesã de um pedido confirmado
//   processar_imagem   — trabalho pesado sobre a imagem de um produto
//
// REGRA DE OURO DESTE ARQUIVO: toda tarefa aqui precisa ser IDEMPOTENTE, isto
// é, rodar duas vezes tem que dar o mesmo resultado que rodar uma. Isso não é
// capricho: a fila garante at-least-once (o worker pode terminar o trabalho e
// cair antes do ack, e aí o job volta). Idempotência é o que transforma
// "pelo menos uma vez" em "o efeito acontece exatamente uma vez".
// ============================================================================

import crypto from "node:crypto";

// Probabilidade de falha ARTIFICIAL, entre 0 e 1. Existe para as evidências da
// Etapa 3: sem uma falha, não há como demonstrar retry, backoff e dead-letter.
// Desligada por padrão. Uso: TAXA_FALHA=0.3 npm run worker
const TAXA_FALHA = Number(process.env.TAXA_FALHA ?? 0);

/** Pausa de verdade, sem travar o processo (o Node continua atendendo o resto). */
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sorteia uma falha, se TAXA_FALHA estiver ligada.
 *
 * Simula o que acontece de verdade em produção: o servidor de e-mail recusa a
 * conexão, a API do provedor devolve 503, o disco está cheio. São falhas
 * TRANSITÓRIAS — tentar de novo mais tarde costuma funcionar. É a existência
 * desse tipo de falha que justifica retry com backoff.
 */
function talvezFalhar(contexto) {
  if (TAXA_FALHA > 0 && Math.random() < TAXA_FALHA) {
    throw new Error(`Falha simulada (TAXA_FALHA=${TAXA_FALHA}) em ${contexto}`);
  }
}

// ----------------------------------------------------------------------------
// Tarefa 1 — NOTIFICAÇÃO
// ----------------------------------------------------------------------------
/**
 * Grava a notificação de um pedido confirmado.
 *
 * Por que isto não pode ficar no caminho do checkout: mandar e-mail/push é
 * conversa com um serviço de fora, que pode demorar segundos ou estar fora do
 * ar. O comprador ficaria esperando por algo que não é a compra dele — e, pior,
 * uma falha no e-mail poderia derrubar a transação e cancelar uma venda boa.
 *
 * COMO A IDEMPOTÊNCIA É FEITA AQUI: `chave_idempotencia` + ON CONFLICT DO
 * NOTHING. A chave descreve o EFEITO ("o comprador do pedido 42 foi avisado"),
 * não a tentativa. Se este job rodar duas vezes, o segundo INSERT esbarra no
 * índice UNIQUE e não faz nada — uma notificação, não duas. E quem decide isso
 * é o banco, que é compartilhado por todos os workers, em qualquer máquina.
 *
 * `rowCount` nos diz se houve duplicata; devolvemos isso só para o log mostrar
 * a idempotência funcionando ("duplicado: ignorado").
 */
async function notificarPedido(executor, job) {
  const { usuarioId, pedidoId, papel, mensagem } = job.payload;

  // O envio real (SMTP/push) entraria aqui. Nesta entrega, a "conversa com o
  // serviço externo" é representada por uma espera — o que importa para o
  // trabalho é que ela sai do caminho da resposta HTTP.
  await dormir(150);
  talvezFalhar(`notificar_pedido(pedido=${pedidoId}, usuario=${usuarioId})`);

  const resultado = await executor.query(
    `INSERT INTO notificacao (usuario_id, tipo, mensagem, chave_idempotencia)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (chave_idempotencia) WHERE chave_idempotencia IS NOT NULL
     DO NOTHING`,
    [usuarioId, `pedido_confirmado_${papel}`, mensagem, job.chave],
  );

  return resultado.rowCount === 1
    ? `notificação gravada para o usuário ${usuarioId}`
    : `notificação já existia (idempotência barrou a duplicata) — usuário ${usuarioId}`;
}

// ----------------------------------------------------------------------------
// Tarefa 2 — PROCESSAMENTO DE IMAGEM
// ----------------------------------------------------------------------------
/**
 * "Processa" a imagem de um produto: calcula o hash do arquivo e marca a imagem
 * como disponível.
 *
 * Decisão consciente (e para declarar na apresentação): o redimensionamento
 * real não é feito — não há biblioteca de imagem no projeto. O que é feito é um
 * trabalho de CPU de verdade, do mesmo formato: ler bytes e passar todos eles
 * por uma função pesada (SHA-256), aqui sobre ~4 MB sintéticos. O ponto da
 * rubrica é que trabalho pesado sai do caminho da resposta HTTP; o algoritmo
 * concreto é intercambiável (trocar por sharp.resize() mudaria só esta função).
 *
 * Trabalho de CPU é ainda mais grave que espera de rede dentro de um servidor
 * Node: o Node executa o JavaScript da aplicação em UMA ÚNICA THREAD. Uma
 * espera de rede libera essa thread, mas um cálculo pesado a OCUPA — e enquanto
 * ele roda, o servidor inteiro fica surdo, sem responder nem um /saude. Em
 * processo separado, esse custo cai no worker e a API nem sente.
 *
 * COMO A IDEMPOTÊNCIA É FEITA AQUI: a tarefa é naturalmente idempotente. O hash
 * é DETERMINÍSTICO (mesma entrada, mesma saída sempre) e o UPDATE grava sempre
 * o mesmo valor. Rodar dez vezes deixa a linha exatamente no mesmo estado.
 */
async function processarImagem(executor, job) {
  const { imagemId, chaveArmazenamento } = job.payload;

  // Substituto dos bytes do arquivo: conteúdo derivado da chave de
  // armazenamento — logo, determinístico e diferente para cada imagem.
  const bytes = Buffer.alloc(4 * 1024 * 1024, chaveArmazenamento);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");

  await dormir(100); // representa a leitura/gravação do arquivo no storage
  talvezFalhar(`processar_imagem(imagem=${imagemId})`);

  const resultado = await executor.query(
    `UPDATE produto_imagem
        SET hash_sha256   = $2,
            status        = 'disponivel',
            verificado_em = now()
      WHERE id = $1`,
    [imagemId, hash],
  );
  if (resultado.rowCount === 0) {
    // Falha PERMANENTE: tentar de novo nunca vai funcionar. Ainda assim ela
    // passa pelo retry e termina na dead-letter — e é exatamente para isso que
    // a dead-letter existe: separar o que está quebrado de verdade do que só
    // precisava de mais uma chance.
    throw new Error(`Imagem ${imagemId} não existe mais.`);
  }
  return `imagem ${imagemId} processada (sha256 ${hash.slice(0, 12)}…)`;
}

// ----------------------------------------------------------------------------
// Registro de tarefas
// ----------------------------------------------------------------------------
/**
 * Tabela "tipo do job -> função que executa". O worker não conhece nenhuma
 * tarefa pelo nome: ele consulta este mapa. Acrescentar uma tarefa nova no
 * futuro (ex.: emitir nota fiscal) não exige tocar no worker.
 */
export const TAREFAS = {
  notificar_pedido: notificarPedido,
  processar_imagem: processarImagem,
};

/** Executa o job pelo tipo. Tipo desconhecido é erro — vai para retry/morto. */
export async function executarTarefa(executor, job) {
  const tarefa = TAREFAS[job.tipo];
  if (!tarefa) throw new Error(`Tipo de job desconhecido: "${job.tipo}".`);
  return tarefa(executor, job);
}
