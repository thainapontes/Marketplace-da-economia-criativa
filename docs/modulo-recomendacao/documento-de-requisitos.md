# Documento de Requisitos de Software

> **Versão de trabalho.** A versão oficial do SDD (a entregue em 17/09/2026) está em
> [`docs/sdd/`](../sdd/). Este arquivo fica só como histórico.

## Módulo de Recomendação de Produtos — Origem (EP8 / HU15)

**Projeto principal:** Origem — Marketplace da Economia Criativa de Pernambuco
**Módulo especificado:** Módulo de Recomendação de Produtos (integração com o sistema principal)
**Nome:** Thainá Pontes da Silva
**Matrícula:** [matrícula]
**Turma:** 4º período — Análise e Desenvolvimento de Sistemas (ADS)
**Grupo:** Ana Beatriz Lopes, Drielly Santiago, Everton Nunes e Thainá Pontes da Silva

---

## Sumário

1. Introdução
2. Problema que será resolvido
3. Público e partes interessadas
4. Escopo
5. Produtos que poderão ser recomendados
6. Prioridades dos Requisitos
7. Requisitos Funcionais
8. Requisitos Não Funcionais
9. Interfaces
10. Riscos, limitações, privacidade, segurança e vieses
11. Referências
12. Assinaturas

---

## 1. Introdução

Este documento especifica o **Módulo de Recomendação de Produtos** a ser integrado ao sistema
principal do Origem (marketplace que conecta artesãos e produtores criativos de Pernambuco a
compradores de todo o país). Ele corresponde ao épico **EP8 — Recomendação de Produtos**, história
de usuário **HU15** do backlog priorizado do projeto.

O objeto deste documento é a **especificação** do módulo — seus requisitos funcionais, não
funcionais e a forma como ele se integra ao sistema principal já existente — e não sua
implementação. O módulo já possui uma versão inicial simplificada em produção (serviço
`recomendacoesService.recomendarSimilares`, que recomenda produtos por técnica/artesão/região em
comum), registrada em `docs/arquitetura.md` como candidata a evoluir para um mecanismo mais
completo — é exatamente essa evolução que este documento especifica.

Termos usados neste documento (artesão, técnica, região, catálogo, Fake API) seguem o mesmo
vocabulário do restante da documentação do projeto (`docs/api.md`, `docs/arquitetura.md`,
`docs/Origem_DDL.md`).

## 2. Problema que será resolvido

Hoje, o comprador só descobre produtos por navegação manual: vitrine, busca por palavra-chave e
filtros de categoria/técnica/região/preço (HU03, HU04, HU05). Não existe nenhum mecanismo que
aponte, de forma proativa, peças relevantes ao interesse de cada comprador — a única aproximação
disso é a lista estática de "produtos parecidos" exibida no detalhe do produto, que compara apenas
um produto de referência com o catálogo, não conhece o comprador, não tem estratégia para quando
falta dado (produto novo, comprador novo) e não registra o que foi recomendado.

Isso tem dois efeitos negativos para o negócio: (a) reduz a chance de descoberta de produtos de
artesãos com menor visibilidade na vitrine e na busca; (b) reduz a conversão de compradores que não
sabem exatamente o que procurar e dependem de descoberta guiada.

## 3. Público e partes interessadas

| Interessado | Interesse no módulo |
|---|---|
| Comprador | Recebe as recomendações; quer descobrir peças relevantes com o mínimo de esforço de busca. |
| Artesão | Quer que seus produtos apareçam nas recomendações de forma justa, sem serem sistematicamente ofuscados por poucos artesãos populares. |
| Administrador do Origem | Quer poder auditar o que foi recomendado e, futuramente, avaliar a efetividade do módulo. |
| Equipe de desenvolvimento do sistema principal | Consome o módulo via API; precisa de um contrato estável, documentado e com degradação previsível em caso de falha. |

## 4. Escopo

### Dentro do escopo

- Recomendação de produtos similares a um produto de referência (técnica, artesão, região).
- Recomendação personalizada ("Para você") para comprador autenticado com histórico suficiente.
- Estratégia de cold start por popularidade, para comprador sem histórico ou produto sem dado de
  similaridade suficiente.
- Exposição do módulo por meio de uma API HTTP consumível pelo frontend e pelo backend do sistema
  principal.
- Registro (log) de toda recomendação exibida, para auditoria e avaliação futura de efetividade.

### Fora do escopo (com justificativa)

