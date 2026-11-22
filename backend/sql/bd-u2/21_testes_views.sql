-- 21_testes_views.sql
-- Testes das views da U2. Cada teste imprime OK ou para com TESTE FALHOU.
-- Roda dentro de uma transacao desfeita no final (nada fica gravado).
-- Pressupoe o banco com 10_carga_benchmark.sql e 11_carga_pedidos.sql rodados.
-- Sem acentos nos textos (o PowerShell corrompe acento ao passar pelo pipe).
BEGIN;

-- vw_indicadores_artesao: bate com a regra da API (artesoes.repository.js,
-- funcao indicadores) para TODOS os artesaos que aparecem na view.
DO $$
DECLARE v_div bigint;
BEGIN
  SELECT count(*) INTO v_div
    FROM vw_indicadores_artesao v
   WHERE v.total_vendido IS DISTINCT FROM (SELECT COALESCE(sum(ip.subtotal),0) FROM item_pedido ip JOIN pedido p ON p.id = ip.pedido_id WHERE ip.artesao_id = v.artesao_id AND p.status <> 'cancelado')
      OR v.total_pedidos IS DISTINCT FROM (SELECT count(DISTINCT p.id) FROM item_pedido ip JOIN pedido p ON p.id = ip.pedido_id WHERE ip.artesao_id = v.artesao_id AND p.status <> 'cancelado')
      OR v.pedidos_pendentes IS DISTINCT FROM (SELECT count(DISTINCT p.id) FROM item_pedido ip JOIN pedido p ON p.id = ip.pedido_id WHERE ip.artesao_id = v.artesao_id AND p.status IN ('pendente','confirmado'));
  IF v_div <> 0 THEN
    RAISE EXCEPTION 'TESTE FALHOU: % artesaos divergem da regra da API', v_div;
  END IF;
  RAISE NOTICE 'OK   vw_indicadores_artesao bate com a regra da API';
END $$;

-- vw_indicadores_artesao: artesao so com pedido CANCELADO mostra zeros.
DO $$
DECLARE
  v_art bigint; v_comp bigint; v_prod bigint; v_ped bigint;
  v_vendido numeric; v_pedidos bigint; v_pend bigint;
BEGIN
  INSERT INTO usuario (nome, email, senha_hash, perfil)
  VALUES ('Teste artesao cancelado', 'teste-art-cancelado@carga.origem.invalid', 'hash-falso-nao-e-senha', 'artesao')
  RETURNING id INTO v_art;
  INSERT INTO artesao (usuario_id, nome_atelie, regiao_id, aprovado)
  VALUES (v_art, 'Atelie de teste', 1, true);
  INSERT INTO usuario (nome, email, senha_hash, perfil)
  VALUES ('Teste comprador', 'teste-comprador@carga.origem.invalid', 'hash-falso-nao-e-senha', 'comprador')
  RETURNING id INTO v_comp;
  INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, preco, estoque)
  VALUES (v_art, 1, 1, 1, 'Produto de teste', 10, 1)
  RETURNING id INTO v_prod;
  INSERT INTO pedido (comprador_id, status, endereco_entrega, valor_total)
  VALUES (v_comp, 'cancelado', 'Rua de teste', 20)
  RETURNING id INTO v_ped;
  INSERT INTO item_pedido (pedido_id, produto_id, artesao_id, quantidade, preco_unitario, subtotal)
  VALUES (v_ped, v_prod, v_art, 2, 10, 20);

  SELECT total_vendido, total_pedidos, pedidos_pendentes
    INTO v_vendido, v_pedidos, v_pend
    FROM vw_indicadores_artesao WHERE artesao_id = v_art;

  IF v_vendido IS DISTINCT FROM 0 OR v_pedidos IS DISTINCT FROM 0 OR v_pend IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TESTE FALHOU: so cancelado deveria dar 0/0/0, deu %/%/%', v_vendido, v_pedidos, v_pend;
  END IF;
  RAISE NOTICE 'OK   vw_indicadores_artesao: artesao so com cancelado mostra 0/0/0';
END $$;

-- vw_vitrine_produto: mesma contagem da consulta direta nas tabelas.
DO $$
DECLARE v_view bigint; v_direto bigint;
BEGIN
  SELECT count(*) INTO v_view FROM vw_vitrine_produto;
  SELECT count(*) INTO v_direto
    FROM produto p JOIN artesao a ON a.usuario_id = p.artesao_id
   WHERE p.status = 'ativo' AND a.aprovado = true;
  IF v_view <> v_direto THEN
    RAISE EXCEPTION 'TESTE FALHOU: view tem %, consulta direta tem %', v_view, v_direto;
  END IF;
  RAISE NOTICE 'OK   vw_vitrine_produto tem a mesma contagem da consulta direta (%)', v_view;
END $$;

-- vw_vitrine_produto: nenhum produto repetido.
DO $$
DECLARE v_rep bigint;
BEGIN
  SELECT count(*) - count(DISTINCT id) INTO v_rep FROM vw_vitrine_produto;
  IF v_rep <> 0 THEN
    RAISE EXCEPTION 'TESTE FALHOU: % linhas repetidas na vitrine', v_rep;
  END IF;
  RAISE NOTICE 'OK   vw_vitrine_produto sem produto repetido';
END $$;

-- vw_vitrine_produto: nenhum produto inativo e nenhum de artesao nao aprovado.
DO $$
DECLARE v_ruins bigint;
BEGIN
  SELECT count(*) INTO v_ruins
    FROM vw_vitrine_produto v
    JOIN produto p ON p.id = v.id
    JOIN artesao a ON a.usuario_id = p.artesao_id
   WHERE p.status <> 'ativo' OR a.aprovado = false;
  IF v_ruins <> 0 THEN
    RAISE EXCEPTION 'TESTE FALHOU: % produtos que nao deveriam estar na vitrine', v_ruins;
  END IF;
  RAISE NOTICE 'OK   vw_vitrine_produto so tem produto ativo de artesao aprovado';
END $$;

ROLLBACK;