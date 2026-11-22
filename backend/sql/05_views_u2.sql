-- 05_views_u2.sql
-- Etapa BD.3 (U2): views. Arquivo ADITIVO: nao altera os arquivos originais.

-- vw_indicadores_artesao (CORRECAO).
-- A versao original tinha tres diferencas em relacao a API
-- (backend/src/repositories/artesoes.repository.js, funcao indicadores):
--   1) total_vendido somava pedidos CANCELADOS;
--   2) total_pedidos contava pedidos CANCELADOS;
--   3) pedidos_pendentes so contava 'pendente', mas desde a U2 todo pedido
--      nasce 'confirmado'. A API conta 'pendente' e 'confirmado'.
-- Mantemos o mesmo nome, as mesmas colunas e a mesma ordem, porque
-- CREATE OR REPLACE VIEW nao permite renomear nem reordenar colunas.
-- COALESCE(..., 0): artesao so com pedidos cancelados mostra 0, como a API.
CREATE OR REPLACE VIEW vw_indicadores_artesao AS
SELECT ip.artesao_id,
       COALESCE(sum(ip.subtotal) FILTER (WHERE p.status <> 'cancelado'), 0) AS total_vendido,
       count(DISTINCT p.id) FILTER (WHERE p.status <> 'cancelado') AS total_pedidos,
       count(DISTINCT p.id) FILTER (WHERE p.status IN ('pendente', 'confirmado')) AS pedidos_pendentes
  FROM item_pedido ip
  JOIN pedido p ON p.id = ip.pedido_id
 GROUP BY ip.artesao_id;

 -- vw_vitrine_produto (NOVA).
-- Consulta recorrente do site: produto publico (ativo, de artesao aprovado)
-- junto com o nome do artesao, da categoria, da tecnica, da regiao e a imagem
-- principal. Espelha INCLUDE_PRODUTO e ehPublico de
-- backend/src/repositories/produtos.repository.js.
-- Os ids de tecnica, regiao e categoria ficam na view para o filtro usar o
-- indice idx_produto_filtros.
-- imagem_principal: primeira foto 'disponivel' (ordem, depois id), como no site.
CREATE VIEW vw_vitrine_produto AS
SELECT p.id,
       p.nome,
       p.descricao,
       p.preco,
       p.preco_original,
       p.estoque,
       p.criado_em,
       p.artesao_id,
       u.nome AS artesao_nome,
       p.tecnica_id,
       t.nome AS tecnica,
       p.regiao_id,
       r.nome AS regiao,
       p.categoria_id,
       c.nome AS categoria,
       (SELECT pi.chave_armazenamento
          FROM produto_imagem pi
         WHERE pi.produto_id = p.id
           AND pi.status = 'disponivel'
         ORDER BY pi.ordem, pi.id
         LIMIT 1) AS imagem_principal
  FROM produto p
  JOIN artesao a   ON a.usuario_id = p.artesao_id
  JOIN usuario u   ON u.id = a.usuario_id
  JOIN tecnica t   ON t.id = p.tecnica_id
  JOIN regiao r    ON r.id = p.regiao_id
  JOIN categoria c ON c.id = p.categoria_id
 WHERE p.status = 'ativo'
   AND a.aprovado = true;