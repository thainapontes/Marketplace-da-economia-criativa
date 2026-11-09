-- ============================================================================
-- Origem — dados sintéticos (seed)
--
-- A partir da U2 este seed é o MESMO catálogo que o frontend exibia na Fake
-- API (frontend/src/mocks/*.mock.ts), com os mesmos ids de produto. Assim a
-- troca da Fake API pelo backend real não muda nada do que aparece na tela, e
-- o módulo de IA (ia-recomendacao/dados/catalogo.json) continua falando dos
-- mesmos produtos.
--
-- Os testes do FCCPD U1 continuam funcionando: eles usam os produtos 1, 2 e 3
-- e o POST /teste/reiniciar recoloca o estoque (de TODOS os produtos) e apaga
-- os pedidos antes de cada rodada. Ou seja: rodar os testes do FCCPD apaga os
-- pedidos de exemplo abaixo. Para tê-los de volta: docker compose down -v.
--
-- Diferenças em relação aos mocks (inevitáveis com um banco normalizado):
--   * O id do artesão é o id do usuário dono (artesao.usuario_id, como no
--     DDL). Ex.: Maria era artesão 1 / usuário 2; agora é artesão 2.
--   * avaliacaoMedia, totalVendas e totalProdutos do artesão são CALCULADOS
--     pela API a partir de avaliacao_produto, item_pedido e produto — não
--     são mais números fixos.
--   * Os autores das avaliações e o cliente do pedido PE-4705 viraram
--     usuários compradores (ids 7 a 11), porque avaliação e pedido exigem
--     um usuário real.
--
-- Senha de TODAS as contas: origem123 (hash bcrypt, custo 10).
--
-- IDs inseridos explicitamente + setval() no fim de cada tabela: sem o
-- setval, o próximo INSERT sem id tentaria reutilizar o id 1 e falharia.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Usuários (mocks/usuarios.mock.ts + compradores das avaliações/pedidos)
-- ----------------------------------------------------------------------------
INSERT INTO usuario (id, nome, email, senha_hash, perfil, avatar_url, criado_em) VALUES
  (1,  'Camila Torres',          'comprador@origem.com.br',   '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'comprador',     'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&auto=format', '2025-02-10 12:00:00'),
  (2,  'Maria das Graças Silva', 'maria@origem.com.br',       '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'artesao',       'https://images.unsplash.com/photo-1641338215253-9e9c8cf48a5a?w=200&h=200&fit=crop&auto=format', '2024-11-03 12:00:00'),
  (3,  'João Ferreira Neto',     'joao@origem.com.br',        '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'artesao',       'https://images.unsplash.com/photo-1655138493602-49901f93d250?w=200&h=200&fit=crop&auto=format', '2024-12-15 12:00:00'),
  (4,  'Ana Luíza Rodrigues',    'ana@origem.com.br',         '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'artesao',       'https://images.unsplash.com/photo-1628006025173-7c5558fa97c1?w=200&h=200&fit=crop&auto=format', '2025-01-20 12:00:00'),
  (5,  'Sebastião Mendes',       'sebastiao@origem.com.br',   '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'artesao',       'https://images.unsplash.com/photo-1603219527847-24c87f552a77?w=200&h=200&fit=crop&auto=format', '2025-03-05 12:00:00'),
  (6,  'Admin Origem',           'admin@origem.com.br',       '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'administrador', NULL, '2024-10-01 12:00:00'),
  (7,  'Outro Cliente',          'outro.cliente@exemplo.com', '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'comprador',     NULL, '2025-06-01 12:00:00'),
  (8,  'Rafael Souza',           'rafael@exemplo.com',        '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'comprador',     NULL, '2025-06-10 12:00:00'),
  (9,  'Juliana Prado',          'juliana@exemplo.com',       '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'comprador',     NULL, '2025-06-12 12:00:00'),
  (10, 'Bruno Ferreira',         'bruno@exemplo.com',         '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'comprador',     NULL, '2025-06-15 12:00:00'),
  (11, 'Marcela Andrade',        'marcela@exemplo.com',       '$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu', 'comprador',     NULL, '2025-06-20 12:00:00');
SELECT setval('usuario_id_seq', (SELECT MAX(id) FROM usuario));

-- ----------------------------------------------------------------------------
-- Domínios: região (nome = mesorregião exibida no filtro, polo = cidade),
-- categoria e técnica
-- ----------------------------------------------------------------------------
INSERT INTO regiao (id, nome, polo) VALUES
  (1, 'Agreste',      'Caruaru'),
  (2, 'Zona da Mata', 'Olinda'),
  (3, 'RMR',          'Recife'),
  (4, 'Sertão',       'Petrolina');
SELECT setval('regiao_id_seq', (SELECT MAX(id) FROM regiao));

INSERT INTO categoria (id, nome) VALUES
  (1, 'Cerâmica'),
  (2, 'Madeira'),
  (3, 'Renda'),
  (4, 'Couro');
SELECT setval('categoria_id_seq', (SELECT MAX(id) FROM categoria));

-- 1 a 5 são técnicas de produto; 6 a 12 só aparecem no perfil dos artesãos.
INSERT INTO tecnica (id, nome) VALUES
  (1,  'Cerâmica'),
  (2,  'Barro Cozido'),
  (3,  'Entalhamento em Madeira'),
  (4,  'Renda Renascença'),
  (5,  'Couro Cru'),
  (6,  'Alto do Moura'),
  (7,  'Escultura'),
  (8,  'Pintura Natural'),
  (9,  'Bordado'),
  (10, 'Crochê'),
  (11, 'Curtição Natural'),
  (12, 'Gravação Manual');
SELECT setval('tecnica_id_seq', (SELECT MAX(id) FROM tecnica));

-- ----------------------------------------------------------------------------
-- Artesãos (mocks/artesoes.mock.ts) — id do artesão = id do usuário
-- ----------------------------------------------------------------------------
INSERT INTO artesao (usuario_id, nome_atelie, descricao, regiao_id, foto_url, capa_url, ano_inicio, aprovado) VALUES
  (2, 'Ateliê Alto do Moura',
      'Nascida no coração do Alto do Moura, Maria aprendeu a moldar o barro com as mãos de sua avó aos seis anos. Hoje, há mais de trinta anos de ofício, suas peças habitam museus e lares de todo o Brasil. Cada figura carrega a alma do sertão pernambucano.',
      1,
      'https://images.unsplash.com/photo-1641338215253-9e9c8cf48a5a?w=240&h=240&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1641338215253-9e9c8cf48a5a?w=1400&h=400&fit=crop&auto=format',
      1993, TRUE),
  (3, 'Marcenaria Olindense',
      'Mestre entalhador formado pela tradição olindense, João transforma madeira de lei em narrativas nordestinas. Seus oratórios e figuras de carnaval são reconhecidos como patrimônio cultural imaterial.',
      2,
      'https://images.unsplash.com/photo-1655138493602-49901f93d250?w=240&h=240&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1655138493602-49901f93d250?w=1400&h=400&fit=crop&auto=format',
      2001, TRUE),
  (4, 'Bilros da Renascença',
      'Bordadeira da tradição renascença, Ana Luíza preserva a Renda Renascença trazida pelos colonizadores portugueses e reinventada pelas mãos nordestinas. Cada peça leva em média três semanas para ser concluída.',
      3,
      'https://images.unsplash.com/photo-1628006025173-7c5558fa97c1?w=240&h=240&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1628006025173-7c5558fa97c1?w=1400&h=400&fit=crop&auto=format',
      2008, TRUE),
  (5, 'Couros do São Francisco',
      'Artesão do couro cru, Sebastião aprendeu o ofício com vaqueiros do sertão do São Francisco. Suas bolsas e cintos são trabalhados com técnicas de curtição natural e gravação manual, únicos no mercado.',
      4,
      'https://images.unsplash.com/photo-1603219527847-24c87f552a77?w=240&h=240&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1603219527847-24c87f552a77?w=1400&h=400&fit=crop&auto=format',
      1998, TRUE);

INSERT INTO artesao_tecnica (artesao_id, tecnica_id) VALUES
  (2, 1), (2, 2), (2, 6),
  (3, 3), (3, 7), (3, 8),
  (4, 4), (4, 9), (4, 10),
  (5, 5), (5, 11), (5, 12);

-- ----------------------------------------------------------------------------
-- Produtos (mocks/produtos.mock.ts) — mesmos ids 1 a 10
-- colunas: id, artesao_id, categoria_id, tecnica_id, regiao_id, nome, descricao, preco, preco_original, estoque
-- ----------------------------------------------------------------------------
INSERT INTO produto (id, artesao_id, categoria_id, tecnica_id, regiao_id, nome, descricao, preco, preco_original, estoque) VALUES
  (1,  2, 1, 1, 1, 'Cangaceiro de Barro — Lampião e Maria Bonita',
       'Dupla icônica do cangaço nordestino esculpida em barro cozido e pintada à mão com pigmentos naturais. Cada peça é única, com pequenas variações que atestam o trabalho artesanal. Acompanha certificado de autenticidade e embalagem de proteção.',
       285.00, 340.00, 3),
  (2,  3, 2, 3, 2, 'Oratório São Francisco em Cedro',
       'Oratório em cedro-rosa entalhado à mão com detalhes em dourado folha. Representa São Francisco de Assis cercado por pássaros do sertão. Peça de colecionador, técnica exclusiva da escola olindense.',
       620.00, NULL, 2),
  (3,  4, 3, 4, 3, 'Caminho de Mesa em Renda Renascença',
       'Caminho de mesa 40×150 cm em renda renascença branca com padrão floral pernambucano. Confeccionado em linha de algodão egípcio, técnica de bilro transmitida por quatro gerações da família Rodrigues.',
       380.00, NULL, 5),
  (4,  5, 4, 5, 4, 'Bolsa Sertaneja em Couro Cru',
       'Bolsa crossbody em couro cru curtido naturalmente com noz-de-galha. Gravação geométrica xilográfica inspirada nas cordéis do São Francisco. Forro em algodão cru, alça regulável, fecho magnético.',
       450.00, 520.00, 7),
  (5,  2, 1, 1, 1, 'Família de Bonecos do Alto do Moura',
       'Conjunto de cinco bonecos em barro representando família nordestina: pai, mãe, filho, filha e avó. Pintados à mão com cores vibrantes, base antiderrapante.',
       195.00, NULL, 6),
  (6,  3, 2, 3, 2, 'Escultura Cabra do Sertão em Madeira',
       'Cabra do sertão esculpida em umburana, madeira tradicional do Nordeste, com olhos de vidro importados. Peça de 35 cm, acabamento em cera natural.',
       340.00, NULL, 4),
  (7,  4, 3, 4, 3, 'Toalha de Altar em Renda de Bilro',
       'Toalha 90×90 cm bordada em renda de bilro com motivos florais, ideal para mesas de centro ou altares. Peça delicada, lavagem à mão recomendada.',
       260.00, NULL, 8),
  (8,  5, 4, 5, 4, 'Cinto de Vaqueiro em Couro Trançado',
       'Cinto artesanal em couro trançado com fivela em metal envelhecido, inspirado nos vaqueiros do São Francisco. Disponível sob encomenda em diferentes tamanhos.',
       165.00, NULL, 0),
  (9,  2, 1, 2, 1, 'Jarro Decorativo em Cerâmica Vidrada',
       'Jarro de 30 cm em cerâmica vidrada, queimado em forno a lenha tradicional do Alto do Moura. Acabamento fosco com detalhes em relevo.',
       210.00, NULL, 5),
  (10, 3, 2, 3, 2, 'Painel Entalhado Cordel do Sertão',
       'Painel em madeira de umburana com xilogravura entalhada retratando cenas de cordel. 60×40 cm, pronto para pendurar.',
       480.00, NULL, 3);
SELECT setval('produto_id_seq', (SELECT MAX(id) FROM produto));

-- Imagens: a URL vai em chave_armazenamento; ordem 0 = imagem principal.
INSERT INTO produto_imagem (produto_id, chave_armazenamento, content_type, ordem) VALUES
  (1,  'https://images.unsplash.com/photo-1641338215253-9e9c8cf48a5a?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (1,  'https://images.unsplash.com/photo-1786507244330-6ad954c96ef9?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1),
  (2,  'https://images.unsplash.com/photo-1655138493602-49901f93d250?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (2,  'https://images.unsplash.com/photo-1721508490084-1b1de5b230d4?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1),
  (3,  'https://images.unsplash.com/photo-1628006025173-7c5558fa97c1?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (3,  'https://images.unsplash.com/photo-1655149238677-9b5cb1a0afc6?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1),
  (4,  'https://images.unsplash.com/photo-1603219527847-24c87f552a77?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (4,  'https://images.unsplash.com/photo-1599694522028-65abc96dfd2f?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1),
  (5,  'https://images.unsplash.com/photo-1786507244330-6ad954c96ef9?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (5,  'https://images.unsplash.com/photo-1641338215253-9e9c8cf48a5a?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1),
  (6,  'https://images.unsplash.com/photo-1721508490084-1b1de5b230d4?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (6,  'https://images.unsplash.com/photo-1655138493602-49901f93d250?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1),
  (7,  'https://images.unsplash.com/photo-1655149238677-9b5cb1a0afc6?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (7,  'https://images.unsplash.com/photo-1628006025173-7c5558fa97c1?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1),
  (8,  'https://images.unsplash.com/photo-1599694522028-65abc96dfd2f?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (8,  'https://images.unsplash.com/photo-1603219527847-24c87f552a77?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1),
  (9,  'https://images.unsplash.com/photo-1786507244330-6ad954c96ef9?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (9,  'https://images.unsplash.com/photo-1641338215253-9e9c8cf48a5a?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1),
  (10, 'https://images.unsplash.com/photo-1721508490084-1b1de5b230d4?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 0),
  (10, 'https://images.unsplash.com/photo-1655138493602-49901f93d250?w=800&h=800&fit=crop&auto=format', 'image/jpeg', 1);

-- ----------------------------------------------------------------------------
-- Pedidos de exemplo (mocks/pedidos.mock.ts). Horários em UTC, como nos mocks.
-- ----------------------------------------------------------------------------
INSERT INTO pedido (id, codigo, comprador_id, status, endereco_entrega, valor_total, frete, previsao_entrega, criado_em) VALUES
  (1, 'PE-4821', 1, 'entregue',   'Rua das Flores, 120 — Boa Viagem, Recife/PE — CEP 51020-000', 735.00,  0.00, '2026-08-28', '2026-08-20 14:32:00'),
  (2, 'PE-4790', 1, 'enviado',    'Rua das Flores, 120 — Boa Viagem, Recife/PE — CEP 51020-000', 760.00,  0.00, '2026-08-18', '2026-08-10 09:15:00'),
  (3, 'PE-4705', 7, 'confirmado', 'Av. Agamenon Magalhães, 500 — Caruaru/PE — CEP 55010-000',   655.90, 35.90, '2026-08-05', '2026-07-28 18:40:00');
SELECT setval('pedido_id_seq', (SELECT MAX(id) FROM pedido));

INSERT INTO item_pedido (pedido_id, produto_id, artesao_id, quantidade, preco_unitario, subtotal) VALUES
  (1, 1, 2, 1, 285.00, 285.00),
  (1, 4, 5, 1, 450.00, 450.00),
  (2, 3, 4, 2, 380.00, 760.00),
  (3, 2, 3, 1, 620.00, 620.00);

INSERT INTO pagamento (pedido_id, metodo, status, valor, processado_em) VALUES
  (1, 'cartao', 'aprovado', 735.00, '2026-08-20 14:32:00'),
  (2, 'pix',    'aprovado', 760.00, '2026-08-10 09:15:00'),
  (3, 'boleto', 'aprovado', 655.90, '2026-07-28 18:40:00');

-- ----------------------------------------------------------------------------
-- Avaliações (mocks/avaliacoes.mock.ts)
-- ----------------------------------------------------------------------------
INSERT INTO avaliacao_produto (id, produto_id, usuario_id, nota, comentario, criado_em) VALUES
  (1, 1, 1,  5, 'Peça linda, chegou muito bem embalada e com certificado de autenticidade.', '2026-08-22 10:00:00'),
  (2, 1, 8,  4, 'Muito bonita, só achei o prazo de entrega um pouco longo.',                 '2026-08-15 14:20:00'),
  (3, 3, 9,  5, 'A renda é impecável, dá pra ver o cuidado artesanal em cada detalhe.',      '2026-08-10 09:30:00'),
  (4, 4, 10, 5, 'Couro de altíssima qualidade, uso todo dia e já recebi vários elogios.',    '2026-07-30 18:00:00'),
  (5, 2, 11, 4, 'Entalhe impressionante, ficou perfeito na sala.',                           '2026-07-25 11:15:00');
SELECT setval('avaliacao_produto_id_seq', (SELECT MAX(id) FROM avaliacao_produto));
