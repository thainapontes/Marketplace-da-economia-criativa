# design.md — Módulo de Recomendação de Produtos (Origem)

## 1. Diagrama de componentes

```
┌─────────────────────────── Frontend Origem (Next.js) ───────────────────────────┐
│  ProductDetails (app/produtos/[id])     HomeView (app/)                          │
│         │                                     │                                  │
│         ▼                                     ▼                                  │
│  useRecomendacoes() ─────────────────── useRecomendacoes(usuarioId)              │
│         │                                     │                                  │
│         ▼                                     ▼                                  │
│  recomendacoesService.recomendarSimilares(produtoId, limite)                     │
│  recomendacoesService.recomendarParaUsuario(usuarioId, limite)                   │
└────────────────────────────────┬──────────────────────────────────────────────┬─┘
                                  │ HTTP (fetch)                                 │
                                  ▼                                              ▼
┌────────────────────────── Backend Origem (Node/Express) ─────────────────────────┐
│                    RecomendacaoController                                        │
│   GET /produtos/:id/recomendados     GET /usuarios/:id/recomendados              │
│                                  │                                                │
│                                  ▼                                                │
│                       RecomendacaoService (módulo de recomendação)               │
│   ┌───────────────────┐  ┌────────────────────┐  ┌───────────────────────────┐   │
│   │ EstrategiaAtributo │  │ EstrategiaHistorico │  │ EstrategiaPopularidade    │   │
│   │ (RF-01, baseline)  │  │ (RF-06)              │  │ (RF-07, fallback)         │   │
│   └─────────┬──────────┘  └──────────┬───────────┘  └─────────────┬─────────────┘   │
│             └───────────────┬────────┴──────────────────┬───────┘                │
│                              ▼                            ▼                       │
│                     FiltroElegibilidade (RF-04)     RegistradorLog (RF-03)        │
└──────────────────────────────┬───────────────────────────┬──────────────────────┘
                                 ▼                            ▼
                    ┌──────────────────────┐      ┌───────────────────────┐
                    │ produto / categoria / │      │  recomendacao_log     │
                    │ tecnica / regiao      │      │  (PostgreSQL)         │
                    │ item_pedido           │      └───────────────────────┘
                    └──────────────────────┘
```

O módulo é um serviço interno do backend (`RecomendacaoService`), acionado por um controller
HTTP fino. Internamente delega para três estratégias (atributo, histórico, popularidade), que
consultam somente leitura as tabelas do domínio já existente, e finaliza sempre passando pelo
filtro de elegibilidade (RF-04) e pelo registrador de log (RF-03) antes de responder.

## 2. Fluxo de dados

1. O componente de UI (`ProductDetails` ou `HomeView`) dispara o hook `useRecomendacoes`.
2. O hook chama `recomendacoesService`, que faz `fetch` para a rota REST correspondente.
3. O `RecomendacaoController` valida os parâmetros de entrada (`id`, `limite`) e delega ao
   `RecomendacaoService`.
4. O `RecomendacaoService` executa a `EstrategiaAtributo` (RF-01) sobre a tabela `produto`; se o
   resultado for insuficiente para o `limite` solicitado, complementa com `EstrategiaPopularidade`
   (RF-07), que agrega `item_pedido`; para a rota por usuário, primeiro tenta
   `EstrategiaHistorico` (RF-06) sobre `pedido`/`item_pedido` do próprio usuário.
5. O resultado passa pelo `FiltroElegibilidade` (RF-04): remove o produto de referência,
   inativos e sem estoque.
6. O `RegistradorLog` grava uma linha em `recomendacao_log` por produto retornado (RF-03).
7. O controller responde com a lista de produtos em JSON; o frontend renderiza o bloco de
   recomendações ou, em caso de erro/timeout, aplica a degradação graciosa (RF-08).

## 3. Modelo de dados

O módulo **reutiliza integralmente** as tabelas já definidas em `docs/Origem_DDL.md` — nenhuma
tabela nova é necessária:

- `produto` (id, artesao_id, categoria_id, tecnica_id, regiao_id, status, estoque, preco, …) —
  fonte dos atributos usados em RF-01 e do filtro de elegibilidade (RF-04).
- `item_pedido` (produto_id, artesao_id, quantidade, subtotal) — fonte de popularidade (RF-07) e
  de histórico de compra do usuário (via `pedido.comprador_id`, RF-06).
- `recomendacao_log` (id, usuario_id, produto_id, criterio, score, criado_em) — destino do
  registro de auditoria (RF-03, RNF-04, RNF-07). O campo `criterio` armazena um dos valores:
  `"mesmo-artesao"`, `"mesma-tecnica"`, `"mesma-regiao"`, `"popularidade"` ou
  `"historico-compra"`.

```
produto 1───∞ item_pedido ∞───1 pedido(comprador_id)
produto 1───∞ recomendacao_log ∞───1 usuario (opcional, usuario_id pode ser nulo)
```

## 4. Estratégia principal e baseline

A estratégia **principal (baseline)** é a já validada na Avaliação 1: similaridade de atributos
por pesos fixos — mesmo artesão (3), mesma técnica (2), mesma região (1) — somados por produto
candidato, ordenados por pontuação decrescente (RF-01). É determinística, explicável (o
`criterio` de maior peso pode ser reportado) e não depende de volume de dados, servindo também
como estratégia de *cold start* para produtos e usuários novos.

Quando o baseline não preenche o `limite` solicitado, ou quando a rota é por usuário autenticado
com histórico, duas estratégias complementares entram em cena, sempre na seguinte ordem de
prioridade: **histórico de compra** (RF-06, só na rota personalizada) → **baseline por atributo**
(RF-01) → **popularidade** (RF-07, preenche o restante). Essa composição está alinhada à regra de
escopo do backlog do Origem — "começar a IA pelo baseline antes de modelos mais sofisticados" —
um modelo de aprendizado de máquina fica fora desta entrega.

