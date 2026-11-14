// ============================================================================
// Regras de cadastro e login (HU01) — docs/api.md, seções 1 e 4.
// ============================================================================

import bcrypt from "bcryptjs";
import { ErroApi } from "../middlewares/erros.js";
import { gerarToken } from "../middlewares/autenticacao.js";
import { paraUsuario } from "../utils/mapeadores/usuario.js";
import { invalido } from "../utils/validacao.js";
import * as usuariosRepository from "../repositories/usuarios.repository.js";
import * as regioesRepository from "../repositories/regioes.repository.js";

const CUSTO_BCRYPT = 10;

// Perfis que podem se autocadastrar. "administrador" nunca: é a equipe do Origem.
const PERFIS_CADASTRO = ["comprador", "artesao"];

// Hash de uma senha qualquer, usado quando o e-mail do login não existe: assim
// a resposta demora o mesmo tanto com e sem conta, e o tempo de resposta não
// revela quais e-mails estão cadastrados.
const HASH_FICTICIO = bcrypt.hashSync("senha-que-nao-existe", CUSTO_BCRYPT);

function emailEmUso() {
  return new ErroApi(409, "EMAIL_EM_USO", "Já existe uma conta com este e-mail.");
}

function sessao(usuario) {
  return { token: gerarToken(usuario), usuario: paraUsuario(usuario) };
}

export async function registrar({ nome, email, senha, perfil, regiao }) {
  if (!PERFIS_CADASTRO.includes(perfil)) throw invalido("O perfil precisa ser comprador ou artesao.");

  if (await usuariosRepository.emailExiste(email)) throw emailEmUso();

  // artesao.regiao_id é obrigatório no banco: sem região não dá para criar o artesão.
  let regiaoId = null;
  if (perfil === "artesao") {
    const encontrada = await regioesRepository.buscarPorNome(regiao);
    if (!encontrada) throw invalido(`Região "${regiao}" não existe. Use uma das regiões de GET /filtros.`);
    regiaoId = encontrada.id;
  }

  const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);
  try {
    return sessao(await usuariosRepository.criar({ nome, email, senhaHash, perfil, regiaoId }));
  } catch (erro) {
    // Dois cadastros simultâneos com o mesmo e-mail passam juntos pela checagem
    // acima; o UNIQUE do banco barra o segundo (P2002 no Prisma) e ele vira 409.
    if (erro?.code === "P2002") throw emailEmUso();
    throw erro;
  }
}

export async function login({ email, senha }) {
  const usuario = await usuariosRepository.buscarPorEmailComSenha(email);
  const senhaConfere = await bcrypt.compare(senha, usuario?.senha_hash ?? HASH_FICTICIO);

  // Mesma resposta para "e-mail não existe" e "senha errada": não revela quem tem conta.
  if (!usuario || !senhaConfere) {
    throw new ErroApi(401, "CREDENCIAIS_INVALIDAS", "E-mail ou senha inválidos.");
  }
  return sessao(usuario);
}
