// ============================================================================
// Acesso ao banco das rotas do laboratório do FCCPD U1 — SQL puro pelo driver
// `pg`, exatamente como na entrega da U1 (os testes e as evidências dependem
// deste comportamento). Ver src/config/prisma.js para o porquê.
// ============================================================================

import { pool, comTransacao } from "../config/database.js";
import { ProdutoInexistente } from "./pedido.repository.js";
import { enfileirar, resumo } from "./fila.repository.js";

/** O banco está de pé? */
export async function verificarConexao() {
  await pool.query("SELECT 1");
}

/**
 * Grava a imagem com status 'processando' e enfileira o processamento na MESMA
 * transação: nunca existe imagem presa em 'processando' sem job para processá-la.
 */
export function registrarImagemEEnfileirar({ produtoId, chaveArmazenamento, contentType }) {
  return comTransacao(async (cliente) => {
    const existe = await cliente.query(`SELECT 1 FROM produto WHERE id = $1`, [produtoId]);
    if (existe.rowCount === 0) throw new ProdutoInexistente(produtoId);

    const imagem = await cliente.query(
      `INSERT INTO produto_imagem (produto_id, chave_armazenamento, content_type, status)
       VALUES ($1, $2, $3, 'processando')
       RETURNING id`,
      [produtoId, chaveArmazenamento, contentType],
    );
    const imagemId = Number(imagem.rows[0].id);

    const jobId = await enfileirar(cliente, {
      tipo: "processar_imagem",
      chave: `processar-imagem:${imagemId}`,
      payload: { imagemId, produtoId, chaveArmazenamento },
    });

    return { imagemId, jobId, status: "processando" };
  });
}

/** Fotografia da fila: quantos jobs em cada status + o que está na dead-letter. */
export function resumoDaFila() {
  return resumo(pool);
}

/** Enfileira `quantidade` jobs de teste numa transação; devolve os ids criados. */
export function enfileirarLote({ quantidade, lote }) {
  return comTransacao(async (cliente) => {
    const criados = [];
    for (let i = 1; i <= quantidade; i++) {
      const jobId = await enfileirar(cliente, {
        tipo: "notificar_pedido",
        chave: `teste-carga:${lote}:${i}`,
        payload: {
          pedidoId: 0,
          usuarioId: 1,
          papel: "comprador",
          mensagem: `Job de teste ${i} do lote ${lote}.`,
        },
      });
      if (jobId !== null) criados.push(jobId);
    }
    return criados;
  });
}

/** Apaga pedidos e fila e recoloca o estoque de todos os produtos. */
export function reiniciar(estoque) {
  return comTransacao(async (cliente) => {
    // item_pedido e pagamento têm ON DELETE CASCADE a partir de pedido.
    await cliente.query("DELETE FROM pedido");
    // A fila e seus efeitos também voltam ao zero, senão as chaves de
    // idempotência da rodada anterior barrariam os jobs da rodada nova.
    await cliente.query("DELETE FROM evento_assincrono");
    await cliente.query("DELETE FROM notificacao");
    // Só as imagens que passaram pela fila (status diferente de 'disponivel',
    // ou com hash gravado pelo worker). As fotos do catálogo (seed e painel do
    // artesão) não passam pela fila e ficam: sem isso, rodar os testes da U1
    // deixaria a vitrine inteira sem imagem.
    await cliente.query(
      "DELETE FROM produto_imagem WHERE status <> 'disponivel' OR hash_sha256 IS NOT NULL",
    );
    await cliente.query("UPDATE produto SET estoque = $1, atualizado_em = now()", [estoque]);
  });
}
