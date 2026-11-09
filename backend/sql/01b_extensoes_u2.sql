-- ============================================================================
-- Origem — extensões do schema para a Unidade 2 (backend real)
--
-- Migração ADITIVA: só ADD COLUMN / CREATE TABLE / CREATE INDEX. Nada do
-- 01_schema.sql (DDL da equipe + FCCPD U1) é alterado ou removido, então os
-- testes de concorrência, deadlock e fila continuam valendo como estão.
--
-- Por que "01b": o Postgres do docker-compose executa os .sql em ordem
-- alfabética. "01b_" vem depois de "01_schema" e antes de "02_seed", então o
-- seed já encontra as colunas novas.
--
-- O que motivou cada item: o frontend (Fake API da U1) exibe dados que o DDL
-- original não guardava. Ver docs/api.md, seção "Mapeamento banco ↔ API".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- usuário: foto de perfil (Usuario.avatarUrl)
-- ----------------------------------------------------------------------------
ALTER TABLE usuario ADD COLUMN avatar_url VARCHAR(300);

-- ----------------------------------------------------------------------------
-- artesão: dados do perfil público (HU07) e aprovação pelo admin (HU14)
--   nome       -> usuario.nome          (já existia)
--   biografia  -> artesao.descricao     (já existia)
--   cidade     -> regiao.polo           (já existia)
-- ----------------------------------------------------------------------------
ALTER TABLE artesao
    ADD COLUMN foto_url   VARCHAR(300),
    ADD COLUMN capa_url   VARCHAR(300),
    ADD COLUMN ano_inicio SMALLINT CHECK (ano_inicio BETWEEN 1900 AND 2100),
    -- Todo artesão novo entra como não aprovado e não aparece na vitrine
    -- até a administração revisar o cadastro.
    ADD COLUMN aprovado   BOOLEAN NOT NULL DEFAULT FALSE;

-- Técnicas que o artesão domina (Artesao.tecnicas[]). N:N para não repetir
-- texto: a técnica de cada produto continua em produto.tecnica_id.
CREATE TABLE artesao_tecnica (
    artesao_id BIGINT NOT NULL REFERENCES artesao(usuario_id) ON DELETE CASCADE,
    tecnica_id INT    NOT NULL REFERENCES tecnica(id),
    PRIMARY KEY (artesao_id, tecnica_id)
);

-- ----------------------------------------------------------------------------
-- produto: preço "de" exibido riscado na vitrine (Produto.precoOriginal)
-- ----------------------------------------------------------------------------
ALTER TABLE produto
    ADD COLUMN preco_original NUMERIC(10,2) CHECK (preco_original IS NULL OR preco_original >= preco);

-- ----------------------------------------------------------------------------
-- pedido: código público, frete e previsão de entrega (Pedido)
--   subtotal NÃO vira coluna: é sempre valor_total - frete (evita redundância).
--   Todas têm DEFAULT ou aceitam NULL, para que o INSERT do checkout da
--   U1 (src/pedido.js, só 4 colunas) continue funcionando sem mudança.
-- ----------------------------------------------------------------------------
CREATE SEQUENCE pedido_codigo_seq START 5000;

ALTER TABLE pedido
    ADD COLUMN codigo           VARCHAR(20) NOT NULL UNIQUE DEFAULT ('PE-' || nextval('pedido_codigo_seq')),
    ADD COLUMN frete            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (frete >= 0),
    ADD COLUMN previsao_entrega DATE;

-- ----------------------------------------------------------------------------
-- avaliação de produto (Avaliacao) — HU06 e base da análise de sentimento (IA-U2)
-- ----------------------------------------------------------------------------
CREATE TABLE avaliacao_produto (
    id         BIGSERIAL PRIMARY KEY,
    produto_id BIGINT   NOT NULL REFERENCES produto(id) ON DELETE CASCADE,
    usuario_id BIGINT   NOT NULL REFERENCES usuario(id),
    nota       SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
    comentario TEXT     NOT NULL DEFAULT '',
    criado_em  TIMESTAMP NOT NULL DEFAULT now(),
    -- uma avaliação por comprador por produto
    UNIQUE (produto_id, usuario_id)
);

CREATE INDEX idx_avaliacao_produto ON avaliacao_produto (produto_id, criado_em DESC);

-- ----------------------------------------------------------------------------
-- busca sem diferenciar acentos (HU04): "ceramica" encontra "Cerâmica"
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;