- **Recomendar artesãos diretamente.** Não se aplica, porque a HU15 do backlog define
  explicitamente "Recomendação de **Produtos**" como o objeto da história de usuário; recomendação
  de artesãos não foi priorizada.
- **Recomendação de anúncios patrocinados/pagos.** Não se aplica, porque o modelo de negócio do
  Origem, descrito no backlog, não prevê monetização por anúncio.
- **Atualização em tempo real a cada clique dentro da mesma sessão (streaming de eventos).** Não se
  aplica nesta fase, porque a regra de escopo do backlog determina "começar a IA pelo baseline antes
  de modelos mais sofisticados"; processamento de eventos em tempo real não foi priorizado.
- **Personalização via modelo de linguagem (LLM) ou outra IA generativa.** Não se aplica, porque o
  backlog define a estratégia desta fase como "baseline por técnica, região e/ou popularidade",
  reservando modelos mais sofisticados para avaliação futura ("avaliar recomendação por
  comportamento na U2, conforme disponibilidade de dados").
- **Dashboard de efetividade da recomendação.** Não se aplica a esta especificação: o requisito
  RNF-06 exige apenas que o log seja consultável, não que exista uma tela de indicadores pronta.

## 5. Produtos que poderão ser recomendados

Qualquer produto do catálogo do Origem que esteja com `status = "ativo"` e `estoque > 0`,
pertencente a um artesão já aprovado (regra herdada do sistema principal — artesão pendente de
aprovação não aparece na vitrine, logo também não deve aparecer em recomendações). Isso cobre todas
as categorias, técnicas e regiões já cadastradas no catálogo (ex.: cerâmica do Alto do Moura, renda
renascença de Pesqueira/Recife, entalhe em madeira de Olinda, artigos em couro do sertão do São
Francisco). Produtos inativos, removidos ou de artesão ainda pendente nunca são recomendados
(RF-05).

## 6. Prioridades dos Requisitos

Mesma escala do template padrão da disciplina:

- **Alta (1):** requisito essencial — sua ausência compromete o objetivo do módulo.
- **Média (2):** requisito importante para a qualidade/eficácia do módulo, mas sua ausência não
  inviabiliza o módulo.
- **Baixa (3):** requisito útil, porém menos crítico.

> Nota: essa prioridade é interna ao módulo. No backlog geral do projeto, a história de usuário
> HU15 (Recomendação de Produtos) como um todo está classificada como **Could Have** (desejável) —
> ou seja, o módulo é importante o suficiente para ser especificado em detalhe, mas não bloqueia a
> entrega do fluxo principal do marketplace caso o tempo do semestre seja limitado.

## 7. Requisitos Funcionais

| Prioridade | ID | Nome e Descrição do Requisito | Interfaces e Dependências |
|---|---|---|---|
| Alta | RF-01 | **Recomendação por atributos (técnica/artesão/região):** dado um produto de referência, o módulo calcula um score de similaridade com os demais produtos ativos do catálogo, considerando técnica em comum, artesão em comum e região em comum, retornando os produtos mais similares em ordem decrescente de score. Rastreado ao critério de aceitação 1 da HU15 ("recebo recomendações por técnica, região ou popularidade"). | Interfaces: INT-01, INT-06. Dependências: RF-05, RF-08. |
| Alta | RF-02 | **Personalização por comportamento:** para um comprador autenticado com histórico suficiente de pedidos, o módulo gera uma lista "Recomendado para você" combinando os atributos dos produtos com que o comprador já interagiu, reaproveitando o mesmo mecanismo de score do RF-01 sobre esse conjunto de referência. | Interfaces: INT-01, INT-02, INT-03, INT-06. Dependências: RF-01, RF-03, RF-06. |
| Alta | RF-03 | **Cold start por popularidade:** quando não houver produto de referência (RF-01) nem histórico suficiente do comprador (RF-02) — comprador novo/anônimo ou produto novo sem coocorrência —, o módulo retorna os produtos ativos com maior popularidade (vendas e/ou avaliações recentes), garantindo que sempre haja algo a exibir. Rastreado ao critério de aceitação 1 da HU15 ("...ou popularidade"). | Interfaces: INT-01, INT-06. Dependências: RF-05. |
| Alta | RF-04 | **Exposição via API:** o módulo expõe RF-01, RF-02 e RF-03 por meio de uma interface HTTP com contrato de entrada/saída documentado (ver `design.md`), consumível pelo frontend e pelo backend do sistema principal, sem que o consumidor precise conhecer a estratégia interna de cálculo. Rastreado ao critério de aceitação 3 da HU15 ("a aplicação consome o serviço de IA por API"). | Interfaces: INT-05, INT-06. Dependências: RF-01, RF-02, RF-03. |
| Média | RF-05 | **Exclusão de itens indisponíveis:** o módulo nunca inclui, em nenhuma lista retornada, produto com estoque igual a zero ou `status` diferente de "ativo". | Interfaces: INT-01. Dependências: — |
| Média | RF-06 | **Registro da recomendação exibida:** toda lista retornada é registrada (produto, comprador quando autenticado, critério utilizado — atributo/personalizado/popularidade — e score), equivalente à tabela `recomendacao_log` do modelo de dados. | Interfaces: INT-04. Dependências: RF-01, RF-02, RF-03. |
| Baixa | RF-07 | **Diversidade por artesão:** em uma mesma lista de recomendações, no máximo 2 produtos do mesmo artesão podem aparecer, mesmo que tenham maior score. | Interfaces: — Dependências: RF-01, RF-02, RF-03. |
| Baixa | RF-08 | **Parametrização do tamanho da lista:** o número de itens recomendados é configurável por parâmetro na chamada ao módulo, com valor padrão de 4 e limite máximo de 20 itens por chamada. | Interfaces: INT-06. Dependências: — |
| Baixa | RF-09 | **Motivo da recomendação exposto:** a resposta inclui, para cada item, o critério que gerou aquela recomendação (`mesma-tecnica`, `mesmo-artesao`, `mesma-regiao`, `popularidade` ou `personalizado`), permitindo que a interface consumidora exiba essa explicação, se desejar. | Interfaces: INT-06. Dependências: RF-01, RF-02, RF-03. |

## 8. Requisitos Não Funcionais

| Prioridade | ID | Nome e Descrição do Requisito | Interfaces e Dependências |
|---|---|---|---|
| Alta | RNF-01 | **Degradação graciosa:** se o módulo estiver indisponível ou exceder o tempo limite de resposta (RNF-03), o sistema principal continua funcionando normalmente, exibindo a tela sem o bloco de recomendações, nunca bloqueando ou quebrando a navegação. Rastreado ao critério de aceitação 2 da HU15 (literal: "o módulo de recomendação está indisponível... o catálogo continua funcionando"). | Interfaces: INT-05, INT-06. Dependências: RNF-02. |
| Alta | RNF-02 | **Interface/contrato estável:** o contrato de entrada e saída da API do módulo se mantém estável independentemente de mudanças na estratégia interna de recomendação — trocar as regras por outro modelo não exige alteração no frontend/backend consumidor. | Interfaces: INT-05, INT-06. Dependências: — |
| Alta | RNF-03 | **Tempo de resposta:** o módulo responde em até 1 segundo (p95) para o volume atual do catálogo (dezenas a poucas centenas de produtos), incluindo o cálculo do score e a consulta ao histórico. | Interfaces: INT-06. Dependências: — |
| Média | RNF-04 | **Uso de dados sintéticos/representativos:** nesta fase, o módulo opera exclusivamente sobre dados sintéticos/representativos gerados para o projeto (Fake API), sem depender de dados reais de terceiros — regra de escopo do backlog. | Interfaces: INT-01, INT-02. Dependências: — |
| Média | RNF-05 | **Privacidade dos dados de histórico:** os dados de histórico de pedidos usados em RF-02 são tratados internamente ao módulo; a resposta da API nunca expõe histórico ou dado pessoal de outro comprador, apenas dados públicos dos produtos recomendados. | Interfaces: INT-02, INT-06. Dependências: RF-02. |
| Baixa | RNF-06 | **Auditabilidade do log:** os registros gerados por RF-06 podem ser consultados (por período, critério ou produto) para uma futura avaliação de efetividade da recomendação — sem que essa consulta em si seja parte do escopo desta especificação. | Interfaces: INT-04. Dependências: RF-06. |
| Média | RNF-07 | **Ambiente de execução:** o módulo roda como um serviço interno ao backend Node/Express já previsto para a Avaliação 2, sem exigir infraestrutura própria adicional (cluster dedicado, GPU etc.) nesta fase. | Interfaces: — Dependências: — |

## 9. Interfaces

### Interfaces internas (relacionamentos entre requisitos)

Já listadas na coluna "Dependências" das tabelas de RF/RNF acima.

### Interfaces internas ao sistema principal (o módulo consome/alimenta)

| ID | Nome | Descrição |
|---|---|---|
| INT-01 | Catálogo de Produtos | Fonte dos dados de produto (id, técnica, região, artesão, categoria, estoque, status) usados pelo motor de score e pelo filtro de disponibilidade (`produtosService`, hoje; tabela `produto` no DDL). |
| INT-02 | Histórico de Pedidos | Fonte do histórico de compras do comprador autenticado, usado na personalização RF-02 (`pedidosService`, hoje; tabelas `pedido`/`item_pedido` no DDL). |
| INT-03 | Sessão do Usuário | Identifica o comprador autenticado (ou anônimo), decidindo entre personalização (RF-02) e cold start (RF-03) (`authStore`/`useAuth`, hoje). |
| INT-04 | Log de Recomendações | Onde toda recomendação exibida é persistida (RF-06/RNF-06) — equivalente à tabela `recomendacao_log` do DDL. |

### Interfaces externas (o módulo é consumido por)

| ID | Nome | Descrição |
|---|---|---|
| INT-05 | Vitrine / Detalhe do Produto (frontend) | Componentes de tela do sistema principal que solicitam recomendações e renderizam o bloco ("Você também pode gostar", "Recomendado para você"). |
| INT-06 | API do Módulo de Recomendação | Contrato HTTP exposto pelo módulo, consumido pelo backend/frontend do sistema principal (ver `design.md` para os campos de requisição/resposta). |

### Forma de integração com o sistema principal

O módulo é um serviço interno ao backend do sistema principal (RNF-07), acessado por uma única
fronteira: sua API (INT-06). O frontend nunca calcula recomendação localmente — ele chama a API do
módulo através da mesma camada de `services/` já usada para as demais funcionalidades (produtos,
pedidos etc.), preservando o princípio de arquitetura já adotado no projeto ("nenhuma tela precisa
ser reescrita" ao trocar a fonte de dados, ver `docs/arquitetura.md`). Isso é o que garante RNF-01
(degradação graciosa) e RNF-02 (contrato estável): o consumidor só conhece o contrato da API, nunca
a estratégia interna.

## 10. Riscos, limitações, privacidade, segurança e vieses

- **Viés de "bolha" (filter bubble):** recomendar sempre pelos mesmos atributos (técnica/artesão/
  região) pode reduzir a exposição de artesãos e técnicas menos representados no histórico do
  comprador. Mitigado por RF-07 (diversidade por artesão).
- **Viés de popularidade no cold start:** a estratégia de popularidade (RF-03) tende a favorecer
  produtos já vendidos, dificultando a descoberta de peças e artesãos novos. Risco aceito nesta fase
  (baseline), a ser reavaliado quando houver dado suficiente para outra estratégia — conforme a
  própria tarefa do backlog ("avaliar recomendação por comportamento na U2, conforme disponibilidade
  de dados").
- **Privacidade:** o histórico de pedidos usado em RF-02 é dado sensível do comprador (RNF-05); a
  API do módulo nunca deve devolver esse histórico para terceiros, apenas os produtos recomendados.
- **Segurança:** a API do módulo (RF-04) deve ser acessível apenas pelo backend/frontend do próprio
  sistema principal, na mesma origem e mecanismo de autenticação do restante da aplicação — não deve
  existir endpoint público sem controle de acesso.
- **Qualidade do dado:** como o projeto usa dados sintéticos (RNF-04), a efetividade real do
  baseline só poderá ser avaliada quando houver dado de comportamento real de compradores.
- **Disponibilidade:** a dependência do módulo não pode se tornar um ponto único de falha do sistema
  principal — coberto por RNF-01 (degradação graciosa).

## 11. Referências

- Backlog Priorizado — Origem, EP8 / HU15 (Recomendação de Produtos).
- `docs/api.md` — contrato atual de `recomendacoesService`.
- `docs/arquitetura.md` — arquitetura em camadas do sistema principal e limitações conhecidas.
- `docs/Origem_DDL.md` — modelo de dados, tabela `recomendacao_log`.
- `README.md` do projeto Origem.

## 12. Assinaturas

Os abaixo assinados estão de acordo com o conteúdo deste documento.

Data: ___/___/_____

<Nome do responsável>
Gestor e Patrocinador do Projeto
Cliente

Data: ___/___/_____

<Nome do responsável>
Representante dos Usuários
Cliente

Data: ___/___/_____

<Nome do responsável>
Gerente de Projetos
Equipe Origem

Data: ___/___/_____

<Nome do responsável>
Analista Responsável
Equipe Origem
