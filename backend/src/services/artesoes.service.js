// ============================================================================
// Regras dos perfis de artesão (HU07) — docs/api.md, seções 3 e 5.
// ============================================================================

import { ErroApi } from "../middlewares/erros.js";
import { paraArtesao } from "../utils/mapeadores/catalogo.js";
import * as artesoesRepository from "../repositories/artesoes.repository.js";
import { ehAdmin, ehDono } from "./produtos.service.js";

/** Média com 1 casa decimal (4.5), como no perfil público. */
const umaCasa = (valor) => (valor === null ? null : Math.round(valor * 10) / 10);

/** Junta os números calculados (média, vendas, produtos ativos) ao registro. */
async function comEstatisticas(registro) {
  const [media, totalVendas] = await Promise.all([
    artesoesRepository.mediaDasAvaliacoes(registro.usuario_id),
    artesoesRepository.totalDeVendas(registro.usuario_id),
  ]);
  return paraArtesao(registro, {
    avaliacaoMedia: umaCasa(media),
    totalVendas,
    totalProdutos: registro._count.produto,
  });
}

/** Vitrine de artesãos: só os aprovados. */
export async function listar() {
  const artesoes = await artesoesRepository.listar({ somenteAprovados: true });
  return Promise.all(artesoes.map(comEstatisticas));
}

export async function buscarPorId(id, usuario) {
  const registro = await artesoesRepository.buscarPorId(id);
  // Cadastro pendente: só o próprio artesão e o admin enxergam.
  if (!registro || (!registro.aprovado && !ehAdmin(usuario) && !ehDono(usuario, id))) {
    throw new ErroApi(404, "NAO_ENCONTRADO", `Artesão ${id} não encontrado.`);
  }
  return comEstatisticas(registro);
}
