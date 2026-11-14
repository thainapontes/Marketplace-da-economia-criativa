// ============================================================================
// Rotas do FCCPD U1 (concorrência no checkout + fila assíncrona).
//
// Movidas de src/server.js na etapa 1.0 da U2 SEM mudança de comportamento:
// os testes e as evidências da U1 dependem delas.
//
//   GET  /saude                — o banco está de pé? (usado pelos scripts de teste)
//   POST /pedidos              — checkout SEGURO (ou o ingênuo, se NAIVE_CHECKOUT=true)
//   POST /pedidos-naive        — checkout INGÊNUO sempre, para o teste comparativo
//   POST /produtos/:id/imagens — registra a imagem e ENFILEIRA o processamento; 202 na hora
//   GET  /fila                 — estado da fila por status + dead-letter
//   POST /teste/reiniciar      — zera pedidos, fila e estoque (auxiliar de teste)
//   POST /teste/fila           — enfileira N jobs de uma vez (teste de carga)
//
// Ao longo da Fase 1, as rotas do produto saem daqui. GET /produtos/:id saiu na
// etapa 1.2 (hoje em routes/catalogo.routes.js, mesmos campos id/nome/preco/estoque/status que o
// teste de concorrência lê); POST /pedidos sai na 1.4.
// ============================================================================

import { Router } from "express";
import { pool, comTransacao } from "../config/database.js";
import { config } from "../config/env.js";
import { criarPedidoSeguro } from "../services/checkout-seguro.service.js";
import { criarPedidoIngenuo } from "../services/checkout-ingenuo.service.js";
import { ProdutoInexistente } from "../repositories/pedido.repository.js";
import { enfileirar, resumo } from "../repositories/fila.repository.js";
import { ErroApi } from "../middlewares/erros.js";

export const rotasLaboratorio = Router();

/**
 * Validação do corpo do checkout.
 * Rejeitar entrada malformada com 400 evita que erros de digitação do teste
 * apareçam depois como falhas misteriosas de concorrência.
 */
function validarPedido(corpo) {
  if (!corpo || typeof corpo !== "object") return "Corpo da requisição ausente.";
  if (!Number.isInteger(corpo.compradorId)) return "compradorId deve ser um inteiro.";
  if (typeof corpo.enderecoEntrega !== "string" || corpo.enderecoEntrega.trim() === "") {
    return "enderecoEntrega é obrigatório.";
  }
  if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) {
    return "itens deve ser uma lista com ao menos um item.";
  }
  for (const item of corpo.itens) {
    if (!Number.isInteger(item?.produtoId)) return "Cada item precisa de produtoId inteiro.";
    if (!Number.isInteger(item?.quantidade) || item.quantidade < 1) {
      return "Cada item precisa de quantidade inteira >= 1.";
    }
  }
  return null;
}

function exigirPedidoValido(corpo) {
  const problema = validarPedido(corpo);
  if (problema) throw new ErroApi(400, "CORPO_INVALIDO", problema);
}

rotasLaboratorio.get("/saude", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, checkoutPadrao: config.checkoutIngenuo ? "ingenuo" : "seguro" });
  } catch (erro) {
    res.status(503).json({ ok: false, mensagem: String(erro?.message ?? erro) });
  }
});

/** Checkout padrão: seguro, salvo se NAIVE_CHECKOUT=true no ambiente. */
rotasLaboratorio.post("/pedidos", async (req, res) => {
  exigirPedidoValido(req.body);
  const criar = config.checkoutIngenuo ? criarPedidoIngenuo : criarPedidoSeguro;
  res.status(201).json(await criar(req.body));
});

/** Checkout ingênuo, sempre. Existe só para o teste comparativo. */
rotasLaboratorio.post("/pedidos-naive", async (req, res) => {
  exigirPedidoValido(req.body);
  res.status(201).json(await criarPedidoIngenuo(req.body));
});

/**
 * Registra uma imagem de produto e ENFILEIRA o processamento dela.
 *
 * Esta rota NÃO processa nada: grava a linha com status 'processando',
 * deposita um job e responde 202 Accepted ("aceitei, o trabalho ainda não
 * terminou"). O enfileiramento roda na mesma transação do INSERT: nunca existe
 * imagem presa em 'processando' sem job para processá-la.
 */
rotasLaboratorio.post("/produtos/:id/imagens", async (req, res) => {
  const produtoId = Number(req.params.id);
  const chaveArmazenamento = req.body?.chaveArmazenamento;
  const contentType = req.body?.contentType ?? "image/jpeg";

  if (!Number.isInteger(produtoId)) {
    throw new ErroApi(400, "CORPO_INVALIDO", "id de produto inválido.");
  }
  if (typeof chaveArmazenamento !== "string" || chaveArmazenamento.trim() === "") {
    throw new ErroApi(400, "CORPO_INVALIDO", "chaveArmazenamento é obrigatório.");
  }

  const resultado = await comTransacao(async (cliente) => {
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

  res.status(202).json(resultado);
});

/** Fotografia da fila: quantos jobs em cada status + o que está na dead-letter. */
rotasLaboratorio.get("/fila", async (_req, res) => {
  res.json(await resumo(pool));
});

/**
 * Auxiliar de teste: enfileira `quantidade` jobs de uma vez (teste de carga da
 * fila). Instrumentação de laboratório, não existiria em produção.
 */
rotasLaboratorio.post("/teste/fila", async (req, res) => {
  const quantidade = Number(req.body?.quantidade ?? 200);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 5000) {
    throw new ErroApi(400, "CORPO_INVALIDO", "quantidade deve ser inteiro entre 1 e 5000.");
  }
  // Marca do lote: permite rodar o teste várias vezes sem que as chaves de
  // idempotência do lote anterior barrem os jobs novos.
  const lote = req.body?.lote ?? String(Date.now());

  const ids = await comTransacao(async (cliente) => {
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
  res.status(202).json({ ok: true, lote, enfileirados: ids.length, duplicadosIgnorados: quantidade - ids.length });
});

/**
 * Auxiliar de teste: apaga os pedidos e recoloca o estoque no valor informado.
 * Permite rodar o teste de carga várias vezes do zero. Não existiria numa API
 * de produção.
 */
rotasLaboratorio.post("/teste/reiniciar", async (req, res) => {
  const estoque = Number(req.body?.estoque ?? 10);
  if (!Number.isInteger(estoque) || estoque < 0) {
    throw new ErroApi(400, "CORPO_INVALIDO", "estoque deve ser inteiro >= 0.");
  }
  await comTransacao(async (cliente) => {
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
  res.json({ ok: true, estoque });
});
