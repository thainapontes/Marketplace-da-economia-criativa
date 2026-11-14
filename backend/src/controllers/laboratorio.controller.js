// ============================================================================
// Controller das rotas do laboratório do FCCPD U1: valida a entrada, chama o
// service e responde com os mesmos status da entrega da U1.
// ============================================================================

import * as laboratorioService from "../services/laboratorio.service.js";
import { ErroApi } from "../middlewares/erros.js";

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

export async function saude(_req, res) {
  try {
    res.json(await laboratorioService.saude());
  } catch (erro) {
    res.status(503).json({ ok: false, mensagem: String(erro?.message ?? erro) });
  }
}

export async function criarPedido(req, res) {
  exigirPedidoValido(req.body);
  res.status(201).json(await laboratorioService.criarPedido(req.body));
}

export async function criarPedidoSemProtecao(req, res) {
  exigirPedidoValido(req.body);
  res.status(201).json(await laboratorioService.criarPedidoSemProtecao(req.body));
}

/**
 * Registra uma imagem de produto e ENFILEIRA o processamento dela.
 * Não processa nada: responde 202 Accepted ("aceitei, o trabalho ainda não terminou").
 */
export async function registrarImagem(req, res) {
  const produtoId = Number(req.params.id);
  const chaveArmazenamento = req.body?.chaveArmazenamento;
  const contentType = req.body?.contentType ?? "image/jpeg";

  if (!Number.isInteger(produtoId)) {
    throw new ErroApi(400, "CORPO_INVALIDO", "id de produto inválido.");
  }
  if (typeof chaveArmazenamento !== "string" || chaveArmazenamento.trim() === "") {
    throw new ErroApi(400, "CORPO_INVALIDO", "chaveArmazenamento é obrigatório.");
  }
  res.status(202).json(await laboratorioService.registrarImagem({ produtoId, chaveArmazenamento, contentType }));
}

export async function resumoDaFila(_req, res) {
  res.json(await laboratorioService.resumoDaFila());
}

/**
 * Auxiliar de teste: enfileira `quantidade` jobs de uma vez (teste de carga da
 * fila). Instrumentação de laboratório, não existiria em produção.
 */
export async function enfileirarLoteDeTeste(req, res) {
  const quantidade = Number(req.body?.quantidade ?? 200);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 5000) {
    throw new ErroApi(400, "CORPO_INVALIDO", "quantidade deve ser inteiro entre 1 e 5000.");
  }
  // Marca do lote: permite rodar o teste várias vezes sem que as chaves de
  // idempotência do lote anterior barrem os jobs novos.
  const lote = req.body?.lote ?? String(Date.now());
  res.status(202).json(await laboratorioService.enfileirarLoteDeTeste({ quantidade, lote }));
}

/**
 * Auxiliar de teste: apaga os pedidos e recoloca o estoque no valor informado.
 * Permite rodar o teste de carga várias vezes do zero. Não existiria numa API
 * de produção.
 */
export async function reiniciar(req, res) {
  const estoque = Number(req.body?.estoque ?? 10);
  if (!Number.isInteger(estoque) || estoque < 0) {
    throw new ErroApi(400, "CORPO_INVALIDO", "estoque deve ser inteiro >= 0.");
  }
  res.json(await laboratorioService.reiniciar(estoque));
}
