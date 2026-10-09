# Registro de uso de IA generativa — Origem

Este documento registra, de forma transparente, onde e como ferramentas de IA generativa
foram usadas na construção do projeto Origem, conforme exigido pela disciplina.

## 1. Figma Make — protótipo visual

A interface do marketplace (vitrine, catálogo, detalhe de produto, perfil do artesão,
carrinho, painel do artesão, painel administrativo, login/cadastro e confirmação de pedido)
foi inicialmente gerada com o **Figma Make** a partir do briefing do projeto (artesanato e
economia criativa de Pernambuco), produzindo um protótipo React autocontido com dados de
exemplo fixos no próprio código.

Esse protótipo serviu **apenas como referência visual e estrutural** — layout, paleta de
cores (`src/styles/globals.css`), tipografia (Fraunces + Inter) e composição de cada tela. Ele
não foi entregue como está: cada página foi reimplementada na arquitetura real do projeto
(`app/`, `components/`, `hooks/`, `services/`, `store/`), eliminando todos os dados fixos e
conectando-a à Fake API. O protótipo original foi removido do repositório após a portagem,
para não deixar código morto com dados hardcoded.

## 2. Claude Code (Anthropic) — arquitetura, Fake API e integração

A maior parte do trabalho de engenharia registrado neste commit foi feita com o auxílio do
**Claude Code**, atuando como copiloto de desenvolvimento sobre o repositório já criado pela
equipe (estrutura de pastas, DDL do banco em `docs/Origem_DDL.md`, parte dos tipos/serviços
iniciais). Especificamente, a IA:

- Levantou o estado real do repositório (o que já existia vs. o que era só estrutura vazia)
  antes de qualquer alteração, para não descartar trabalho da equipe.
- Completou as interfaces TypeScript de domínio (`src/types/`) e os dados sintéticos de
  artesanato pernambucano (`src/mocks/`), com base em referências reais de técnicas e regiões
  (Alto do Moura, Renda Renascença de Pesqueira/Recife, entalhe em madeira de Olinda, couro do
  sertão do São Francisco).
- Implementou a Fake API assíncrona (`src/services/api/`), incluindo a regra de baixa de
  estoque no checkout descrita no DDL (seção 7).
- Implementou o estado global (Zustand) do carrinho e da sessão de usuário
  (`src/store/cartStore.ts`, `src/store/authStore.ts`) e os hooks que os expõem aos
  componentes (`src/hooks/`).
- Reconstruiu as páginas e componentes visuais a partir do protótipo do Figma Make, agora
  consumindo a Fake API por meio dos hooks, com tratamento explícito dos três estados
  (`LoadingState`, `ErrorState`, `EmptyState`) em toda tela que busca dados.
- Redigiu este conjunto de documentos (`docs/arquitetura.md`, `docs/api.md` e este arquivo).
- Validou o resultado com `tsc --noEmit`, `next build` e verificação manual de todas as rotas
  em ambiente de desenvolvimento antes de considerar a tarefa concluída.

Todo o código gerado foi revisado quanto à compilação (TypeScript `strict`, sem `any`) e ao
comportamento das rotas antes da entrega; decisões de modelagem (ex.: simplificações de
autenticação e persistência, listadas em `docs/arquitetura.md`, seção 4) foram deliberadas e
documentadas, não deixadas como lacunas silenciosas.

## 3. Claude Code — backend de concorrência e fila (entrega de FCCPD, Unidade 1)

A entrega de Fundamentos de Computação Concorrente, Paralela e Distribuída (controle de
concorrência no checkout e fila assíncrona com worker em processo separado) foi desenvolvida
com o **Claude Code** sobre o repositório existente. O detalhamento — o que a IA fez, quais
decisões foram tomadas pela aluna, e como o trabalho foi conduzido — está na **seção 6 do
[`RELATORIO.md`](../RELATORIO.md)**, na raiz do repositório, junto com as evidências em
`evidencias/`.

## 4. Claude Code — módulo de recomendação (IA, AV2)

O mockup do módulo de recomendação em BentoML (`ia-recomendacao/`) foi desenvolvido com o
**Claude Code**, a partir da especificação da AV1 (requisitos RF-01 a RF-08 e RNF-01 a RNF-07,
`design.md`) e do repositório-base indicado pelo professor (`lgallindo/recomendador-bentoml`).
A IA gerou o catálogo sintético a partir dos mocks do frontend, o treino, as regras de
recomendação, o serviço HTTP, o script de casos de teste, a troca do cálculo local pela chamada
ao módulo em `frontend/src/services/api/recomendacoes.service.ts` e a documentação no README.
A inclusão do RF-06 (histórico de compra) e a integração com o frontend foram decisões da
equipe; os casos de teste foram executados e conferidos antes da entrega.

## 5. Outras ferramentas

**ChatGPT, Gemini e GitHub Copilot** foram utilizados na entrega de FCCPD como apoio de
**estudo**, para esclarecer conceitos da disciplina (race condition, lock, thread × processo,
fila, idempotência). Conforme declarado pela aluna, não geraram código entregue.

*(Espaço para a equipe registrar outros usos — indicando ferramenta, trecho do projeto em que
foi usada e o que foi gerado por IA vs. revisado/ajustado pela equipe.)*

## 6. Responsabilidade final

Conforme orientação da disciplina, o uso de IA generativa foi tratado como apoio ao
desenvolvimento, não como substituto do entendimento do time sobre a solução: a equipe é
responsável por revisar, entender e defender qualquer trecho de código ou decisão de
arquitetura registrado neste repositório.
