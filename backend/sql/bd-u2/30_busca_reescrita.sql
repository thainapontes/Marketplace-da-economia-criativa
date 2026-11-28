-- 30_busca_reescrita.sql
-- PROPOSTA para o Everton: nova versao de idsDaBusca
-- (backend/src/repositories/produtos.repository.js).
-- Ela NAO e aplicada aqui: o src e do dono do backend.
--
-- Problema da versao atual: unaccent(p.nome || ' ' || u.nome || ' ' || t.nome)
-- monta um texto novo de CADA produto (juntando 3 tabelas), e nenhum indice
-- atende isso: sempre Seq Scan.
--
-- Solucao: buscar o termo em cada lugar separadamente e unir os ids (UNION).
-- IMPORTANTE: usar f_unaccent (criada em 04_indices_u2.sql), e nao unaccent.
-- Com unaccent o indice idx_produto_nome_sem_acento nao e usado.
--
-- Diferenca de comportamento (para o relatorio): um termo que atravessa os
-- textos colados (fim do nome do produto + comeco do nome do artesao) deixa
-- de casar. Medido: para os termos "bordado" e "peca de carga 4321" os
-- resultados das duas versoes foram iguais (0 diferencas).
--
-- $1 = termo ja escapado e com % ao redor, como o escaparLike do repository faz.
SELECT p.id
  FROM produto p
 WHERE f_unaccent(p.nome) ILIKE f_unaccent($1)
UNION
SELECT p.id
  FROM produto p
  JOIN usuario u ON u.id = p.artesao_id
 WHERE f_unaccent(u.nome) ILIKE f_unaccent($1)
UNION
SELECT p.id
  FROM produto p
  JOIN tecnica t ON t.id = p.tecnica_id
 WHERE f_unaccent(t.nome) ILIKE f_unaccent($1);