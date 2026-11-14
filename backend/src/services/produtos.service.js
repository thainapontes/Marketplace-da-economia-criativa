// ============================================================================
// Regras do catálogo de produtos (HU03 a HU06) — docs/api.md, seção 5.
//
// Visibilidade: o público só vê produto ATIVO de artesão APROVADO. O dono
// (artesão logado) e o admin veem também o resto — é o que o painel do
// artesão precisa. Para os outros, um item escondido responde 404, como se
// não existisse.
// ============================================================================

import { ErroApi } from "../middlewares/erros.js";
import { paraProduto, paraAvaliacao } from "../utils/mapeadores/catalogo.js";
import * as produtosRepository from "../repositories/produtos.repository.js";
import * as avaliacoesRepository from "../repositories/avaliacoes.repository.js";

export const ehAdmin = (usuario) => usuario?.perfil === "administrador";
export const ehDono = (usuario, artesaoId) => usuario?.perfil === "artesao" && Number(usuario.id) === Number(artesaoId);

export async function listar(filtros, usuario) {
  // O artesão logado, filtrando pelos próprios produtos, vê também os inativos
  // (painel do artesão). Em qualquer outro caso, só a vitrine pública.
  const somentePublicos = !(filtros.artesaoId && ehDono(usuario, filtros.artesaoId));
  const produtos = await produtosRepository.listar({ ...filtros, somentePublicos });
  return produtos.map(paraProduto);
}

/** Produto que o usuário pode ver, ou 404. */
async function buscarVisivel(id, usuario) {
  const produto = await produtosRepository.buscarPorId(id);
  const publico = produto?.status === "ativo" && produto.artesao.aprovado;
  if (!produto || (!publico && !ehAdmin(usuario) && !ehDono(usuario, produto.artesao_id))) {
    throw new ErroApi(404, "NAO_ENCONTRADO", `Produto ${id} não encontrado.`);
  }
  return produto;
}

export async function buscarPorId(id, usuario) {
  return paraProduto(await buscarVisivel(id, usuario));
}

export async function listarAvaliacoes(produtoId, usuario) {
  await buscarVisivel(produtoId, usuario);
  return (await avaliacoesRepository.listarPorProduto(produtoId)).map(paraAvaliacao);
}
