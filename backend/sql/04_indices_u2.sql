-- 04_indices_u2.sql
-- Etapa BD.2 (U2): índices e desempenho. Arquivo ADITIVO: não altera
-- 01_schema.sql, 01b_extensoes_u2.sql, 02_seed.sql nem 03_fila.sql.

-- f_unaccent: "embrulho" IMMUTABLE do unaccent().
-- Por quê: o unaccent() é STABLE, e o Postgres só aceita funções IMMUTABLE
-- em índices (erro: "functions in index expression must be marked IMMUTABLE").
-- Aqui afirmamos que o dicionário public.unaccent não muda, o que vale na prática.
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- idx_produto_nome_sem_acento: índice trigram sobre o nome do produto SEM acento.
-- Por quê: a busca por texto do site compara o termo digitado com o nome do
-- produto ignorando acento e maiúscula (ILIKE). O índice antigo
-- (idx_produto_nome_trgm) guarda o nome COM acento, então não serve para
-- "croche" achar "Croche". Este guarda f_unaccent(nome), e a consulta
-- reescrita passa a usar f_unaccent(nome) ILIKE f_unaccent('%termo%').
-- Observação: o trigram só ajuda com termos de 3 letras ou mais.
CREATE INDEX idx_produto_nome_sem_acento
    ON produto USING gin (f_unaccent(nome) gin_trgm_ops);