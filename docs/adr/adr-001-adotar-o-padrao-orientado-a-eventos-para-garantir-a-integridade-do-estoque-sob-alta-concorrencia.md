# ADR-001: Adotar o padrão Orientado a Eventos para garantir a integridade do estoque sob alta concorrência

- **Status:** Aceita
- **Data:** 2026-11-23
- **Autor:** DRIELLY SANTIAGO DOS SANTOS (dss3@cesar.school)
- **Turma:** Embarque (segundas)
- **Projeto:** Origem · marketplace da economia criativa e do artesanato de Pernambuco

## Contexto

O sistema Origem opera como um marketplace sob regime de pico de acessos, enfrentando concorrência onde múltiplos compradores tentam adquirir o mesmo produto simultaneamente. Atualmente, a prioridade máxima é garantir a integridade dos dados de estoque para evitar vendas duplicadas e inconsistências. No entanto, o cenário de processamento no checkout gera gargalos. Há um acordo com a equipe de desenvolvimento para mitigar esse impacto sem comprometer os prazos de entrega, apesar de haver preocupação com a complexidade de implementação de novos padrões.

## Preocupações

integridade dos dados, concorrência, consistência eventual, rastreabilidade, complexidade de depuração, latência de rede, desempenho, prazo, custo de mudança

## Decisão

Adotaremos o padrão Orientado a Eventos para o processamento de pedidos e atualização de estoque, utilizando processamento assíncrono e filas para gerenciar o fluxo de requisições. Com isso, isolamos as transações concorrentes e garantimos que apenas as unidades disponíveis sejam vendidas, retornando erro HTTP 409 caso o estoque se esgote, assumindo o custo da consistência eventual e de uma maior complexidade.

## Justificativa

O padrão Orientado a Eventos, aliado a processamento assíncrono, filas/intermediários e replicação de consumidores, atende diretamente ao cenário da etapa 2 ao organizar e serializar/tratar as requisições concorrentes sobre o mesmo item no estoque em momentos de pico. Isso evita condições de corrida que causariam estoque negativo ou vendas acima da quantidade disponível, garantindo que apenas a unidade real seja confirmada e que as demais requisições excedentes recebam resposta HTTP 409, preservando a integridade dos dados sem travar o fluxo principal.

## Consequências

Ganhos: Maior resiliência e escalabilidade sob pico de acessos, desacoplamento do processamento de pedidos/estoque e proteção contra vendas duplicadas ou estoque negativo, assegurando a integridade do que é vendido e recebido pelo comprador. Perdas: Maior complexidade de arquitetura e depuração de fluxos distribuídos/assíncronos, menor rastreabilidade imediata ponta a ponta, necessidade de lidar com consistência eventual e latência associada ao processamento via fila.

## Alternativas consideradas

Cliente-servidor foi considerado, mas descartado na prática para resolver o problema central de concorrência e escalabilidade sob pico no estoque, pois centraliza regras/dados em um ponto único de contenção e falha, adiciona latência de rede a cada operação e não resolve por si só a coordenação assíncrona de múltiplas compras simultâneas sobre o mesmo item.

## Rastreabilidade

**Atributo de qualidade:** Segurança (security) · Integridade

**Cenário que originou a decisão:**

> Pico, mais de um comprador pro mesmo produto varias requisições ao mesmo tempo para o mesmo item estoque. O sistema somente uma consegue o item e pra outra dá HTTP 409, A quantidade total de unidades vendidas não pode ultrapassar o estoque disponível. As compras sem estoque devem receber HTTP 409, e o estoque final deve ser zero quando todas as unidades disponíveis forem vendidas..

**Padrão arquitetural adotado:** Orientado a Eventos

**Táticas empacotadas:** Processamento assíncrono; Usar intermediário (barramento ou fila); Replicar consumidores para escalar

Módulos: checkout, pedidos e estoque. Cenários/fluxos: compra concorrente do mesmo item em pico com retorno HTTP 409 ao esgotar o estoque. Verificação: testes de carga/concorrência simulando múltiplas requisições simultâneas para o mesmo produto com estoque limitado.

## Verificação

- **Teste do cenário:** Teste automatizado de concorrência/carga simulando múltiplos compradores enviando requisições simultâneas para adquirir o mesmo produto com estoque limitado (ex.: 1 unidade) durante um cenário de pico. O teste passa se a quantidade total de vendas confirmadas não ultrapassar o estoque disponível, o estoque final chegar a zero quando todas as unidades forem vendidas, nenhuma venda excedente ocorrer e as requisições sem estoque retornarem HTTP 409.


## Nota de alinhamento com a implementação (24/11/2026)

Esta nota não muda a decisão acima; ela registra **como o padrão foi aplicado no código do Origem**, para o ADR não ser lido como descrição literal da baixa de estoque.

- **A baixa de estoque é síncrona e tem consistência forte, não eventual.** O checkout (`backend/src/services/checkout-seguro.service.js`) faz, numa única transação, `UPDATE produto SET estoque = estoque - :qtd WHERE id = :id AND estoque >= :qtd`, com os itens ordenados por `produto_id` para evitar deadlock. Se a linha não for atualizada, a transação é desfeita e a API responde **HTTP 409**. É isso que garante o cenário da seção Rastreabilidade: nunca se vende acima do estoque, e quem chega depois recebe 409 na hora, sem esperar uma fila.
- **O padrão orientado a eventos está nos efeitos do pedido.** Na mesma transação do pedido, a API grava eventos na fila `evento_assincrono` (avisos ao comprador e aos artesãos, processamento de imagem). O worker, outro processo, consome a fila com `FOR UPDATE SKIP LOCKED` e pode ter várias cópias, que é a tática "replicar consumidores". Se o pedido falhar, o evento nunca existe; se o worker cair, o evento espera na fila.
- **Por que a baixa não foi para a fila:** colocar o estoque atrás de uma fila obrigaria a responder "pedido recebido" antes de saber se havia saldo, com consistência eventual e compensação posterior. O relatório de FCCPD ([`RELATORIO.md`](../../RELATORIO.md), Parte 1, e [`fccpd-u2/RELATORIO.md`](../../fccpd-u2/RELATORIO.md), seção 1) descreve essa escolha e as alternativas descartadas.
- **Verificação:** o teste de concorrência descrito acima existe e passa: `npm run evidencias` no `backend/` dispara compras simultâneas do mesmo produto e confere estoque final zero, nenhuma venda excedente e 409 para as demais.

---

_Gerado pelo estudo dirigido de Arquitetura de Software · ADS020 · 2026.2._
