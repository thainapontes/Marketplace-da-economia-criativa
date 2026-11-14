// ============================================================================
// Acesso ao banco: usuários (tabelas usuario e artesao), via Prisma.
// ============================================================================

import { prisma } from "../config/prisma.js";

/** Campos que saem do banco para montar um `Usuario` (nunca a senha). */
const CAMPOS_USUARIO = { id: true, nome: true, email: true, perfil: true, avatar_url: true, criado_em: true };

export function buscarPorId(id) {
  return prisma.usuario.findUnique({ where: { id: BigInt(id) }, select: CAMPOS_USUARIO });
}

/** Para o login: o único lugar que lê o hash da senha. */
export function buscarPorEmailComSenha(email) {
  return prisma.usuario.findUnique({ where: { email }, select: { ...CAMPOS_USUARIO, senha_hash: true } });
}

export async function emailExiste(email) {
  return (await prisma.usuario.count({ where: { email } })) > 0;
}

/**
 * Cria o usuário e, se for artesão, o registro de artesão no MESMO comando.
 * O Prisma grava os dois numa transação: nunca existe usuário "artesao" sem a
 * linha em `artesao`. O artesão nasce não aprovado.
 */
export function criar({ nome, email, senhaHash, perfil, regiaoId }) {
  return prisma.usuario.create({
    data: {
      nome,
      email,
      senha_hash: senhaHash,
      perfil,
      ...(perfil === "artesao" && {
        artesao: { create: { nome_atelie: nome, regiao_id: regiaoId, aprovado: false } },
      }),
    },
    select: CAMPOS_USUARIO,
  });
}
