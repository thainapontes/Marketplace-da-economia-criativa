-- 11_carga_pedidos.sql
-- Carga SINTETICA de compradores e pedidos para medir item_pedido.pedido_id.
-- Roda DEPOIS do 10_carga_benchmark.sql (precisa dos produtos de carga).
-- Fica em bd-u2/ de proposito: o Docker nao executa subpastas.
-- Sem acentos nos textos (o PowerShell corrompe acento ao passar pelo pipe).

-- 1) 5000 compradores sinteticos (perfil 'comprador', e-mail unico e falso).
INSERT INTO usuario (nome, email, senha_hash, perfil)
SELECT 'Comprador de carga ' || i,
       'comprador' || i || '@carga.origem.invalid',
       'hash-falso-nao-e-senha',
       'comprador'::perfil_usuario
FROM generate_series(1, 5000) AS i;

-- 2) 50000 pedidos, espalhados entre os compradores e entre os 6 status.
-- valor_total nasce 0 e e ajustado depois, quando os itens existirem.
WITH comp AS (
  SELECT id, row_number() OVER (ORDER BY id) - 1 AS pos
  FROM usuario
  WHERE email LIKE 'comprador%@carga.origem.invalid'
)
INSERT INTO pedido (comprador_id, status, endereco_entrega, valor_total)
SELECT comp.id,
       (ARRAY['pendente','confirmado','em_producao','enviado','entregue','cancelado'])[(n % 6) + 1]::status_pedido,
       'Rua de carga ' || n,
       0
FROM generate_series(1, 50000) AS n
JOIN comp ON comp.pos = n % 5000;

-- 3) 3 itens por pedido de carga (150000 itens), apontando para produtos de carga.
-- artesao_id do item = artesao dono do produto (mesma regra do site).
-- subtotal = quantidade * preco_unitario. Quantidade varia de 1 a 3.
WITH ped AS (
  SELECT id, row_number() OVER (ORDER BY id) - 1 AS pos
  FROM pedido
  WHERE endereco_entrega LIKE 'Rua de carga %'
),
prod AS (
  SELECT p.id, p.artesao_id, p.preco,
         row_number() OVER (ORDER BY p.id) - 1 AS pos
  FROM produto p
  JOIN usuario u ON u.id = p.artesao_id
  WHERE u.email LIKE 'artesao%@carga.origem.invalid'
)
INSERT INTO item_pedido (pedido_id, produto_id, artesao_id, quantidade, preco_unitario, subtotal)
SELECT ped.id,
       prod.id,
       prod.artesao_id,
       (k % 3) + 1,
       prod.preco,
       ((k % 3) + 1) * prod.preco
FROM ped
CROSS JOIN generate_series(0, 2) AS k
JOIN prod ON prod.pos = (ped.pos * 3 + k) % 100000;

-- 4) valor_total de cada pedido de carga = soma dos subtotais dos itens.
UPDATE pedido p
   SET valor_total = s.total
  FROM (SELECT pedido_id, sum(subtotal) AS total
          FROM item_pedido
         GROUP BY pedido_id) s
 WHERE s.pedido_id = p.id
   AND p.endereco_entrega LIKE 'Rua de carga %';