// ============================================================================
// Registro do banco (formato do Prisma) → objetos `Produto`, `Artesao` e
// `Avaliacao` da API (frontend/src/types/). Mapeamento campo a campo:
// docs/api.md, seção 9. Os `include` que trazem esses dados estão nos
// repositories de produtos, artesãos e avaliações.
// ============================================================================

// O Prisma devolve BIGINT como BigInt e NUMERIC como Decimal: na API viram number.
const numero = (valor) => (valor === null || valor === undefined ? valor : Number(valor));

export function paraProduto(registro) {
  const imagens = registro.produto_imagem.map((imagem) => imagem.chave_armazenamento);
  const produto = {
    id: Number(registro.id),
    nome: registro.nome,
    descricao: registro.descricao ?? "",
    preco: Number(registro.preco),
    imagem: imagens[0] ?? "",
    imagens,
    categoria: registro.categoria.nome,
    tecnica: registro.tecnica.nome,
    regiao: registro.regiao.nome,
    artesao: registro.artesao.usuario.nome,
    artesaoId: Number(registro.artesao_id),
    estoque: registro.estoque,
    status: registro.status,
  };
  if (registro.preco_original !== null) produto.precoOriginal = Number(registro.preco_original);
  return produto;
}

/**
 * `estatisticas` são os três números calculados do perfil (docs/api.md, seção 3):
 * média das notas dos produtos do artesão, pedidos não cancelados com item dele
 * e produtos ativos.
 */
export function paraArtesao(registro, estatisticas) {
  const id = Number(registro.usuario_id);
  return {
    id,
    usuarioId: id,
    nome: registro.usuario.nome,
    nomeAtelie: registro.nome_atelie,
    cidade: registro.regiao.polo,
    regiao: registro.regiao.nome,
    biografia: registro.descricao ?? "",
    fotoUrl: registro.foto_url ?? "",
    capaUrl: registro.capa_url ?? "",
    tecnicas: registro.artesao_tecnica.map((item) => item.tecnica.nome),
    avaliacaoMedia: numero(estatisticas.avaliacaoMedia) ?? 0,
    totalVendas: estatisticas.totalVendas,
    totalProdutos: estatisticas.totalProdutos,
    // Cadastro novo ainda sem ano informado: usa o ano em que entrou na plataforma.
    desde: registro.ano_inicio ?? registro.criado_em.getUTCFullYear(),
    aprovado: registro.aprovado,
  };
}

export function paraAvaliacao(registro) {
  return {
    id: Number(registro.id),
    produtoId: Number(registro.produto_id),
    usuarioNome: registro.usuario.nome,
    nota: registro.nota,
    comentario: registro.comentario,
    criadoEm: registro.criado_em.toISOString(),
  };
}
