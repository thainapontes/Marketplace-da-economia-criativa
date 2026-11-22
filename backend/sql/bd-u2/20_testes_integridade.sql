-- 20_testes_integridade.sql
-- Testes de integridade da U2: FK, CHECK e UNIQUE.
-- Cada teste tenta gravar um dado INVALIDO e confere que o banco recusa,
-- apontando a regra certa. Se o banco aceitar, o teste falha com erro.
-- Tudo roda dentro de uma transacao desfeita no final (nada fica gravado).
-- Sem acentos nos textos (o PowerShell corrompe acento ao passar pelo pipe).
BEGIN;

-- CHECK: preco nao pode ser negativo (produto_preco_check).
DO $$
DECLARE v_regra text;
BEGIN
  INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque)
  VALUES (2, 1, 1, 1, 'Teste preco negativo', -5, 1);
  RAISE EXCEPTION 'TESTE FALHOU: o banco aceitou preco negativo';
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_regra = CONSTRAINT_NAME;
  IF v_regra = 'produto_preco_check' THEN
    RAISE NOTICE 'OK   CHECK preco >= 0 (%)', v_regra;
  ELSE
    RAISE EXCEPTION 'TESTE FALHOU: regra inesperada %', v_regra;
  END IF;
END $$;

-- CHECK: estoque nao pode ser negativo (produto_estoque_check).
DO $$
DECLARE v_regra text;
BEGIN
  INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque)
  VALUES (2, 1, 1, 1, 'Teste estoque negativo', 10, -1);
  RAISE EXCEPTION 'TESTE FALHOU: o banco aceitou estoque negativo';
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_regra = CONSTRAINT_NAME;
  IF v_regra = 'produto_estoque_check' THEN
    RAISE NOTICE 'OK   CHECK estoque >= 0 (%)', v_regra;
  ELSE
    RAISE EXCEPTION 'TESTE FALHOU: regra inesperada %', v_regra;
  END IF;
END $$;

-- FK: produto precisa de um artesao que exista (produto_artesao_id_fkey).
DO $$
DECLARE v_regra text;
BEGIN
  INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque)
  VALUES (999999999, 1, 1, 1, 'Teste artesao inexistente', 10, 1);
  RAISE EXCEPTION 'TESTE FALHOU: o banco aceitou artesao inexistente';
EXCEPTION WHEN foreign_key_violation THEN
  GET STACKED DIAGNOSTICS v_regra = CONSTRAINT_NAME;
  IF v_regra = 'produto_artesao_id_fkey' THEN
    RAISE NOTICE 'OK   FK produto.artesao_id (%)', v_regra;
  ELSE
    RAISE EXCEPTION 'TESTE FALHOU: regra inesperada %', v_regra;
  END IF;
END $$;

-- UNIQUE: dois usuarios nao podem ter o mesmo e-mail (usuario_email_key).
DO $$
DECLARE v_regra text;
BEGIN
  INSERT INTO usuario (nome, email, senha_hash)
  SELECT 'Teste email repetido', email, 'hash-falso-nao-e-senha'
    FROM usuario ORDER BY id LIMIT 1;
  RAISE EXCEPTION 'TESTE FALHOU: o banco aceitou e-mail repetido';
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_regra = CONSTRAINT_NAME;
  IF v_regra = 'usuario_email_key' THEN
    RAISE NOTICE 'OK   UNIQUE usuario.email (%)', v_regra;
  ELSE
    RAISE EXCEPTION 'TESTE FALHOU: regra inesperada %', v_regra;
  END IF;
END $$;

ROLLBACK;