# Requirements — Módulo de Recomendação de Produtos (Origem / EP8 / HU15)

> **Versão de trabalho.** A versão oficial do SDD (a entregue em 17/09/2026) está em
> [`docs/sdd/`](../sdd/). Este arquivo fica só como histórico.

Todos os identificadores (RF-XX / RNF-XX) são idênticos aos usados em
`documento-de-requisitos.md`. Critérios de aceitação em notação EARS.

---

## RF-01 — Recomendação por atributos (técnica/artesão/região)

**História de usuário:** Como comprador, quero ver produtos parecidos com um produto que estou
olhando, para descobrir outras peças do meu interesse dentro da mesma técnica, região ou artesão.

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ calcular, para um produto de referência informado, um score de
  similaridade com os demais produtos elegíveis do catálogo (ver RF-05), somando pontos por técnica
  em comum, artesão em comum e região em comum.
- QUANDO o sistema principal solicitar recomendações para um produto de referência que possua ao
  menos um produto similar elegível, O MÓDULO DE RECOMENDAÇÃO DEVERÁ retornar até o limite
  solicitado (RF-08) de produtos, ordenados por score decrescente.
- SE o produto de referência informado não existir no catálogo, ENTÃO O MÓDULO DE RECOMENDAÇÃO
  DEVERÁ retornar uma lista vazia, sem lançar erro de execução.
- SE nenhum produto do catálogo tiver score de similaridade maior que zero com o produto de
  referência, ENTÃO O MÓDULO DE RECOMENDAÇÃO DEVERÁ acionar o critério de cold start (RF-03).

## RF-02 — Personalização por comportamento

**História de usuário:** Como comprador com histórico de compras, quero ver uma lista "Recomendado
para você", para descobrir produtos alinhados ao que eu já comprei sem precisar buscar manualmente.

**Critérios de aceitação:**

- QUANDO o sistema principal solicitar recomendações personalizadas para um comprador autenticado
  com pelo menos um pedido concluído, O MÓDULO DE RECOMENDAÇÃO DEVERÁ combinar os atributos
  (técnica, artesão, região) dos produtos desse histórico e aplicar o mesmo cálculo de score do
  RF-01 sobre o catálogo elegível (RF-05).
- SE o comprador autenticado não possuir histórico suficiente (nenhum pedido concluído), ENTÃO O
  MÓDULO DE RECOMENDAÇÃO DEVERÁ acionar o critério de cold start (RF-03) no lugar da personalização.
- QUANDO uma lista personalizada for retornada, O MÓDULO DE RECOMENDAÇÃO DEVERÁ registrar essa
  recomendação (RF-06) com o critério `personalizado`.

## RF-03 — Cold start por popularidade

**História de usuário:** Como comprador novo (sem histórico) ou como sistema principal exibindo um
produto novo (sem dado de similaridade), quero receber uma lista de recomendações mesmo sem dado
prévio, para que a vitrine nunca fique sem sugestões.

**Critérios de aceitação:**

- QUANDO o marketplace solicitar cinco recomendações para um usuário sem histórico, O MÓDULO DE
  RECOMENDAÇÃO DEVERÁ retornar cinco itens elegíveis utilizando a estratégia de cold start definida
  no projeto (ranking por popularidade). *(Exemplo dado pelo professor.)*
- O MÓDULO DE RECOMENDAÇÃO DEVERÁ ranquear, para o critério de popularidade, os produtos elegíveis
  (RF-05) por número de unidades vendidas e/ou número de avaliações recebidas em um período
  configurável, do maior para o menor.
- SE não houver produto elegível algum no catálogo (ex.: nenhum produto ativo com estoque), ENTÃO O
  MÓDULO DE RECOMENDAÇÃO DEVERÁ retornar uma lista vazia, sem lançar erro de execução.

## RF-04 — Exposição via API

**História de usuário:** Como equipe de desenvolvimento do sistema principal, quero consumir o
módulo de recomendação por uma API HTTP com contrato estável, para integrá-lo ao frontend/backend
sem conhecer a estratégia interna de cálculo.

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ expor RF-01, RF-02 e RF-03 por meio de uma interface HTTP
  documentada (ver `design.md`), com contrato de entrada e saída estável (RNF-02).
- QUANDO o sistema principal fizer uma requisição válida à API do módulo, O MÓDULO DE RECOMENDAÇÃO
  DEVERÁ responder dentro do tempo definido em RNF-03.
- SE a requisição à API for inválida (parâmetro obrigatório ausente ou fora do formato esperado),
  ENTÃO O MÓDULO DE RECOMENDAÇÃO DEVERÁ responder com um erro identificável (ver `design.md`,
  seção de tratamento de erros), sem interromper o processo do consumidor.

## RF-05 — Exclusão de itens indisponíveis

