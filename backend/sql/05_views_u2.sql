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