-- 10_carga_benchmark.sql
-- Carga SINTÉTICA para o benchmark de índices da U2 (etapa BD.1).
-- NÃO fica em backend/sql/ de propósito: o Docker só roda arquivos dessa
-- pasta (sem subpastas), e estes dados de teste não podem aparecer na vitrine.
-- Todos os e-mails terminam em @carga.origem.invalid (nenhum dado de pessoa real).

-- 1) Artesãos sintéticos: 1000 usuários com perfil 'artesao'.
-- O e-mail é único (regra UNIQUE) e termina em @carga.origem.invalid.
INSERT INTO usuario (nome, email, senha_hash, perfil)
SELECT 'Artesão de carga ' || i,
       'artesao' || i || '@carga.origem.invalid',
       'hash-falso-nao-e-senha',
       'artesao'::perfil_usuario
FROM generate_series(1, 1000) AS i;

-- 2) Cada usuário vira artesão (aprovado = true, senão a vitrine esconde).
-- A região do artesão cicla entre 1 e 4.
INSERT INTO artesao (usuario_id, nome_atelie, regiao_id, aprovado)
SELECT id, 'Ateliê de carga ' || id, (id % 4) + 1, true
FROM usuario
WHERE email LIKE '%@carga.origem.invalid';

-- 3) Produtos sintéticos: 100000, distribuídos entre os 1000 artesãos de carga.
-- Técnica (12), região (4) e categoria (4) ciclam com divisão inteira, para
-- existirem as 192 combinações (conferido com SELECT DISTINCT = 192).
-- 5% dos produtos ficam 'inativo', para a vitrine ter algo a esconder.
WITH art AS (
  SELECT a.usuario_id,
         row_number() OVER (ORDER BY a.usuario_id) - 1 AS pos
  FROM artesao a
  JOIN usuario u ON u.id = a.usuario_id
  WHERE u.email LIKE '%@carga.origem.invalid'
)
INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id,
                     nome, descricao, preco, estoque, status)
SELECT art.usuario_id,
       ((n / 48) % 4) + 1,
       (n % 12) + 1,
       ((n / 12) % 4) + 1,
       'Peça de carga ' || n,
       'Produto sintético número ' || n || ' para o benchmark.',
       round((10 + (n * 37 % 49000) / 100.0)::numeric, 2),
       n % 50,
       CASE WHEN n % 20 = 0 THEN 'inativo'::status_produto
            ELSE 'ativo'::status_produto END
FROM generate_series(1, 100000) AS n
JOIN art ON art.pos = n % 1000;