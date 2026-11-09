// ============================================================================
// Tratamento de erros da API — um formato só para todas as rotas:
//
//   { "erro": "CODIGO_EM_MAIUSCULAS", "mensagem": "Texto legível para a tela." }
//
// (docs/api.md, seção 2). As rotas não montam respostas de erro: elas lançam
// (ou deixam escapar) um erro, e o Express 5 o entrega ao tratadorDeErros
// abaixo — inclusive quando o erro acontece dentro de uma função async.
// ============================================================================

import { EstoqueInsuficiente, ProdutoInexistente } from "../pedido.js";

/**
 * Erro "esperado", com status HTTP e código do contrato.
 * Ex.: throw new ErroApi(403, "SEM_PERMISSAO", "Este produto é de outro artesão.");
 */
export class ErroApi extends Error {
  constructor(status, codigo, mensagem, extras = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.extras = extras;
  }
}

/** Rota inexistente → 404 em JSON (o padrão do Express seria uma página HTML). */
export function rotaNaoEncontrada(req, _res, next) {
  next(new ErroApi(404, "NAO_ENCONTRADO", `Rota ${req.method} ${req.path} não existe.`));
}

/**
 * Traduz qualquer erro em resposta HTTP.
 *
 * Os dois códigos do PostgreSQL tratados aqui vêm do FCCPD U1 e são parte da
 * evidência daquele trabalho:
 *
 *   23514 — check_violation: alguém tentou gravar estoque negativo e a
 *           constraint CHECK (estoque >= 0) barrou. Esperado no checkout
 *           ingênuo; no seguro, seria sinal de bug.
 *
 *   40P01 — deadlock_detected: o Postgres matou uma de duas transações que
 *           esperavam uma pela outra. No checkout seguro, a ordenação por
 *           produto_id existe justamente para isso nunca acontecer.
 */
// O Express reconhece um middleware de erro pelos 4 parâmetros: o `_next`
// precisa ficar na assinatura mesmo sem uso.
// eslint-disable-next-line no-unused-vars
export function tratadorDeErros(erro, _req, res, _next) {
  if (erro instanceof ErroApi) {
    return res.status(erro.status).json({ erro: erro.codigo, mensagem: erro.message, ...erro.extras });
  }

  // JSON malformado no corpo da requisição (gerado pelo express.json()).
  if (erro?.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "CORPO_INVALIDO", mensagem: "O corpo da requisição não é um JSON válido." });
  }

  if (erro instanceof EstoqueInsuficiente) {
    return res.status(409).json({ erro: "ESTOQUE_INSUFICIENTE", mensagem: erro.message, produtoId: erro.produtoId });
  }
  if (erro instanceof ProdutoInexistente) {
    return res.status(404).json({ erro: "PRODUTO_INEXISTENTE", mensagem: erro.message, produtoId: erro.produtoId });
  }

  if (erro?.code === "23514") {
    console.error("[ALERTA] constraint CHECK barrou estoque negativo:", erro.message);
    return res.status(500).json({
      erro: "VIOLACAO_CHECK_ESTOQUE",
      mensagem: "O banco impediu um estoque negativo (constraint CHECK).",
    });
  }
  if (erro?.code === "40P01") {
    console.error("[ALERTA] deadlock detectado pelo PostgreSQL:", erro.message);
    return res.status(409).json({
      erro: "DEADLOCK_DETECTADO",
      mensagem: "Transação abortada pelo banco por impasse de locks.",
    });
  }

  // Qualquer outra coisa é bug ou falha de infraestrutura: o detalhe vai para o
  // log do servidor, nunca para o cliente (pode conter SQL, caminhos, etc.).
  console.error("[ERRO INESPERADO]", erro);
  return res.status(500).json({ erro: "ERRO_INTERNO", mensagem: "Erro interno no servidor." });
}
