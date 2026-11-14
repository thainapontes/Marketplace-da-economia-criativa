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
import * as filtrosRepository from "../repositories/filtros.repository.js";
import * as regioesRepository from "../repositories/regioes.repository.js";
import { invalido } from "../utils/validacao.js";

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
  const publico = produtosRepository.ehPublico(produto);
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

// ---------------------------------------------------------------------------
// Painel do artesão (HU12): criar, editar e desativar os próprios produtos.
// ---------------------------------------------------------------------------

/** Troca os nomes (categoria, técnica, região) pelos ids do banco; nome desconhecido → 400. */
async function comIds(dados) {
  const [categoria, tecnica, regiao] = await Promise.all([
    filtrosRepository.buscarCategoriaPorNome(dados.categoria),
    filtrosRepository.buscarTecnicaPorNome(dados.tecnica),
    regioesRepository.buscarPorNome(dados.regiao),
  ]);
  if (!categoria) throw invalido(`Categoria "${dados.categoria}" não existe. Use uma de GET /filtros.`);
  if (!tecnica) throw invalido(`Técnica "${dados.tecnica}" não existe. Use uma de GET /filtros.`);
  if (!regiao) throw invalido(`Região "${dados.regiao}" não existe. Use uma de GET /filtros.`);
  return { ...dados, categoriaId: categoria.id, tecnicaId: tecnica.id, regiaoId: regiao.id };
}

/** O artesão vem do login: o artesaoId do corpo é ignorado (ninguém publica em nome de outro). */
export async function criar(dados, usuario) {
  const produto = await produtosRepository.criar({ ...(await comIds(dados)), artesaoId: usuario.id });
  return paraProduto(produto);
}

/** Produto do próprio artesão, ou 404 (não existe) / 403 (é de outro artesão). */
async function doDono(id, usuario) {
  const produto = await produtosRepository.buscarPorId(id);
  if (!produto) throw new ErroApi(404, "NAO_ENCONTRADO", `Produto ${id} não encontrado.`);
  if (!ehDono(usuario, produto.artesao_id)) throw new ErroApi(403, "SEM_PERMISSAO", "Este produto é de outro artesão.");
  return produto;
}

export async function atualizar(id, dados, usuario) {
  await doDono(id, usuario);
  return paraProduto(await produtosRepository.atualizar(id, await comIds(dados)));
}

export async function desativar(id, usuario) {
  await doDono(id, usuario);
  await produtosRepository.desativar(id);
}

