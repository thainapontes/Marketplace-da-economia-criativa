// ============================================================================
// Recomendações pela API (E.4) — docs/api.md, seção 7b.
//
// O frontend pede à API, e a API pede ao módulo de IA (ia-recomendacao/).
// Por que passar pela API, e não chamar a IA direto do navegador:
//   1. o usuário vem do LOGIN (token), e não de um cabeçalho X-Usuario-Id que
//      qualquer pessoa pode forjar no navegador;
//   2. os dados exibidos (preço, estoque, foto) vêm do banco nesta hora;
//   3. se a IA cair ou demorar mais de 2 s, a API responde mesmo assim, com os
//      mais vendidos (RF-08 / RNF-02), e diz isso no campo "fonte".
// ============================================================================

import { config } from "../config/env.js";
import { paraProduto } from "../utils/mapeadores/catalogo.js";
import * as produtosRepository from "../repositories/produtos.repository.js";
import * as recomendacoesRepository from "../repositories/recomendacoes.repository.js";
import { buscarVisivel } from "./produtos.service.js";

const MAX_POR_ARTESAO = 2; // RNF-06, a mesma regra do módulo de IA

/** Pergunta ao módulo de IA. Qualquer falha (rede, status, JSON, tempo) vira exceção. */
async function perguntarIa(caminho, usuario) {
  const cabecalhos = { "X-Origem-Chamador": "backend" }; // aparece assim no log de uso da IA
  if (usuario) cabecalhos["X-Usuario-Id"] = String(usuario.id); // quem a API autenticou
  const resposta = await fetch(`${config.recomendacaoUrl}${caminho}`, {
    headers: cabecalhos,
    signal: AbortSignal.timeout(config.recomendacaoTimeoutMs),
  });
  if (!resposta.ok) throw new Error(`módulo de IA respondeu ${resposta.status}`);
  const corpo = await resposta.json();
  if (!Array.isArray(corpo?.recomendacoes)) throw new Error("resposta do módulo de IA sem a lista de recomendações");
  return corpo.recomendacoes;
}

/**
 * Troca os ids da IA pelos produtos do banco, na ordem da IA. Fica de fora o
 * que não está mais na vitrine (a IA pode ter lido o retrato antigo) e o
 * próprio produto de referência.
 */
async function completarComBanco(itensIa, excluir) {
  const ids = itensIa.map((item) => Number(item.id)).filter(Number.isSafeInteger);
  const registros = await produtosRepository.buscarPorIds(ids);
  const porId = new Map(registros.map((r) => [Number(r.id), r]));
  return itensIa
    .filter((item) => !excluir.has(Number(item.id)))
    .map((item) => ({ item, registro: porId.get(Number(item.id)) }))
    .filter(({ registro }) => produtosRepository.ehPublico(registro))
    .map(({ item, registro }) => ({ ...paraProduto(registro), criterio: item.criterio, score: item.score }));
}

/** Reserva: os mais vendidos da vitrine, no máximo 2 por artesão. Empate: menor id. */
async function maisVendidos(excluir, limite) {
  const candidatos = (await recomendacoesRepository.publicosComVendas())
    .filter(({ registro }) => !excluir.has(Number(registro.id)))
    .sort((a, b) => b.vendas - a.vendas || Number(a.registro.id) - Number(b.registro.id));
  const maior = candidatos[0]?.vendas || 1;
  const porArtesao = new Map();
  const lista = [];
  for (const { registro, vendas } of candidatos) {
    if (lista.length === limite) break;
    const artesao = Number(registro.artesao_id);
    if ((porArtesao.get(artesao) ?? 0) >= MAX_POR_ARTESAO) continue;
    porArtesao.set(artesao, (porArtesao.get(artesao) ?? 0) + 1);
    lista.push({ ...paraProduto(registro), criterio: "popularidade", score: Math.round((vendas / maior) * 10000) / 10000 });
  }
  return lista;
}

async function iaOuPopularidade(caminho, usuario, excluir, limite) {
  try {
    const itens = await completarComBanco(await perguntarIa(caminho, usuario), excluir);
    return { fonte: "ia", recomendacoes: itens.slice(0, limite) };
  } catch (erro) {
    // Só o motivo curto: nada de stack trace no log a cada visita com a IA fora.
    console.warn(`[recomendacoes] módulo de IA indisponível (${erro.name}: ${erro.message}); usando popularidade.`);
    return { fonte: "popularidade", recomendacoes: await maisVendidos(excluir, limite) };
  }
}

/** Peças parecidas com o produto (página de detalhe). Produto escondido ou inexistente: 404. */
export async function porProduto(produtoId, usuario, limite) {
  await buscarVisivel(produtoId, usuario);
  const caminho = `/api/produtos/${produtoId}/recomendados?limite=${limite}`;
  return { produtoReferenciaId: produtoId, ...(await iaOuPopularidade(caminho, usuario, new Set([produtoId]), limite)) };
}

/** "Escolhidos para você": pelo histórico do comprador LOGADO (o id vem do token). */
export async function paraMim(usuario, limite) {
  const caminho = `/api/usuarios/${usuario.id}/recomendados?limite=${limite}`;
  return { usuarioId: Number(usuario.id), ...(await iaOuPopularidade(caminho, usuario, new Set(), limite)) };
}
