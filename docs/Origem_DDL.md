# Origem — DDL (PostgreSQL 15+)

> Script de criação do banco de dados do marketplace **Origem**, derivado da modelagem de dados do Projeto Integrador (backlog EP1–EP8). Executar na ordem apresentada — as dependências de chave estrangeira exigem essa sequência.

## 1. Tipos enumerados

```sql
CREATE TYPE perfil_usuario       AS ENUM ('comprador','artesao','administrador');
CREATE TYPE status_produto       AS ENUM ('ativo','inativo');
CREATE TYPE status_pedido        AS ENUM ('pendente','confirmado','em_producao','enviado','entregue','cancelado');
CREATE TYPE status_pagamento     AS ENUM ('aprovado','recusado');
CREATE TYPE status_evento        AS ENUM ('pendente','processado','falha');
CREATE TYPE status_classificacao AS ENUM ('aprovado','revisao');
CREATE TYPE status_imagem        AS ENUM ('disponivel','indisponivel','processando');
```

## 2. Núcleo: usuário, artesão e catálogo

```sql
CREATE TABLE usuario (
    id            BIGSERIAL PRIMARY KEY,
    nome          VARCHAR(150) NOT NULL,
    email         VARCHAR(180) NOT NULL UNIQUE,
    senha_hash    VARCHAR(255) NOT NULL,
    perfil        perfil_usuario NOT NULL DEFAULT 'comprador',
    criado_em     TIMESTAMP NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE regiao (
    id    SERIAL PRIMARY KEY,
    nome  VARCHAR(100) NOT NULL,
    polo  VARCHAR(100) NOT NULL,
    UNIQUE (nome, polo)
);

CREATE TABLE artesao (
    usuario_id   BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    nome_atelie  VARCHAR(150) NOT NULL,
    descricao    TEXT,
    regiao_id    INT NOT NULL REFERENCES regiao(id),
    criado_em    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE categoria (
    id    SERIAL PRIMARY KEY,
    nome  VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE tecnica (
    id    SERIAL PRIMARY KEY,
    nome  VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE produto (
    id            BIGSERIAL PRIMARY KEY,
    artesao_id    BIGINT NOT NULL REFERENCES artesao(usuario_id),
    categoria_id  INT NOT NULL REFERENCES categoria(id),
    tecnica_id    INT NOT NULL REFERENCES tecnica(id),
    regiao_id     INT NOT NULL REFERENCES regiao(id),
    nome          VARCHAR(150) NOT NULL,
    descricao     TEXT,
    preco         NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
    estoque       INT NOT NULL DEFAULT 0 CHECK (estoque >= 0),
    status        status_produto NOT NULL DEFAULT 'ativo',
    criado_em     TIMESTAMP NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE produto_imagem (
    id                  BIGSERIAL PRIMARY KEY,
    produto_id          BIGINT NOT NULL REFERENCES produto(id) ON DELETE CASCADE,
    chave_armazenamento VARCHAR(300) NOT NULL,
    content_type        VARCHAR(50)  NOT NULL,
    hash_sha256         CHAR(64),
    status              status_imagem NOT NULL DEFAULT 'disponivel',
    verificado_em       TIMESTAMP,
    ordem               SMALLINT NOT NULL DEFAULT 0,
    UNIQUE (produto_id, hash_sha256)
);
```

## 3. Carrinho, pedido e pagamento

```sql
CREATE TABLE carrinho (
    id            BIGSERIAL PRIMARY KEY,
    usuario_id    BIGINT NOT NULL UNIQUE REFERENCES usuario(id),
    atualizado_em TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE item_carrinho (
    id             BIGSERIAL PRIMARY KEY,
    carrinho_id    BIGINT NOT NULL REFERENCES carrinho(id) ON DELETE CASCADE,
    produto_id     BIGINT NOT NULL REFERENCES produto(id),
    quantidade     INT NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL,
    UNIQUE (carrinho_id, produto_id)
);

CREATE TABLE pedido (
    id               BIGSERIAL PRIMARY KEY,
    comprador_id     BIGINT NOT NULL REFERENCES usuario(id),
    status           status_pedido NOT NULL DEFAULT 'pendente',
    endereco_entrega VARCHAR(255) NOT NULL,
    valor_total      NUMERIC(10,2) NOT NULL,
    criado_em        TIMESTAMP NOT NULL DEFAULT now(),
    atualizado_em    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE item_pedido (
    id             BIGSERIAL PRIMARY KEY,
    pedido_id      BIGINT NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
    produto_id     BIGINT NOT NULL REFERENCES produto(id),
    artesao_id     BIGINT NOT NULL REFERENCES artesao(usuario_id),
    quantidade     INT NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL,
    subtotal       NUMERIC(10,2) NOT NULL
);

CREATE TABLE pagamento (
    id            BIGSERIAL PRIMARY KEY,
    pedido_id     BIGINT NOT NULL UNIQUE REFERENCES pedido(id),
    metodo        VARCHAR(30) NOT NULL DEFAULT 'simulado',
    status        status_pagamento NOT NULL,
    valor         NUMERIC(10,2) NOT NULL,
    processado_em TIMESTAMP NOT NULL DEFAULT now()
);
```

## 4. Assíncrono, notificação e IA