**História de usuário:** Como comprador, não quero ver, entre as recomendações, produtos que eu não
possa comprar, para não ter uma experiência frustrante.

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ excluir de qualquer lista retornada todo produto com estoque
  igual a zero.
- O MÓDULO DE RECOMENDAÇÃO DEVERÁ excluir de qualquer lista retornada todo produto cujo status seja
  diferente de "ativo".

## RF-06 — Registro da recomendação exibida

**História de usuário:** Como administrador do Origem, quero que toda recomendação exibida fique
registrada, para poder auditar e, futuramente, avaliar a efetividade do módulo.

**Critérios de aceitação:**

- QUANDO o MÓDULO DE RECOMENDAÇÃO retornar uma lista de produtos (por qualquer critério — RF-01,
  RF-02 ou RF-03), ENTÃO O MÓDULO DE RECOMENDAÇÃO DEVERÁ registrar cada item recomendado com
  produto, comprador (quando autenticado), critério utilizado e score.
- O MÓDULO DE RECOMENDAÇÃO DEVERÁ manter esse registro em uma estrutura equivalente à tabela
  `recomendacao_log` do modelo de dados do projeto.

## RF-07 — Diversidade por artesão

**História de usuário:** Como comprador, quero ver recomendações de mais de um artesão, para não ter
minha descoberta de produtos limitada a um único vendedor.

**Critérios de aceitação:**

- ENQUANTO uma lista de recomendações estiver sendo montada (RF-01, RF-02 ou RF-03), O MÓDULO DE
  RECOMENDAÇÃO DEVERÁ limitar a no máximo 2 o número de produtos do mesmo artesão presentes na
  lista final, mesmo que produtos adicionais desse artesão tenham score maior que os de outros
  artesãos elegíveis.

## RF-08 — Parametrização do tamanho da lista

**História de usuário:** Como sistema principal, quero poder pedir uma quantidade específica de
recomendações, para adaptar o número de itens exibidos a cada tela.

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ aceitar um parâmetro de entrada opcional definindo o número de
  itens desejados.
- SE o parâmetro de quantidade não for informado, ENTÃO O MÓDULO DE RECOMENDAÇÃO DEVERÁ usar o valor
  padrão de 4 itens.
- SE o parâmetro de quantidade informado exceder 20, ENTÃO O MÓDULO DE RECOMENDAÇÃO DEVERÁ limitar
  a resposta a 20 itens.

## RF-09 — Motivo da recomendação exposto

**História de usuário:** Como sistema principal, quero saber por que cada produto foi recomendado,
para poder exibir essa explicação ao comprador, se a interface assim decidir.

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ incluir, para cada item da resposta, um campo de critério com um
  dos valores: `mesma-tecnica`, `mesmo-artesao`, `mesma-regiao`, `popularidade` ou `personalizado`.

---

## RNF-01 — Degradação graciosa

**Critérios de aceitação:**

- SE o MÓDULO DE RECOMENDAÇÃO estiver indisponível ou exceder o tempo limite de resposta (RNF-03),
  ENTÃO o sistema principal DEVERÁ continuar funcionando normalmente, exibindo a tela sem o bloco de
  recomendações, sem bloquear ou interromper a navegação do comprador.

## RNF-02 — Interface/contrato estável

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ manter o contrato de entrada e saída de sua API estável entre
  mudanças na estratégia interna de cálculo (ex.: troca de regras por outro modelo), sem exigir
  alteração no código do frontend ou do backend consumidor.

## RNF-03 — Tempo de resposta

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ responder em até 1 segundo, no percentil 95 (p95), para o volume
  atual do catálogo (dezenas a poucas centenas de produtos).

## RNF-04 — Uso de dados sintéticos/representativos

**Critérios de aceitação:**

- ENQUANTO o projeto estiver na fase de dados simulados (Fake API), O MÓDULO DE RECOMENDAÇÃO DEVERÁ
  operar exclusivamente sobre dados sintéticos/representativos gerados para o projeto, sem depender
  de dados reais de terceiros.

## RNF-05 — Privacidade dos dados de histórico

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ tratar o histórico de pedidos usado em RF-02 apenas internamente.
- SE a API do módulo for consultada, ENTÃO O MÓDULO DE RECOMENDAÇÃO DEVERÁ retornar apenas dados
  públicos de produto, nunca o histórico ou dado pessoal de qualquer comprador.

## RNF-06 — Auditabilidade do log

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ manter os registros de RF-06 consultáveis por período, critério
  ou produto, para permitir avaliação futura de efetividade.

## RNF-07 — Ambiente de execução

**Critérios de aceitação:**

- O MÓDULO DE RECOMENDAÇÃO DEVERÁ ser executável como serviço interno ao backend Node/Express do
  sistema principal, sem exigir infraestrutura própria adicional (cluster dedicado, GPU etc.) nesta
  fase.
