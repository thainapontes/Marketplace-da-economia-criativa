// ============================================================================
// Autenticação por JWT e controle de acesso por perfil (docs/api.md, seção 1).
//
//   gerarToken(usuario)          → string assinada, válida por JWT_VALIDADE
//   autenticar                   → middleware: exige o token (cabeçalho Bearer ou
//                                  cookie de sessão) e preenche req.usuario
//   autenticarSeHouver           → middleware: req.usuario se houver token válido,
//                                  senão null (rotas públicas)
//   exigirPerfil("artesao", ...) → middleware: 403 se o perfil não estiver na lista
//
// Uso numa rota:
//   router.post("/produtos", autenticar, exigirPerfil("artesao"), async (req, res) => { ... })
// ============================================================================

import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { ErroApi } from "./erros.js";
import * as usuariosRepository from "../repositories/usuarios.repository.js";

// Fixar o algoritmo impede o ataque clássico de trocar o "alg" do token
// (por exemplo para "none") e fazê-lo passar sem assinatura válida.
const ALGORITMO = "HS256";

export function gerarToken(usuario) {
  return jwt.sign({ perfil: usuario.perfil }, config.jwtSegredo, {
    subject: String(usuario.id),
    expiresIn: config.jwtValidade,
    algorithm: ALGORITMO,
  });
}

/** Nome do cookie que guarda o token de sessão. */
export const COOKIE_SESSAO = "origem_sessao";

/**
 * Opções do cookie de sessão:
 *   httpOnly       o JavaScript da página não lê o cookie: um script malicioso
 *                  injetado na página não consegue roubar a sessão;
 *   sameSite lax   o navegador não envia o cookie em POST/PUT/DELETE vindos de
 *                  OUTRO site, o que bloqueia o ataque CSRF (um site qualquer
 *                  disparando uma compra em nome de quem está logado);
 *   secure         só por HTTPS (produção).
 */
export function opcoesDoCookie(seguro = config.cookieSeguro) {
  return { httpOnly: true, sameSite: "lax", secure: seguro, path: "/" };
}

/** Grava o token no cookie, vencendo junto com ele. */
export function gravarCookieDeSessao(res, token) {
  const { exp } = jwt.decode(token);
  res.cookie(COOKIE_SESSAO, token, { ...opcoesDoCookie(), expires: new Date(exp * 1000) });
}

export function apagarCookieDeSessao(res) {
  res.clearCookie(COOKIE_SESSAO, opcoesDoCookie());
}

function naoAutenticado(mensagem = "Faça login para continuar.") {
  return new ErroApi(401, "NAO_AUTENTICADO", mensagem);
}

/**
 * Exige um token válido e carrega o usuário do banco em req.usuario.
 *
 * Por que consultar o banco se o token já diz quem é? Porque o token vale por
 * horas: se nesse meio-tempo a conta for removida (ex.: cadastro de artesão
 * rejeitado pelo admin), o token antigo não pode continuar abrindo portas.
 * O perfil também vem do banco, não do token.
 */
export async function autenticar(req, _res, next) {
  req.usuario = await usuarioDoToken(tokenDaRequisicao(req));
  next();
}

/**
 * Para rotas PÚBLICAS que mostram algo a mais ao dono (ex.: o artesão vê os
 * próprios produtos inativos). Sem token, ou com token inválido/expirado, a
 * requisição segue como visitante (req.usuario = null) em vez de dar 401: uma
 * sessão vencida guardada no navegador não pode derrubar a vitrine.
 */
export async function autenticarSeHouver(req, _res, next) {
  req.usuario = null;
  const token = tokenDaRequisicao(req);
  if (token !== undefined) {
    try {
      req.usuario = await usuarioDoToken(token);
    } catch (erro) {
      if (!(erro instanceof ErroApi)) throw erro; // falha de banco não vira "visitante"
    }
  }
  next();
}

/**
 * De onde vem o token, nesta ordem:
 *   1. cabeçalho "Authorization: Bearer <token>" (testes, curl, módulo de IA);
 *   2. cookie de sessão (navegador).
 * Se o cabeçalho existir, ele manda, mesmo que esteja malformado (vira 401):
 * assim um cliente nunca é autenticado "por engano" pelo cookie de outra sessão.
 * undefined = a requisição não trouxe credencial nenhuma.
 */
function tokenDaRequisicao(req) {
  const cabecalho = req.headers.authorization;
  if (cabecalho !== undefined) {
    const [tipo, token] = cabecalho.split(" ");
    return tipo === "Bearer" && token ? token : null;
  }
  return req.cookies?.[COOKIE_SESSAO];
}

async function usuarioDoToken(token) {
  if (!token) throw naoAutenticado();

  let conteudo;
  try {
    conteudo = jwt.verify(token, config.jwtSegredo, { algorithms: [ALGORITMO] });
  } catch (erro) {
    throw naoAutenticado(
      erro.name === "TokenExpiredError" ? "Sua sessão expirou. Faça login de novo." : "Sessão inválida. Faça login de novo.",
    );
  }

  const id = Number(conteudo.sub);
  if (!Number.isSafeInteger(id)) throw naoAutenticado("Sessão inválida. Faça login de novo.");

  const usuario = await usuariosRepository.buscarPorId(id);
  if (!usuario) throw naoAutenticado("Esta conta não existe mais.");
  return usuario;
}

/** Deve vir DEPOIS de `autenticar` na lista de middlewares da rota. */
export function exigirPerfil(...perfis) {
  return (req, _res, next) => {
    if (!req.usuario) throw naoAutenticado();
    if (!perfis.includes(req.usuario.perfil)) {
      throw new ErroApi(403, "SEM_PERMISSAO", "Seu perfil não tem acesso a esta ação.");
    }
    next();
  };
}
