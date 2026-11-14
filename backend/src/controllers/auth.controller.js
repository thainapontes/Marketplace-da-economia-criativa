// ============================================================================
// Controller de autenticação: lê e valida a requisição, chama o service e
// monta a resposta HTTP. As regras ficam em services/auth.service.js.
// ============================================================================

import * as authService from "../services/auth.service.js";
import { gravarCookieDeSessao } from "../middlewares/autenticacao.js";
import { paraUsuario } from "../utils/mapeadores/usuario.js";
import { exigirCorpo, texto, email as validarEmail, invalido } from "../utils/validacao.js";

/**
 * O bcrypt só considera os primeiros 72 BYTES da senha: além disso, duas
 * senhas diferentes com o mesmo começo valeriam a mesma coisa. Recusar é mais
 * honesto do que cortar em silêncio. (Acentos ocupam 2 bytes em UTF-8.)
 */
function validarSenha(valor) {
  if (typeof valor !== "string" || valor.length < 6) {
    throw invalido("A senha precisa ter pelo menos 6 caracteres.");
  }
  if (Buffer.byteLength(valor, "utf8") > 72) throw invalido("A senha pode ter no máximo 72 caracteres.");
  return valor; // senha não leva trim: espaço também é caractere
}

export async function registrar(req, res) {
  const corpo = exigirCorpo(req.body);
  const dados = {
    nome: texto(corpo.nome, "nome", { min: 2, max: 150 }),
    email: validarEmail(corpo.email),
    senha: validarSenha(corpo.senha),
    perfil: corpo.perfil,
    regiao: corpo.perfil === "artesao" ? texto(corpo.regiao, "regiao", { max: 100 }) : null,
  };
  const sessao = await authService.registrar(dados);
  gravarCookieDeSessao(res, sessao.token);
  res.status(201).json(sessao);
}

export async function login(req, res) {
  const corpo = exigirCorpo(req.body);
  if (typeof corpo.email !== "string" || typeof corpo.senha !== "string") {
    throw invalido("Informe e-mail e senha.");
  }
  // E-mails são salvos em minúsculas: "Maria@Origem.com.br" é a mesma conta.
  const sessao = await authService.login({ email: corpo.email.trim().toLowerCase(), senha: corpo.senha });
  // A sessão vai no cookie (o navegador guarda e envia sozinho) e também no
  // corpo, como token, para quem usa o cabeçalho Bearer (testes, curl, IA).
  gravarCookieDeSessao(res, sessao.token);
  res.json(sessao);
}

export function eu(req, res) {
  res.json(paraUsuario(req.usuario));
}
