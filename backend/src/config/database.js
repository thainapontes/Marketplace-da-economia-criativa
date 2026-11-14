// ============================================================================
// Conexão com o PostgreSQL e o "envelope" de transação.
// ============================================================================

import pg from "pg";

const { Pool, types } = pg;

/**
 * [U2] Datas sem fuso (TIMESTAMP) são UTC.
 *
 * As colunas de data do DDL são TIMESTAMP (sem fuso). O PostgreSQL do
 * docker-compose roda em UTC, então now() grava horário UTC — e o seed também
 * usa UTC. Mas o driver `pg`, por padrão, interpreta esse valor no fuso da
 * MÁQUINA que roda o Node: em Recife (-03:00), "12:00" virava 15:00Z e toda
 * data da API saía 3 horas errada. 1114 é o código do tipo TIMESTAMP.
 */
types.setTypeParser(1114, (texto) => new Date(`${texto.replace(" ", "T")}Z`));

/**
 * POOL DE CONEXÕES.
 *
 * Abrir uma conexão com o banco é caro (rede + autenticação). O pool mantém um
 * conjunto de conexões já abertas e as reaproveita — como uma frota de táxis no
 * ponto: quem precisa pega um livre, usa, devolve.
 *
 * `max` é o número máximo de conexões simultâneas. Ele é o teto real de
 * concorrência do sistema: com max=10, no máximo 10 checkouts conversam com o
 * banco ao mesmo tempo; as outras requisições ficam numa fila DENTRO da
 * aplicação, esperando um táxi livre. É por isso que 50 compras simultâneas
 * chegam ao banco em ondas de ~10.
 */
export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://origem:origem@localhost:5434/origem",
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

/**
 * Executa `trabalho` dentro de uma TRANSAÇÃO.
 *
 * Transação = bloco de operações que o banco trata como uma coisa só: ou todas
 * acontecem (COMMIT), ou nenhuma acontece (ROLLBACK). É o que garante que não
 * exista pedido criado sem a baixa de estoque correspondente, nem baixa de
 * estoque sem pedido.
 *
 * Detalhe que NÃO é opcional: usamos `pool.connect()` para pegar UMA conexão
 * dedicada e mandamos BEGIN, os comandos e COMMIT todos por ela. Se em vez
 * disso usássemos `pool.query()` direto, cada comando poderia sair por uma
 * conexão diferente do pool — e o BEGIN iria por um caminho enquanto o UPDATE
 * iria por outro. A transação simplesmente não existiria, e os locks de linha
 * (que duram até o fim da transação) seriam liberados no momento errado.
 *
 * O `finally` com `cliente.release()` devolve a conexão ao pool
 * incondicionalmente. Sem ele, uma falha vazaria a conexão: depois de 10 erros
 * o pool estaria esgotado e a API travaria inteira.
 */
export async function comTransacao(trabalho) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await trabalho(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally {
    cliente.release();
  }
}