```sql
CREATE TABLE notificacao (
    id         BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id),
    tipo       VARCHAR(50) NOT NULL,
    mensagem   VARCHAR(300) NOT NULL,
    lida       BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE evento_assincrono (
    id            BIGSERIAL PRIMARY KEY,
    tipo          VARCHAR(50) NOT NULL,
    payload       JSONB NOT NULL,
    status        status_evento NOT NULL DEFAULT 'pendente',
    criado_em     TIMESTAMP NOT NULL DEFAULT now(),
    processado_em TIMESTAMP
);

CREATE TABLE classificacao_produto (
    id         BIGSERIAL PRIMARY KEY,
    produto_id BIGINT NOT NULL REFERENCES produto(id),
    classe     VARCHAR(80) NOT NULL,
    confianca  NUMERIC(4,3) NOT NULL CHECK (confianca BETWEEN 0 AND 1),
    status     status_classificacao NOT NULL DEFAULT 'aprovado',
    criado_em  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE recomendacao_log (
    id         BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT REFERENCES usuario(id),
    produto_id BIGINT NOT NULL REFERENCES produto(id),
    criterio   VARCHAR(30) NOT NULL,
    score      NUMERIC(5,4),
    criado_em  TIMESTAMP NOT NULL DEFAULT now()
);
```

## 5. Índices

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_produto_nome_trgm ON produto USING GIN (nome gin_trgm_ops);
CREATE INDEX idx_produto_filtros   ON produto (tecnica_id, regiao_id, categoria_id);
CREATE INDEX idx_produto_preco     ON produto (preco);
CREATE INDEX idx_item_pedido_artesao ON item_pedido (artesao_id);
CREATE INDEX idx_pedido_comprador  ON pedido (comprador_id, status);
CREATE INDEX idx_notificacao_usuario_nao_lida ON notificacao (usuario_id) WHERE lida = FALSE;
CREATE INDEX idx_produto_imagem_indisponivel ON produto_imagem (produto_id) WHERE status = 'indisponivel';
```

## 6. Views — indicadores (HU13, HU14)

```sql
CREATE VIEW vw_indicadores_artesao AS
SELECT
    ip.artesao_id,
    SUM(ip.subtotal)                                            AS total_vendido,
    COUNT(DISTINCT p.id)                                        AS total_pedidos,
    COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'pendente')   AS pedidos_pendentes
FROM item_pedido ip
JOIN pedido p ON p.id = ip.pedido_id
GROUP BY ip.artesao_id;

CREATE VIEW vw_indicadores_admin AS
SELECT
    (SELECT COUNT(*) FROM usuario)                        AS total_usuarios,
    (SELECT COUNT(*) FROM produto WHERE status = 'ativo') AS produtos_ativos,
    (SELECT COUNT(*) FROM pedido)                         AS total_pedidos,
    (SELECT COALESCE(SUM(valor_total),0) FROM pedido
        WHERE status <> 'cancelado')                      AS total_vendas;
```

## 7. Checkout — baixa de estoque sem overselling (HU09)

```sql
-- Dentro da transação de checkout, por item do pedido:
UPDATE produto
   SET estoque = estoque - :quantidade
 WHERE id = :produto_id
   AND estoque >= :quantidade;
-- Se ROW COUNT = 0, a transação é revertida (estoque insuficiente);
-- evita SELECT + UPDATE separados, que permitiriam a duas
-- requisições concorrentes lerem o mesmo saldo antes de escrever.
```

## 8. Extensões da Unidade 2 (backend real)

Acrescentadas em `backend/sql/01b_extensoes_u2.sql`, só com `ADD COLUMN` / `CREATE TABLE`:
nada das seções 1 a 7 foi alterado. Motivo: o frontend exibe dados que este DDL não
guardava (ver `docs/api.md`, seção 9).

| Tabela | Acréscimo | Para quê |
|---|---|---|
| `usuario` | `avatar_url` | foto de perfil |
| `artesao` | `foto_url`, `capa_url`, `ano_inicio`, `aprovado` (padrão `FALSE`) | perfil público (HU07) e aprovação pelo admin (HU14) |
| `artesao_tecnica` (nova) | `(artesao_id, tecnica_id)` | técnicas que o artesão domina (N:N) |
| `produto` | `preco_original` (`>= preco`) | preço "de" riscado na vitrine |
| `pedido` | `codigo` (`PE-NNNN`, único, gerado por sequência), `frete`, `previsao_entrega` | dados do pedido exibidos ao comprador. `subtotal` não vira coluna: é `valor_total - frete` |
| `avaliacao_produto` (nova) | `produto_id`, `usuario_id`, `nota` (1–5), `comentario`, única por `(produto_id, usuario_id)` | avaliações (HU06) e base da análise de sentimento (IA-U2) |
| — | extensão `unaccent` | busca sem diferenciar acentos (HU04) |

```sql
CREATE TABLE avaliacao_produto (
    id         BIGSERIAL PRIMARY KEY,
    produto_id BIGINT   NOT NULL REFERENCES produto(id) ON DELETE CASCADE,
    usuario_id BIGINT   NOT NULL REFERENCES usuario(id),
    nota       SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
    comentario TEXT     NOT NULL DEFAULT '',
    criado_em  TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (produto_id, usuario_id)
);

CREATE TABLE artesao_tecnica (
    artesao_id BIGINT NOT NULL REFERENCES artesao(usuario_id) ON DELETE CASCADE,
    tecnica_id INT    NOT NULL REFERENCES tecnica(id),
    PRIMARY KEY (artesao_id, tecnica_id)
);
```
