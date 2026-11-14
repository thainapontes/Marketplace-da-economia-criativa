// ============================================================================
// Regras do carrinho (HU08) — docs/api.md, seção 6.
//
// O carrinho do comprador logado fica no banco, para não se perder ao trocar
// de navegador ou de dispositivo. Visitante (sem login) continua com o carrinho
// no navegador e o envia com PUT /carrinho quando entra.
// ============================================================================

import { invalido } from "../utils/validacao.js";
import { paraProduto } from "../utils/mapeadores/catalogo.js";
import * as carrinhoRepository from "../repositories/carrinho.repository.js";
import * as produtosRepository from "../repositories/produtos.repository.js";

/** ItemCarrinho da API: { produto: Produto, quantidade }. */
const paraItem = (registro) => ({ produto: paraProduto(registro.produto), quantidade: registro.quantidade });

export async function listar(usuario) {
  return (await carrinhoRepository.listarItens(usuario.id)).map(paraItem);
}

/**
 * Substitui o carrinho inteiro. Só aceita produtos da vitrine (ativos, de
 * artesão aprovado). O preço guardado é o do banco, nunca o que o navegador
 * mandou. O estoque NÃO é reservado aqui: quem garante é o checkout.
 */
export async function substituir(usuario, itens) {
  const produtos = await produtosRepository.buscarPorIds(itens.map((item) => item.produtoId));
  const porId = new Map(produtos.map((produto) => [Number(produto.id), produto]));
  const paraGravar = itens.map((item) => {
    const produto = porId.get(item.produtoId);
    if (!produtosRepository.ehPublico(produto)) {
      throw invalido(`O produto ${item.produtoId} não está disponível para compra.`);
    }
    return { ...item, precoUnitario: produto.preco };
  });
  await carrinhoRepository.substituir(usuario.id, paraGravar);
  return listar(usuario);
}

export async function esvaziar(usuario) {
  await carrinhoRepository.esvaziar(usuario.id);
}

/**
 * Confere o estoque atual antes do checkout. Devolve os itens que não podem
 * ser atendidos como pedido (lista vazia = tudo certo). ProblemaEstoque:
 * { produtoId, nome, disponivel, solicitado }.
 */
export async function validar(itens) {
  const produtos = await produtosRepository.buscarPorIds(itens.map((item) => item.produtoId));
  const porId = new Map(produtos.map((produto) => [Number(produto.id), produto]));
  const problemas = [];
  for (const item of itens) {
    const produto = porId.get(item.produtoId);
    const disponivel = produtosRepository.ehPublico(produto) ? produto.estoque : 0;
    if (disponivel < item.quantidade) {
      problemas.push({
        produtoId: item.produtoId,
        nome: produto?.nome ?? `Produto ${item.produtoId}`,
        disponivel,
        solicitado: item.quantidade,
      });
    }
  }
  return problemas;
}
