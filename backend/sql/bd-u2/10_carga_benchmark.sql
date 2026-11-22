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