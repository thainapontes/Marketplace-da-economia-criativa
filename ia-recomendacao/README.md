# Módulo de recomendação do Origem (BentoML)

Mockup executável do módulo especificado na AV1 de IA. **Instalação, tabela RF → endpoint e
casos de teste estão no [README da raiz](../README.md#ia--av2-mockup-do-módulo-de-recomendação-trilha-a-bentoml).**
Este arquivo explica o que há dentro da pasta.

Base: [lgallindo/recomendador-bentoml](https://github.com/lgallindo/recomendador-bentoml)
(Trilha A). Mesmo arco treino → serve; as regras e o contrato HTTP seguem a AV1 do Origem.

## Arquivos

| Arquivo | Papel |
|---|---|
| `dados/catalogo.json` | catálogo sintético: 11 produtos e histórico de compra |
| `scripts/exportar_catalogo.mjs` | gera o catálogo a partir de `frontend/src/mocks/` (mesmos ids da Fake API) |
| `treino.py` | offline: calcula a popularidade e grava `recomendador-origem` no store do BentoML |
| `recomendador.py` | regras puras: elegibilidade, similaridade, histórico, popularidade, limite por artesão |
| `service.py` | online: serviço BentoML com as rotas REST da AV1 (FastAPI montada em `/api`) |
| `testes/casos.sh` | roda os casos de teste do README e mostra OK/FALHOU |
| `logs/recomendacao_log.jsonl` | criado em execução; simula a tabela `recomendacao_log` |

## Dados sintéticos

- **Produtos 1 a 10:** os mesmos da Fake API do frontend (nome, técnica, região, artesão,
  estoque). O produto 8 está **sem estoque** e o 11, que só existe aqui, está **inativo** — os
  dois servem para mostrar o RF-04.
- **`vendas`:** números inventados (a Fake API não tem contagem de vendas). **`notaMedia`:**
  média das avaliações de `avaliacoes.mock.ts`, ou 0 sem avaliação.
- **`historico`:** só ids de produto por usuário, tirados de `pedidos.mock.ts` (RNF-03: nada de
  endereço ou pagamento). Só a usuária 1 tem compras; qualquer outro usuário — inclusive um
  comprador recém-cadastrado no frontend — cai na popularidade. Compras novas feitas no checkout
  da Fake API não chegam ao módulo (o histórico é o do catálogo); seria a leitura da tabela de
  pedidos no backend real.

## Regras

- **Similaridade (RF-01):** mesmo artesão +3, mesma técnica +2, mesma região +1. O `criterio`
  devolvido é o atributo de maior peso em comum.
- **Histórico (RF-06):** técnica de algum item comprado +2, categoria +1; itens já comprados
  não voltam.
- **Popularidade (RF-07):** `0,7 × vendas / maior venda + 0,3 × nota média / 5`, calculada no
  treino. Completa qualquer lista que fique abaixo do `limite`.
- **Elegibilidade (RF-04)** e **no máximo 2 por artesão (RNF-06)** valem para todas as listas.
  Empates no score saem pelo mais popular e, depois, pelo menor id — a resposta é sempre a mesma.

## Decisões do mockup

- **Rotas REST em vez do `@bentoml.api`:** a AV1 especifica `GET /produtos/:id/recomendados`
  com erros 400/404/503 e corpo `{ "erro": ... }`. Uma app FastAPI montada no serviço BentoML
  (`@bentoml.asgi_app`) mantém esse contrato; o modelo continua carregado do store do BentoML.
  As rotas ficam sob `/api`, como no ponto de integração descrito no `design.md` da AV1.
- **Porta 3001:** a 3000 é do frontend Next.js.
- **Autenticação simulada:** o header `X-Usuario-Id` faz o papel do usuário logado (a Fake API
  também não tem JWT).
- **Falha simulada:** o header `X-Simular-Falha: erro | lentidao` existe só para demonstrar o
  RF-08; sem ele, o timeout de 2 s e o tratamento de erro valem do mesmo jeito.
- **Log em arquivo:** o `recomendacao_log` vira um JSONL, gravado só quando a resposta é 200; se a
  gravação falhar, a resposta sai mesmo assim (best-effort, como no `design.md`).
- **Fora do mockup:** PostgreSQL e as metas de desempenho do RNF-01/RNF-05 (p95 de 300 ms com
  10.000 produtos) não foram medidas.

## Empacotar (opcional)

`just imagem` gera o Bento e a imagem Docker `recomendador-origem:av2`; `just serve-container`
sobe a mesma API na porta 3001. Precisa de Docker e de `just treino` antes.
