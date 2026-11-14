// ============================================================================
// Linha do banco → objeto `Usuario` da API (frontend/src/types/usuario.ts).
//
// Único lugar que decide o que de um usuário sai pela API. `senha_hash`
// nunca entra aqui: mesmo que uma consulta o traga, ele não é copiado.
// ============================================================================

/** Colunas que as consultas devem selecionar para usar paraUsuario(). */
export const COLUNAS_USUARIO = "id, nome, email, perfil, avatar_url, criado_em";

export function paraUsuario(linha) {
  const usuario = {
    id: Number(linha.id), // BIGSERIAL chega como string no Node
    nome: linha.nome,
    email: linha.email,
    perfil: linha.perfil,
    criadoEm: linha.criado_em.toISOString(),
  };
  if (linha.avatar_url) usuario.avatarUrl = linha.avatar_url;
  // No banco, o artesão é identificado pelo id do usuário dono (artesao.usuario_id).
  if (linha.perfil === "artesao") usuario.artesaoId = usuario.id;
  return usuario;
}
