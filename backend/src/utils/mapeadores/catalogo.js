// ============================================================================
// Linha do banco → objetos `Produto`, `Artesao` e `Avaliacao` da API
// (frontend/src/types/). Mapeamento campo a campo: docs/api.md, seção 9.
//
// Cada mapeador vem com o trecho de SQL que traz as colunas que ele espera,
// para que todas as rotas (catálogo, painel, pedidos...) montem o mesmo objeto.
// ============================================================================

const numero = (valor) => (valor === null || valor === undefined ? valor : Number(valor));

// ---------------------------------------------------------------------------
// Produto
// ---------------------------------------------------------------------------

/**
 * SELECT ... FROM produto p + JOINs. Quem usa acrescenta WHERE / ORDER BY.
 *
 * As imagens vêm agregadas numa lista já ordenada. Só entram as `disponivel`:
 * uma foto ainda na fila do FCCPD (`processando`) ou reprovada (`indisponivel`)
 * não aparece na vitrine.
 */
export const SELECT_PRODUTO = `
  SELECT p.id, p.nome, p.descricao, p.preco, p.preco_original, p.estoque, p.status,
         p.artesao_id, u.nome AS artesao_nome, a.aprovado AS artesao_aprovado,
         c.nome AS categoria, t.nome AS tecnica, r.nome AS regiao,
         COALESCE((
           SELECT array_agg(i.chave_armazenamento ORDER BY i.ordem, i.id)
             FROM produto_imagem i
            WHERE i.produto_id = p.id AND i.status = 'disponivel'
         ), '{}') AS imagens
    FROM produto p
    JOIN artesao   a ON a.usuario_id = p.artesao_id
    JOIN usuario   u ON u.id = p.artesao_id
    JOIN categoria c ON c.id = p.categoria_id
    JOIN tecnica   t ON t.id = p.tecnica_id
    JOIN regiao    r ON r.id = p.regiao_id`;

export function paraProduto(linha) {
  const produto = {
    id: Number(linha.id),
    nome: linha.nome,
    descricao: linha.descricao ?? "",
    preco: Number(linha.preco), // NUMERIC chega como string no Node
    imagem: linha.imagens[0] ?? "",
    imagens: linha.imagens,
    categoria: linha.categoria,
    tecnica: linha.tecnica,
    regiao: linha.regiao,
    artesao: linha.artesao_nome,
    artesaoId: Number(linha.artesao_id),
    estoque: linha.estoque,
    status: linha.status,
  };
  if (linha.preco_original !== null) produto.precoOriginal = Number(linha.preco_original);
  return produto;
}

// ---------------------------------------------------------------------------
// Artesão
// ---------------------------------------------------------------------------

/**
 * Os três números do perfil são calculados (docs/api.md, seção 3):
 *   avaliacaoMedia → média das notas dos produtos do artesão (0 sem avaliações)
 *   totalVendas    → pedidos não cancelados com pelo menos um item dele
 *   totalProdutos  → produtos ativos
 */
export const SELECT_ARTESAO = `
  SELECT a.usuario_id, u.nome, a.nome_atelie, a.descricao, a.foto_url, a.capa_url,
         a.ano_inicio, a.aprovado, a.criado_em,
         r.nome AS regiao, r.polo AS cidade,
         COALESCE((
           SELECT array_agg(t.nome ORDER BY t.id)
             FROM artesao_tecnica at JOIN tecnica t ON t.id = at.tecnica_id
            WHERE at.artesao_id = a.usuario_id
         ), '{}') AS tecnicas,
         (SELECT ROUND(AVG(av.nota)::numeric, 1)
            FROM avaliacao_produto av JOIN produto p ON p.id = av.produto_id
           WHERE p.artesao_id = a.usuario_id) AS avaliacao_media,
         (SELECT COUNT(DISTINCT ip.pedido_id)
            FROM item_pedido ip JOIN pedido pe ON pe.id = ip.pedido_id
           WHERE ip.artesao_id = a.usuario_id AND pe.status <> 'cancelado') AS total_vendas,
         (SELECT COUNT(*) FROM produto p
           WHERE p.artesao_id = a.usuario_id AND p.status = 'ativo') AS total_produtos
    FROM artesao a
    JOIN usuario u ON u.id = a.usuario_id
    JOIN regiao  r ON r.id = a.regiao_id`;

export function paraArtesao(linha) {
  const id = Number(linha.usuario_id);
  return {
    id,
    usuarioId: id,
    nome: linha.nome,
    nomeAtelie: linha.nome_atelie,
    cidade: linha.cidade,
    regiao: linha.regiao,
    biografia: linha.descricao ?? "",
    fotoUrl: linha.foto_url ?? "",
    capaUrl: linha.capa_url ?? "",
    tecnicas: linha.tecnicas,
    avaliacaoMedia: numero(linha.avaliacao_media) ?? 0,
    totalVendas: Number(linha.total_vendas),
    totalProdutos: Number(linha.total_produtos),
    // Cadastro novo ainda sem ano informado: usa o ano em que entrou na plataforma.
    desde: linha.ano_inicio ?? linha.criado_em.getUTCFullYear(),
    aprovado: linha.aprovado,
  };
}

// ---------------------------------------------------------------------------
// Avaliação
// ---------------------------------------------------------------------------

export const SELECT_AVALIACAO = `
  SELECT av.id, av.produto_id, u.nome AS usuario_nome, av.nota, av.comentario, av.criado_em
    FROM avaliacao_produto av
    JOIN usuario u ON u.id = av.usuario_id`;

export function paraAvaliacao(linha) {
  return {
    id: Number(linha.id),
    produtoId: Number(linha.produto_id),
    usuarioNome: linha.usuario_nome,
    nota: linha.nota,
    comentario: linha.comentario,
    criadoEm: linha.criado_em.toISOString(),
  };
}
