// ============================================================================
// Regras da administração (HU14) — docs/api.md, seção 7.
//
//   indicadores()          → { totalUsuarios, produtosAtivos, totalPedidos, totalVendas }
//   listarPendentes()      → Artesao[] com aprovado = false
//   aprovar(id)            → Artesao aprovado; os produtos dele entram na vitrine
//   rejeitar(id)           → apaga o cadastro pendente (aprovado → 400)
// ============================================================================

import { ErroApi } from "../middlewares/erros.js";
import { invalido } from "../utils/validacao.js";
import * as adminRepository from "../repositories/admin.repository.js";
import * as artesoesRepository from "../repositories/artesoes.repository.js";
import * as artesoesService from "./artesoes.service.js";
import { esquecerVitrine } from "./produtos.service.js";

export function indicadores() {
  return adminRepository.indicadores();
}

export async function listarPendentes() {
  const pendentes = await artesoesRepository.listar({ aprovado: false });
  return Promise.all(pendentes.map(artesoesService.comEstatisticas));
}

async function artesaoOu404(id) {
  const registro = await artesoesRepository.buscarPorId(id);
  if (!registro) throw new ErroApi(404, "NAO_ENCONTRADO", `Artesão ${id} não encontrado.`);
  return registro;
}

/** Aprovar de novo quem já está aprovado não é erro: devolve o artesão como está. */
export async function aprovar(id) {
  const registro = await artesaoOu404(id);
  if (!registro.aprovado) {
    await adminRepository.aprovar(id);
    esquecerVitrine(); // os produtos dele passam a aparecer na vitrine
  }
  return artesoesService.comEstatisticas(await artesoesRepository.buscarPorId(id));
}

/**
 * Rejeitar = apagar o cadastro pendente. Artesão já aprovado → 400: ele tem
 * (ou pode ter) produtos vendidos, que os pedidos antigos precisam manter.
 */
export async function rejeitar(id) {
  const registro = await artesaoOu404(id);
  if (registro.aprovado) {
    throw invalido("Só um cadastro pendente pode ser rejeitado. Este artesão já foi aprovado.");
  }
  await adminRepository.rejeitar(id);
}
