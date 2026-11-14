// ============================================================================
// Controller de produtos: lê a query/URL, chama o service, responde.
// ============================================================================

import * as produtosService from "../services/produtos.service.js";
import { idDaUrl, invalido, exigirCorpo, texto } from "../utils/validacao.js";

/** Valor de filtro da query string: ausente, vazio ou "Todas" = sem filtro. */
function filtro(valor, campo) {
  if (valor === undefined) return null;
  if (typeof valor !== "string") throw invalido(`Informe um único valor para ${campo}.`);
  const limpo = valor.trim();
  return limpo === "" || limpo === "Todas" ? null : limpo;
}

export async function listar(req, res) {
  const textoArtesao = filtro(req.query.artesaoId, "artesaoId");
  let artesaoId = null;
  if (textoArtesao !== null) {
    artesaoId = Number(textoArtesao);
    if (!Number.isSafeInteger(artesaoId) || artesaoId < 1) throw invalido("artesaoId precisa ser um número inteiro.");
  }
  const filtros = {
    busca: filtro(req.query.busca, "busca"),
    regiao: filtro(req.query.regiao, "regiao"),
    tecnica: filtro(req.query.tecnica, "tecnica"),
    categoria: filtro(req.query.categoria, "categoria"),
    artesaoId,
  };
  const { produtos, doCache } = await produtosService.listar(filtros, req.usuario);
  // Mostra na aba Network do navegador se a resposta veio da memória (HIT) ou do banco (MISS).
  res.set("X-Cache", doCache ? "HIT" : "MISS");
  res.json(produtos);
}

export async function buscarPorId(req, res) {
  res.json(await produtosService.buscarPorId(idDaUrl(req.params.id, "Produto"), req.usuario));
}

export async function listarAvaliacoes(req, res) {
  res.json(await produtosService.listarAvaliacoes(idDaUrl(req.params.id, "Produto"), req.usuario));
}

/**
 * Corpo de NovoProduto (frontend/src/types/produto.ts):
 * { nome, descricao, preco, estoque, categoria, tecnica, regiao, imagem, artesaoId? }
 * O artesaoId, se vier, é ignorado: o dono é quem está logado.
 */
function novoProduto(corpo) {
  exigirCorpo(corpo);
  const preco = corpo.preco;
  if (typeof preco !== "number" || !Number.isFinite(preco) || preco <= 0 || preco > 1_000_000) {
    throw invalido("O preço precisa ser um número maior que zero.");
  }
  if (Math.round(preco * 100) !== preco * 100) throw invalido("O preço aceita no máximo 2 casas decimais.");
  if (!Number.isInteger(corpo.estoque) || corpo.estoque < 0 || corpo.estoque > 100_000) {
    throw invalido("O estoque precisa ser um número inteiro, zero ou maior.");
  }
  const imagem = texto(corpo.imagem, "imagem", { max: 300 });
  if (!/^https?:\/\/\S+$/i.test(imagem)) throw invalido("A imagem precisa ser um endereço http(s).");
  return {
    nome: texto(corpo.nome, "nome", { min: 3, max: 150 }),
    descricao: typeof corpo.descricao === "string" ? corpo.descricao.trim().slice(0, 2000) : "",
    preco,
    estoque: corpo.estoque,
    categoria: texto(corpo.categoria, "categoria", { max: 100 }),
    tecnica: texto(corpo.tecnica, "tecnica", { max: 100 }),
    regiao: texto(corpo.regiao, "regiao", { max: 100 }),
    imagem,
  };
}

export async function criar(req, res) {
  res.status(201).json(await produtosService.criar(novoProduto(req.body), req.usuario));
}

export async function atualizar(req, res) {
  const id = idDaUrl(req.params.id, "Produto");
  res.json(await produtosService.atualizar(id, novoProduto(req.body), req.usuario));
}

export async function desativar(req, res) {
  await produtosService.desativar(idDaUrl(req.params.id, "Produto"), req.usuario);
  res.status(204).end();
}

