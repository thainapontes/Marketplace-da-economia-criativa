// ============================================================================
// Tudo que é COMUM às duas versões do checkout (segura e ingênua).
//
// A razão de este arquivo existir: manter checkout-seguro.js e
// checkout-ingenuo.js idênticos em tudo, EXCETO no trecho da baixa de estoque.
// Assim a diferença entre "tem race condition" e "não tem" fica isolada e
// visível, sem ruído de código repetido no meio.
// ============================================================================

import { enfileirar } from "./fila.repository.js";

/** Não havia estoque suficiente no momento da compra. Vira HTTP 409 Conflict. */
export class EstoqueInsuficiente extends Error {
  constructor(produtoId) {
    super(`Estoque insuficiente para o produto ${produtoId}.`);
    this.name = "EstoqueInsuficiente";
    this.produtoId = produtoId;
  }
}

/** O produto não existe ou está inativo. Vira HTTP 404 Not Found. */
export class ProdutoInexistente extends Error {
  constructor(produtoId) {
    super(`Produto ${produtoId} não encontrado ou inativo.`);
    this.name = "ProdutoInexistente";
    this.produtoId = produtoId;
  }
}

const SUBTOTAL_PARA_FRETE_GRATIS = 400;
const VALOR_FRETE = 35.9;

/** Mesma regra de frete do frontend (useCarrinho/checkout), para o total não "pular". */
export function calcularFrete(subtotal) {
  return subtotal >= SUBTOTAL_PARA_FRETE_GRATIS ? 0 : VALOR_FRETE;
}

/** Dinheiro em ponto flutuante acumula erro de arredondamento; fixamos em 2 casas. */
export function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

/**
 * Descobre POR QUE a baixa de estoque não afetou nenhuma linha.
 *
 * O UPDATE condicional afeta 0 linhas em dois casos diferentes: o produto não
 * existe/está inativo, ou existe mas não tem saldo. Para a API responder o
 * código HTTP correto (404 x 409), fazemos esta consulta extra — que só roda no
 * caminho de rejeição, nunca no caminho de sucesso, portanto não custa nada no
 * fluxo normal.
 */
export async function explicarFalhaDeEstoque(cliente, produtoId) {
  const existe = await cliente.query(
    `SELECT 1 FROM produto WHERE id = $1 AND status = 'ativo'`,
    [produtoId],
  );
  return existe.rowCount === 0
    ? new ProdutoInexistente(produtoId)
    : new EstoqueInsuficiente(produtoId);
}

/**
 * Grava o pedido, seus itens e o pagamento simulado.
 *
 * Roda DENTRO da transação já aberta (recebe o `cliente`, não o pool). Por isso
 * é seguro: se qualquer INSERT falhar, o ROLLBACK de quem abriu a transação
 * desfaz também a baixa de estoque feita antes.
 *
 * `itensConfirmados` são os itens cuja baixa de estoque JÁ foi aplicada com
 * sucesso — o preço usado é o que veio do banco naquele momento, não o que o
 * navegador do comprador mandou (o cliente nunca dita o preço).
 */
export async function gravarPedido(cliente, { compradorId, enderecoEntrega, metodoPagamento, itensConfirmados }) {
  const subtotal = arredondar(
    itensConfirmados.reduce((total, item) => total + item.precoUnitario * item.quantidade, 0),
  );
  const frete = calcularFrete(subtotal);
  const total = arredondar(subtotal + frete);

  // [U2 · etapa D] O pedido também grava o frete e a previsão de entrega (data
  // do pedido + 8 dias), na mesma transação. O código público ("PE-5001") vem
  // do DEFAULT da coluna.
  const pedido = await cliente.query(
    `INSERT INTO pedido (comprador_id, status, endereco_entrega, valor_total, frete, previsao_entrega)
     VALUES ($1, 'confirmado', $2, $3, $4, (now() + interval '8 days')::date)
     RETURNING id, codigo, criado_em`,
    [compradorId, enderecoEntrega, total, frete],
  );

  // BIGSERIAL (int8) chega no Node como string, para não perder precisão em
  // números gigantes. Convertemos para número aqui.
  const pedidoId = Number(pedido.rows[0].id);
  // Código público ("PE-5001"): é o que o comprador e o artesão veem nas telas.
  const codigo = pedido.rows[0].codigo;

  for (const item of itensConfirmados) {
    await cliente.query(
      `INSERT INTO item_pedido (pedido_id, produto_id, artesao_id, quantidade, preco_unitario, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        pedidoId,
        item.produtoId,
        item.artesaoId,
        item.quantidade,
        item.precoUnitario,
        arredondar(item.precoUnitario * item.quantidade),
      ],
    );
  }

  // Pagamento simulado (tabela `pagamento` do DDL): sempre aprovado nesta fase
  // do projeto — não existe integração com adquirente real.
  await cliente.query(
    `INSERT INTO pagamento (pedido_id, metodo, status, valor)
     VALUES ($1, $2, 'aprovado', $3)`,
    [pedidoId, metodoPagamento ?? "simulado", total],
  );

  // --------------------------------------------------------------------------
  // [FCCPD — Etapa 2] ENFILEIRAMENTO DAS NOTIFICAÇÕES
  //
  // Aqui o checkout NÃO notifica ninguém: ele só deposita bilhetes na fila e
  // segue para a resposta HTTP. Enviar e-mail/push é conversa com um serviço de
  // fora, que pode demorar segundos ou estar fora do ar — e o comprador não tem
  // nada a ver com isso. Pior: uma falha no envio, feita aqui dentro, derrubaria
  // a transação e cancelaria uma venda perfeitamente boa.
  //
  // Repare que passamos `cliente`, e não `pool`: o INSERT na fila entra na MESMA
  // transação do pedido (padrão TRANSACTIONAL OUTBOX). Consequência: ou o pedido
  // e os bilhetes existem juntos, ou nenhum dos dois existe. Não há janela para
  // um pedido confirmado sem notificação, nem notificação de pedido que sumiu.
  //
  // A chave de idempotência descreve o EFEITO ("o comprador do pedido 42 foi
  // avisado"), então nem um retentativa de requisição nem um retry do worker
  // conseguem gerar dois avisos.
  // --------------------------------------------------------------------------
  await enfileirar(cliente, {
    tipo: "notificar_pedido",
    chave: `notificar-comprador:${pedidoId}`,
    payload: {
      pedidoId,
      usuarioId: compradorId,
      papel: "comprador",
      mensagem: `Seu pedido ${codigo} foi confirmado. Total: R$ ${total.toFixed(2)}.`,
    },
  });

  // Uma notificação por artesã envolvida no pedido. `Set` remove repetições:
  // dois produtos da mesma artesã geram UM aviso, não dois.
  for (const artesaoId of new Set(itensConfirmados.map((item) => item.artesaoId))) {
    await enfileirar(cliente, {
      tipo: "notificar_pedido",
      chave: `notificar-artesao:${pedidoId}:${artesaoId}`,
      payload: {
        pedidoId,
        usuarioId: artesaoId,
        papel: "artesao",
        mensagem: `Você recebeu uma nova venda no pedido ${codigo}.`,
      },
    });
  }

  return {
    pedidoId,
    codigo,
    criadoEm: pedido.rows[0].criado_em,
    subtotal,
    frete,
    total,
    itens: itensConfirmados,
  };
}
