// ============================================================================
// Autenticação (HU01) — docs/api.md, seção 4.
//
//   POST /auth/registrar  { nome, email, senha, perfil, regiao? } → 201 { token, usuario }
//   POST /auth/login      { email, senha }                        → 200 { token, usuario }
//   GET  /auth/eu         (logado)                                → 200 Usuario
// ============================================================================

import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool, comTransacao } from "../config/database.js";
import { ErroApi } from "../middlewares/erros.js";
import { autenticar, gerarToken } from "../middlewares/autenticacao.js";
import { COLUNAS_USUARIO, paraUsuario } from "../utils/mapeadores/usuario.js";
import { exigirCorpo, texto, email as validarEmail, invalido } from "../utils/validacao.js";

export const rotasAuth = Router();

const CUSTO_BCRYPT = 10;

// Perfis que podem se autocadastrar. "administrador" nunca: é a equipe do Origem.
const PERFIS_CADASTRO = ["comprador", "artesao"];

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

// Hash de uma senha qualquer, usado quando o e-mail do login não existe: assim
// a resposta demora o mesmo tanto com e sem conta, e o tempo de resposta não
// revela quais e-mails estão cadastrados.
const HASH_FICTICIO = bcrypt.hashSync("senha-que-nao-existe", CUSTO_BCRYPT);

function respostaDeSessao(linha) {
  return { token: gerarToken(linha), usuario: paraUsuario(linha) };
}

rotasAuth.post("/auth/registrar", async (req, res) => {
  const corpo = exigirCorpo(req.body);
  const nome = texto(corpo.nome, "nome", { min: 2, max: 150 });
  const emailNormalizado = validarEmail(corpo.email);
  const senha = validarSenha(corpo.senha);
  if (!PERFIS_CADASTRO.includes(corpo.perfil)) {
    throw invalido("O perfil precisa ser comprador ou artesao.");
  }
  const perfil = corpo.perfil;
  // artesao.regiao_id é obrigatório no banco: sem região não dá para criar o artesão.
  const nomeRegiao = perfil === "artesao" ? texto(corpo.regiao, "regiao", { max: 100 }) : null;

  const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);

  const linha = await comTransacao(async (cliente) => {
    const existente = await cliente.query("SELECT 1 FROM usuario WHERE lower(email) = $1", [emailNormalizado]);
    if (existente.rowCount > 0) throw emailEmUso();

    let regiaoId = null;
    if (perfil === "artesao") {
      const regiao = await cliente.query("SELECT id FROM regiao WHERE lower(nome) = lower($1) ORDER BY id LIMIT 1", [nomeRegiao]);
      if (regiao.rowCount === 0) throw invalido(`Região "${nomeRegiao}" não existe. Use uma das regiões de GET /filtros.`);
      regiaoId = regiao.rows[0].id;
    }

    const criado = await cliente.query(
      `INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4)
       RETURNING ${COLUNAS_USUARIO}`,
      [nome, emailNormalizado, senhaHash, perfil],
    );
    const usuario = criado.rows[0];

    if (perfil === "artesao") {
      // Mesma transação: nunca existe usuário "artesao" sem o registro de artesão.
      // Nasce não aprovado; só aparece na vitrine depois que o admin aprovar.
      await cliente.query(
        `INSERT INTO artesao (usuario_id, nome_atelie, regiao_id, aprovado) VALUES ($1, $2, $3, FALSE)`,
        [usuario.id, nome, regiaoId],
      );
    }
    return usuario;
  }).catch((erro) => {
    // Dois cadastros simultâneos com o mesmo e-mail passam juntos pela checagem
    // acima; o UNIQUE do banco barra o segundo (23505), e ele vira 409 também.
    if (erro?.code === "23505" && erro?.constraint === "usuario_email_key") throw emailEmUso();
    throw erro;
  });

  res.status(201).json(respostaDeSessao(linha));
});

function emailEmUso() {
  return new ErroApi(409, "EMAIL_EM_USO", "Já existe uma conta com este e-mail.");
}

rotasAuth.post("/auth/login", async (req, res) => {
  const corpo = exigirCorpo(req.body);
  if (typeof corpo.email !== "string" || typeof corpo.senha !== "string") {
    throw invalido("Informe e-mail e senha.");
  }

  const resultado = await pool.query(
    `SELECT ${COLUNAS_USUARIO}, senha_hash FROM usuario WHERE lower(email) = lower($1)`,
    [corpo.email.trim()],
  );
  const linha = resultado.rows[0];
  const senhaConfere = await bcrypt.compare(corpo.senha, linha?.senha_hash ?? HASH_FICTICIO);

  // Mesma resposta para "e-mail não existe" e "senha errada": não revela quem tem conta.
  if (!linha || !senhaConfere) {
    throw new ErroApi(401, "CREDENCIAIS_INVALIDAS", "E-mail ou senha inválidos.");
  }
  res.json(respostaDeSessao(linha));
});

rotasAuth.get("/auth/eu", autenticar, (req, res) => {
  res.json(paraUsuario(req.usuario));
});