## 5. Interface de integração

### `GET /produtos/:id/recomendados`

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` (path) | inteiro | sim | Identificador do produto de referência |
| `limite` (query) | inteiro | não (padrão 4) | Quantidade máxima de itens retornados |

**Resposta 200 (JSON):** objeto com `produtoReferenciaId` (inteiro) e `recomendacoes` (lista, na
ordem de recomendação). Cada item de `recomendacoes` traz os campos do `Produto` (mesmo formato já
usado no restante da API do Origem) mais `criterio` (texto) e `score` (número).

**Erros** (corpo JSON `{ "erro": "<mensagem>" }`):
- `404` — produto de referência não existe.
- `400` — `limite` não é um inteiro entre 1 e 20.
- `503` — falha interna ou timeout de 2 segundos (o frontend trata como RF-08, sem propagar erro
  para o usuário).

### `GET /usuarios/:id/recomendados` (personalizada, RF-06)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` (path) | inteiro | sim | Identificador do usuário autenticado |
| `limite` (query) | inteiro | não (padrão 8) | Quantidade máxima de itens retornados |

**Resposta 200 (JSON):** objeto com `usuarioId` (inteiro) e `recomendacoes` (lista, no mesmo
formato da rota por produto). Requer o mesmo mecanismo de autenticação já usado pelo restante do
Origem (o usuário só pode consultar suas próprias recomendações).

**Erros** (corpo JSON `{ "erro": "<mensagem>" }`):
- `401` — requisição sem autenticação.
- `403` — `id` diferente do usuário autenticado.
- `400` — `limite` não é um inteiro entre 1 e 20.
- `503` — falha interna ou timeout de 2 segundos (RF-08).

## 6. Exemplo de requisição e resposta

**Requisição:**
```
GET /produtos/42/recomendados?limite=4
```

**Resposta 200:**
```json
{
  "produtoReferenciaId": 42,
  "recomendacoes": [
    { "id": 87, "nome": "Vaso em cerâmica do Alto do Moura", "criterio": "mesmo-artesao", "score": 3 },
    { "id": 103, "nome": "Panela de barro decorada", "criterio": "mesma-tecnica", "score": 2 },
    { "id": 55, "nome": "Boneca de cerâmica pintada", "criterio": "mesma-tecnica", "score": 2 },
    { "id": 12, "nome": "Renda Renascença — toalha de mesa", "criterio": "popularidade", "score": 0 }
  ]
}
```

**Resposta 404 (produto inexistente):**
```json
{ "erro": "Produto 999 não encontrado" }
```

## 7. Tratamento de erros e estratégia de contingência

- **Produto de referência inexistente:** `404` com mensagem legível (RF-02).
- **`limite` inválido** (não inteiro ou fora de 1–20): `400`, sem executar nenhuma estratégia
  (validação de entrada explícita, sem correção silenciosa do parâmetro).
- **Falha interna do módulo (erro inesperado ou consulta que não conclui em 2 segundos):** o
  controller responde `503`, sem expor stack trace; o frontend trata isso exatamente como "sem recomendações disponíveis" e oculta a seção
  (RF-08, RNF-02), sem exibir mensagem de erro bloqueante ao comprador.
- **Falha ao gravar em `recomendacao_log`:** não deve impedir a resposta ao usuário — a escrita
  do log é *best-effort* (log de auditoria), enquanto a resposta da recomendação em si é o
  caminho crítico.

## 8. Segurança, privacidade e observabilidade

- **Segurança:** a rota por produto é pública (mesmo nível de acesso do catálogo); a rota por
  usuário exige autenticação e verifica que o usuário autenticado só acessa suas próprias
  recomendações (autorização por proprietário, mesmo padrão já usado em `pedidosService`).
- **Privacidade:** nenhuma estratégia usa CPF, endereço ou dados de pagamento (RNF-03); o
  histórico de compra usado em RF-06 é reduzido a categoria/técnica dos produtos comprados.
- **Observabilidade:** `recomendacao_log` permite consultas agregadas por `criterio` e por
  período (RNF-07), servindo de base para indicadores futuros no painel administrativo e para
  avaliar, em uma etapa posterior, a evolução da estratégia com dados comportamentais reais.

---

## Especificações técnicas (opcionais nesta etapa)

- **Linguagem/backend:** Node.js + Express, para manter consistência com o restante do backend
  do Origem planejado em `docs/arquitetura.md`.
- **Banco de dados:** PostgreSQL, reaproveitando o schema de `docs/Origem_DDL.md` sem alterações.
- **Organização de pastas (backend):** `src/modules/recomendacao/{controller,service,estrategias,repository}.ts`,
  espelhando a separação em camadas já usada no frontend (`services/`, `hooks/`).
- **Localização do módulo:** backend, como serviço interno — o frontend nunca acessa o banco
  diretamente, apenas consome a API REST (mesmo princípio de "zero hardcoded" do frontend atual).
- **Ponto de integração com o sistema principal:** `services/api/recomendacoes.service.ts` no
  frontend, trocando o cálculo local por `fetch("/api/produtos/:id/recomendados")` — nenhuma tela
  precisa ser reescrita.
- **Ambiente de execução:** mesmo ambiente do backend da Avaliação 2 (Node/Express + PostgreSQL).
- **Restrições técnicas conhecidas:** dados sintéticos/representativos (regra de escopo do
  backlog do Origem), o que limita a validação estatística da qualidade das recomendações nesta
  fase acadêmica.
