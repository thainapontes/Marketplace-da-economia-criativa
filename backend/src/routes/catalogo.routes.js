// ============================================================================
// Catálogo, só leitura (HU03 a HU07) — docs/api.md, seção 5.
//
//   GET /filtros                  → { regioes, categorias, tecnicas }
//   GET /produtos                 → Produto[]  (?busca=&regiao=&tecnica=&categoria=&artesaoId=)
//   GET /produtos/:id             → Produto
//   GET /produtos/:id/avaliacoes  → Avaliacao[] (mais recentes primeiro)
//   GET /artesoes                 → Artesao[]  (só aprovados)
//   GET /artesoes/:id             → Artesao
//
// Visibilidade: o público só vê produto ATIVO de artesão APROVADO, e só
// artesão aprovado. O dono (artesão logado) e o admin veem também o resto —
// é o que o painel do artesão precisa. Para os outros, um item escondido
// responde 404, como se não existisse.
// ============================================================================

import { Router } from "express";
import { pool } from "../config/database.js";
import { ErroApi } from "../middlewares/erros.js";
import { autenticarSeHouver } from "../middlewares/autenticacao.js";
import {
  SELECT_PRODUTO, paraProduto,
  SELECT_ARTESAO, paraArtesao,
  SELECT_AVALIACAO, paraAvaliacao,
} from "../utils/mapeadores/catalogo.js";
import { idDaUrl, invalido } from "../utils/validacao.js";

export const rotasCatalogo = Router();

const ehAdmin = (usuario) => usuario?.perfil === "administrador";
const ehDono = (usuario, artesaoId) => usuario?.perfil === "artesao" && Number(usuario.id) === artesaoId;

/** Valor de filtro da query string: ausente, vazio ou "Todas" = sem filtro. */
function filtro(valor, campo) {
  if (valor === undefined) return null;
  if (typeof valor !== "string") throw invalido(`Informe um único valor para ${campo}.`);
  const limpo = valor.trim();
  return limpo === "" || limpo === "Todas" ? null : limpo;
}

/** Escapa os curingas do LIKE: buscar "100%" procura o texto "100%", não "100" + qualquer coisa. */
const escaparLike = (texto) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

// ---------------------------------------------------------------------------

rotasCatalogo.get("/filtros", async (_req, res) => {
  const [regioes, categorias, tecnicas] = await Promise.all([
    // regiao é única por (nome, polo): o mesmo nome pode aparecer em dois polos.
    pool.query("SELECT nome FROM regiao GROUP BY nome ORDER BY MIN(id)"),
    pool.query("SELECT nome FROM categoria ORDER BY id"),
    pool.query("SELECT nome FROM tecnica ORDER BY id"),
  ]);
  const nomes = (r) => r.rows.map((linha) => linha.nome);
  res.json({ regioes: nomes(regioes), categorias: nomes(categorias), tecnicas: nomes(tecnicas) });
});

rotasCatalogo.get("/produtos", autenticarSeHouver, async (req, res) => {
  const busca = filtro(req.query.busca, "busca");
  const regiao = filtro(req.query.regiao, "regiao");
  const tecnica = filtro(req.query.tecnica, "tecnica");
  const categoria = filtro(req.query.categoria, "categoria");
  const textoArtesao = filtro(req.query.artesaoId, "artesaoId");

  let artesaoId = null;
  if (textoArtesao !== null) {
    artesaoId = Number(textoArtesao);
    if (!Number.isSafeInteger(artesaoId) || artesaoId < 1) throw invalido("artesaoId precisa ser um número inteiro.");
  }

  const condicoes = [];
  const valores = [];
  const parametro = (valor) => {
    valores.push(valor);
    return `$${valores.length}`;
  };

  // O artesão logado, filtrando pelos próprios produtos, vê também os inativos
  // (painel do artesão). Em qualquer outro caso, só a vitrine pública.
  if (!(artesaoId !== null && ehDono(req.usuario, artesaoId))) {
    condicoes.push("p.status = 'ativo'", "a.aprovado");
  }
  if (artesaoId !== null) condicoes.push(`p.artesao_id = ${parametro(artesaoId)}`);
  if (regiao) condicoes.push(`r.nome = ${parametro(regiao)}`);
  if (tecnica) condicoes.push(`t.nome = ${parametro(tecnica)}`);
  if (categoria) condicoes.push(`c.nome = ${parametro(categoria)}`);
  if (busca) {
    // Sem diferenciar maiúsculas nem acentos: "ceramica" acha "Cerâmica".
    const termo = parametro(`%${escaparLike(busca)}%`);
    condicoes.push(
      `unaccent(p.nome || ' ' || u.nome || ' ' || t.nome) ILIKE unaccent(${termo})`,
    );
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const resultado = await pool.query(`${SELECT_PRODUTO} ${where} ORDER BY p.id`, valores);
  res.json(resultado.rows.map(paraProduto));
});

/**
 * Busca um produto que o usuário pode ver, ou lança 404.
 * Produto inativo ou de artesão não aprovado só aparece para o dono e o admin.
 */
async function produtoVisivel(idTexto, usuario) {
  const id = idDaUrl(idTexto, "Produto");
  const resultado = await pool.query(`${SELECT_PRODUTO} WHERE p.id = $1`, [id]);
  const linha = resultado.rows[0];
  const naoEncontrado = new ErroApi(404, "NAO_ENCONTRADO", `Produto ${idTexto} não encontrado.`);
  if (!linha) throw naoEncontrado;

  const publico = linha.status === "ativo" && linha.artesao_aprovado;
  if (!publico && !ehAdmin(usuario) && !ehDono(usuario, Number(linha.artesao_id))) throw naoEncontrado;
  return linha;
}

// Mantém id, nome, preco, estoque e status: o teste de concorrência do FCCPD U1 lê o estoque por aqui.
rotasCatalogo.get("/produtos/:id", autenticarSeHouver, async (req, res) => {
  res.json(paraProduto(await produtoVisivel(req.params.id, req.usuario)));
});

rotasCatalogo.get("/produtos/:id/avaliacoes", autenticarSeHouver, async (req, res) => {
  const produto = await produtoVisivel(req.params.id, req.usuario);
  const resultado = await pool.query(
    `${SELECT_AVALIACAO} WHERE av.produto_id = $1 ORDER BY av.criado_em DESC, av.id DESC`,
    [produto.id],
  );
  res.json(resultado.rows.map(paraAvaliacao));
});

rotasCatalogo.get("/artesoes", async (_req, res) => {
  const resultado = await pool.query(`${SELECT_ARTESAO} WHERE a.aprovado ORDER BY a.usuario_id`);
  res.json(resultado.rows.map(paraArtesao));
});

rotasCatalogo.get("/artesoes/:id", autenticarSeHouver, async (req, res) => {
  const id = idDaUrl(req.params.id, "Artesão");
  const resultado = await pool.query(`${SELECT_ARTESAO} WHERE a.usuario_id = $1`, [id]);
  const linha = resultado.rows[0];
  // Cadastro pendente: só o próprio artesão e o admin enxergam.
  if (!linha || (!linha.aprovado && !ehAdmin(req.usuario) && !ehDono(req.usuario, id))) {
    throw new ErroApi(404, "NAO_ENCONTRADO", `Artesão ${req.params.id} não encontrado.`);
  }
  res.json(paraArtesao(linha));
});
