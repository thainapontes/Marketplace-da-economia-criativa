# Product — Módulo de Recomendação de Produtos (Origem / EP8 / HU15)

> **Versão de trabalho.** A versão oficial do SDD (a entregue em 17/09/2026) está em
> [`docs/sdd/`](../sdd/). Este arquivo fica só como histórico.

## Contexto do projeto principal

O **Origem** é um marketplace web que conecta artesãos e produtores criativos de Pernambuco a
compradores de todo o país, com vitrine, busca por técnica/região, filtros, perfil do artesão,
carrinho, checkout simulado, painel do artesão e painel administrativo. É um Projeto Integrador
acadêmico: dados representativos/sintéticos e pagamento simulado, com o frontend hoje consumindo
uma Fake API e um backend Node/Express + PostgreSQL previsto para a próxima avaliação.

## Problema de negócio / necessidade do usuário

O comprador só descobre produtos hoje por navegação manual (vitrine, busca por palavra-chave,
filtros de categoria/técnica/região/preço). Não existe nenhum mecanismo que sugira proativamente
peças relevantes ao interesse de cada comprador — o que existe hoje é apenas uma lista estática de
"produtos parecidos" no detalhe do produto, sem personalização, sem estratégia para quando falta
dado (produto novo, comprador novo) e sem registro do que foi recomendado.

Isso reduz a descoberta de produtos de artesãos com menor visibilidade e reduz a conversão de
compradores que não sabem exatamente o que procurar.

## Público-alvo

- **Comprador** (perfil `comprador`): recebe as recomendações ao navegar pela vitrine ou pelo
  detalhe de um produto.
- Indiretamente, **artesão** (perfil `artesao`): se beneficia de ter seus produtos descobertos por
  meio das recomendações, e é impactado pelo risco de viés se o módulo favorecer sistematicamente
  poucos artesãos.

## Objetivo do módulo

Especificar um módulo de recomendação de produtos que:
1. Recomenda produtos similares a um produto de referência (técnica/artesão/região).
2. Recomenda produtos personalizados para compradores autenticados com histórico de compras.
3. Garante que sempre haja recomendação disponível mesmo sem dado suficiente (cold start por
   popularidade).
4. É consumido pelo sistema principal por meio de uma API estável, sem acoplar a interface à
   estratégia interna de cálculo.
5. Registra toda recomendação exibida, para auditoria e avaliação futura de efetividade.

## Benefícios esperados

- Maior descoberta de produtos e de artesãos com menor visibilidade na vitrine/busca manual.
- Maior chance de conversão para compradores que não sabem exatamente o que procurar.
- Base de dados (`recomendacao_log`) pronta para avaliar, no futuro, a efetividade de cada critério
  de recomendação e evoluir do baseline para uma estratégia mais sofisticada.
- Evolução segura: a troca da estratégia interna (regras → outro modelo) não exige alterar o
  frontend nem o restante do backend, graças ao contrato estável da API (RNF-02).

## Limites do produto

- Recomenda apenas **produtos** — não recomenda artesãos, anúncios patrocinados, nem qualquer outro
  tipo de entidade do sistema.
- Nesta fase, opera só sobre dados sintéticos/representativos do projeto (Fake API), não sobre dados
  reais de terceiros.
- Não inclui personalização via modelo de linguagem (LLM) ou IA generativa — a estratégia desta fase
  é baseline por regras de atributo e popularidade, conforme definido no backlog do projeto.
- Não inclui atualização em tempo real a cada clique dentro da mesma sessão (processamento de
  eventos em streaming).
- Não inclui um dashboard de efetividade pronto — apenas garante que o log necessário para essa
  análise futura exista e seja consultável.
