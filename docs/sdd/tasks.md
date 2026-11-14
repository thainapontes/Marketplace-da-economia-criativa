<!--
NOTA DE SUPOSIÇÃO: o enunciado da atividade (Orientações.md) diz que o planejamento SDD tem
"quatro arquivos em Markdown", mas nomeia explicitamente apenas requirements.md, design.md e
product.md — o texto do quarto item aparenta estar cortado no arquivo fonte. Este tasks.md foi
criado como suposição razoável (fecha o ciclo requirements → design → tasks do Spec-Driven
Development). Confirme com o professor se o nome/conteúdo esperado é este antes da entrega final.
-->

# tasks.md — Módulo de Recomendação de Produtos (Origem)

Lista de tarefas de implementação derivadas de `requirements.md` e `design.md`, rastreadas aos
requisitos que atendem. Segue a ordem de dependência técnica (dados → estratégias → API →
integração → observabilidade).

## 1. Modelagem e acesso a dados

- [ ] 1.1 Confirmar que o schema de `docs/Origem_DDL.md` (tabelas `produto`, `item_pedido`,
      `pedido`, `recomendacao_log`) está criado no ambiente de desenvolvimento.
      _Requisitos: RF-01, RF-03, RF-04, RF-06, RF-07_
- [ ] 1.2 Implementar o repositório de leitura de produtos elegíveis (ativos, com estoque),
      com uma única consulta de candidatos por requisição e os índices já previstos no DDL
      (`idx_produto_filtros`).
      _Requisitos: RF-04, RNF-05_
- [ ] 1.3 Implementar o repositório de escrita em `recomendacao_log` (inserção em lote por
      resposta, `usuario_id` opcional).
      _Requisitos: RF-03, RNF-04_

## 2. Estratégias de recomendação

- [ ] 2.1 Implementar `EstrategiaAtributo` (baseline): pontuação por mesmo artesão (peso 3),
      mesma técnica (peso 2), mesma região (peso 1), ordenação decrescente.
      _Requisitos: RF-01_
- [ ] 2.2 Implementar `EstrategiaPopularidade` (fallback): ranking por quantidade vendida
      (`item_pedido`) e/ou nota média, usado quando o baseline não preenche o `limite`.
      _Requisitos: RF-07_
- [ ] 2.3 Implementar `EstrategiaHistorico`: seleção de categorias/técnicas já compradas por um
      usuário autenticado a partir de `pedido`/`item_pedido`.
      _Requisitos: RF-06_
- [ ] 2.4 Implementar o `FiltroElegibilidade`, aplicado ao final de qualquer estratégia (remove
      o produto de referência, inativos e sem estoque).
      _Requisitos: RF-04_
- [ ] 2.5 Implementar a regra de limite de repetição por artesão na mesma lista de saída (no
      máximo 2 produtos do mesmo artesão por lista).
      _Requisitos: RNF-06_

## 3. API REST

- [ ] 3.1 Implementar `GET /produtos/:id/recomendados` (parâmetros `id`, `limite`; padrão do
      `limite` = 4; erro 404 se o produto não existir; erro 400 se `limite` não for inteiro
      entre 1 e 20; corpo JSON com `produtoReferenciaId` e `recomendacoes`).
      _Requisitos: RF-02, RF-05_
- [ ] 3.2 Implementar `GET /usuarios/:id/recomendados`, com padrão de `limite` = 8 e
      verificação de autorização por proprietário (401 sem autenticação; 403 se o `id` não for do
      usuário autenticado).
      _Requisitos: RF-06_
- [ ] 3.3 Compor, no controller, a ordem de chamada das estratégias (histórico → atributo →
      popularidade) e acionar o registrador de log de forma *best-effort* (RF-03) sem bloquear a
      resposta em caso de falha na escrita do log.
      _Requisitos: RF-01, RF-03, RF-06, RF-07_
- [ ] 3.4 Adicionar tratamento de erro interno e de timeout de 2 segundos retornando `503`, sem
      expor stack trace.
      _Requisitos: RF-08, RNF-02_
- [ ] 3.5 Medir e documentar o tempo de resposta (p95 de até 300 ms) no ambiente de avaliação,
      com catálogo sintético de 10.000 produtos.
      _Requisitos: RNF-01_

## 4. Integração com o frontend

- [ ] 4.1 Trocar o corpo de `recomendacoesService.recomendarSimilares` para consumir
      `GET /produtos/:id/recomendados` via `fetch`, mantendo a mesma assinatura já usada pelos
      hooks/componentes (sem reescrever telas).
      _Requisitos: RF-02_
- [ ] 4.2 Implementar `recomendacoesService.recomendarParaUsuario`, consumindo
      `GET /usuarios/:id/recomendados`, e o bloco "Para você" na página inicial.
      _Requisitos: RF-06_
- [ ] 4.3 Tratar erro/indisponibilidade no hook (`useRecomendacoes`) ocultando a seção de
      recomendações em vez de propagar erro bloqueante para a tela.
      _Requisitos: RF-08, RNF-02_

## 5. Observabilidade e validação

- [ ] 5.1 Criar consulta agregada (ou view) sobre `recomendacao_log` por `criterio` e período,
      para uso futuro em indicadores do painel administrativo.
      _Requisitos: RNF-07_
- [ ] 5.2 Validar com massa de dados sintética: produto sem nenhum atributo em comum com outros
      (aciona popularidade), usuário sem histórico (aciona popularidade), usuário com histórico
      (aciona recomendação personalizada).
      _Requisitos: RF-01, RF-06, RF-07_
- [ ] 5.3 Validar cada critério de aceitação EARS de `requirements.md` manualmente ou com teste
      automatizado, registrando o resultado.
      _Requisitos: todos_

## 6. Documentação

- [ ] 6.1 Atualizar `docs/api.md` do repositório com o contrato final das duas rotas REST.
      _Requisitos: RF-02, RF-06_
- [ ] 6.2 Registrar no `docs/uso-de-ia.md` do repositório qualquer uso adicional de IA
      generativa durante a implementação deste módulo.
      _Requisitos: não se aplica — exigência transversal da disciplina_
