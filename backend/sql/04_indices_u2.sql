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