# Plano de implementação da U2 — Origem

> Plano da equipe para a Unidade 2. Contrato da API: [`docs/api.md`](api.md). SDD do módulo de recomendação: ver o README.
> Status de cada grupo de rotas: tabela "Status da implementação" em `docs/api.md`.

**Data:** 14/11/2026 · **Versão:** 1.1, validada (ver seção final) · **Base:** documento de requisitos do PI 2026.2 e levantamento do que já existia no repositório
**Prazos que guiam a ordem:** FCCPD P2 **24/11** · IA Projeto Final **27/11** · Web projeto **02/12**
(17/11 e 26/11 são atividades individuais ou em dupla de Web, fora do PI: não há etapa para elas, só tempo reservado.)

**Cadeiras:** `WEB` Desenvolvimento Web · `FCCPD` Concorrente/Distribuída · `IA` IA Aplicada · `REQ` Requisitos
(BD e Projetos 4 servem só de base: nenhuma etapa é para elas.)

**Quem:** Everton = backend/API e IA · Thainá = frontend · Drielly = SQL/seed · Ana = testes e aceite.

---

## Regras para todas as etapas

- **Um PR por etapa**, branch `feat/u2-<etapa>-<nome>`, aberto por quem fez a etapa.
- **Commits pequenos**, cada um deixando os testes passando. Padrão: `tipo(escopo): descrição` em português (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`).
- **Pronto:** `npm test` verde + (se mexer em checkout ou fila) bateria do FCCPD U1 com saída 0 + relatório da etapa + linha nova na seção 8.4 do Plano de Testes.
- **Commits de outras pessoas são delas.** As etapas da Thainá (G) e os commits de code smells (K) **precisam sair da conta de cada integrante**. Eu ajudo a preparar, mas não faço o commit por elas.
- **Filtro de escopo:** se algo não está no documento do PI nem na rubrica, não entra.

---

## Mapa geral

| Etapa | Nome | Cadeira | Quem | Depende de | Janela |
|---|---|---|---|---|---|
| 0 | Merge do PR #9 + ajustes de documentação | WEB · REQ | Everton | — | 15/11 |
| A | Migração para o Prisma e as camadas | WEB · REQ | Everton | 0 | 15–16/11 |
| B | Login por cookie | WEB | Everton | A | 16/11 |
| H1 | IA: funções de acesso e dados | IA · FCCPD | Everton | 0 | 17–18/11 |
| I | FCCPD P2: paralelismo, benchmark e relatório | FCCPD | Everton | H1 | 18–23/11 |
| D | Carrinho, pedidos e notificação | WEB · FCCPD | Everton | A, B | 22–23/11 |
| H2 | IA: log, resumo, sentimento, classificação, README | IA | Everton | H1 | 24–26/11 |
| C | Painel do artesão + cache | WEB | Everton | A | 27/11 |
| E | Avaliações, admin e recomendação pela API | WEB · IA · FCCPD | Everton | D | 28/11 |
| F | Swagger | WEB | Everton | C, D, E | 29/11 |
| G | Frontend ligado à API | WEB | **Thainá** | 0 (leitura), B, D, C, E | 15–30/11 em paralelo |
| J | Deploy (J.0 de teste em 21/11; final em 29–30/11) | WEB | Everton + Thainá | B, D | 21/11 e 29–30/11 |
| K | Desafio de code smells | REQ | **cada integrante** | A | 25–30/11 |
| L | Fechamento: README, vídeo e entrega | WEB · REQ | todos | tudo | 30/11–02/12 |

```
15/11 ─ 0 ─ A ─ B ─ H1 ─ I (FCCPD) ─ J.0 ─ D (pedidos) ─ H2 (IA) ─ C ─ E ─ F ─ J ─ L ─► 02/12 WEB
                                 └► 24/11 FCCPD      └► 27/11 IA
G (Thainá): começa em 15/11 com a leitura do catálogo e acompanha B, D, C e E
K (todos): code smells entre 25 e 30/11
```

### Agenda do Everton, dia a dia
| Dia | Etapa |
|---|---|
| dom 15/11 | 0, A.1–A.3 |
| seg 16/11 | A.4–A.6, B |
| ter 17/11 | atividade individual de Web · H1.1–H1.2 |
| qua 18/11 | H1.3–H1.5 |
| qui 19/11 | I.1–I.2 |
| sex 20/11 (feriado) | I.3 (benchmark) |
| sáb 21/11 | I.4–I.5 · **J.0: deploy de teste** (cookie e frio do Render) |
| dom 22/11 | folga do FCCPD (ensaio oral) · D.6, D.1, D.2 |
| seg 23/11 | D.3–D.5, D.7 |
| **ter 24/11** | **entrega FCCPD** · H2.1–H2.2 |
| qua 25/11 | H2.3–H2.5 |
| qui 26/11 | atividade em dupla de Web · H2.6 |
| **sex 27/11** | **entrega IA** · C |
| sáb 28/11 | E |
| dom 29/11 | F, J.1–J.2 |
| seg 30/11 | J.3–J.4, validação no ambiente publicado |
| ter 01/12 | L, vídeo |
| **qua 02/12** | **entrega Web** |

**Por que D vem antes de C:** o fluxo de ponta a ponta (busca → carrinho → pedido) vale 35% na Web e é o que a Thainá mais precisa ligar no frontend. O painel do artesão pode ficar para depois sem travar ninguém.

---

## Etapa 0 — Merge do PR #9 e ajustes de documentação · `WEB` `REQ`
**Por quê:** libera a Thainá para trocar a leitura do catálogo (resposta 1).
**Ações:** revisar e mergear o PR #9 (sem novo código).

| # | Commit | Arquivos |
|---|---|---|
| 0.1 | `docs: indica docs/sdd como versão oficial do SDD` | aviso no topo de `docs/modulo-recomendacao/*.md` + README |
| 0.2 | `docs: plano de implementação da U2` | `docs/plano-u2.md` (cópia deste plano, para a equipe ver no repositório) |

**Validação:** `npm test` (53) depois do merge, na `main`.

---

## Etapa A — Migração para o Prisma e as camadas · `WEB` `REQ` (refatoração)
**Por quê:** stack e estrutura pedidas pelo professor (resposta 2). É uma **refatoração justificada** para o REQ: comportamento preservado, provado pelos 53 testes.
**Regras:** `prisma db pull` (sem `migrate`); um arquivo por recurso em cada camada; funções simples, sem classes. SQL à mão só no checkout seguro, na fila e na busca sem acento.

| # | Commit | O que muda |
|---|---|---|
| A.1 | `chore(backend): adiciona Prisma e gera o schema a partir do banco` | `prisma/schema.prisma` (via `db pull`), `src/config/prisma.js`, `package.json` |
| A.2 | `refactor(backend): organiza pastas em config, routes, controllers, services, repositories e utils` | move `app.js`, `config.js`, `validacao.js`, `erros.js`; sem mudar comportamento |
| A.3 | `refactor(backend): autenticação e usuários nas camadas com Prisma` | `routes/`, `controllers/`, `services/`, `repositories/usuarios.repository.js` |
| A.4 | `refactor(backend): catálogo nas camadas com Prisma` | produtos, artesãos, filtros, avaliações; a busca sem acento fica em `$queryRaw` |
| A.5 | `refactor(backend): checkout e fila usam o client do Prisma` | `$transaction` + SQL original; rotas do laboratório mantidas |
| A.6 | `docs(backend): explica a nova estrutura e onde o SQL à mão foi mantido` | `backend/README.md`, `docs/arquitetura.md` (seção do backend) |

**Validação:** 53 testes iguais + bateria FCCPD U1 (saída 0, evidências intactas).
**Também:** registrar a refatoração na seção 8.6 do Plano de Testes.

---

## Etapa B — Login por cookie · `WEB`
**Por quê:** "JWT e cookies" (resposta 4: o Bearer continua aceito).

| # | Commit | O que muda |
|---|---|---|
| B.1 | `feat(auth): envia o JWT em cookie httpOnly no login e no cadastro` | `cookie-parser`, cookie `SameSite=Lax`, CORS com `credentials` |
| B.2 | `feat(auth): aceita token pelo cookie ou pelo cabeçalho Bearer` | middleware de autenticação |
| B.3 | `feat(auth): adiciona POST /auth/sair` | apaga o cookie |
| B.4 | `test(auth): cobre login por cookie e saída` | ~5 testes |

**Validação:** `npm test` + login pelo navegador (cookie aparece no DevTools).

---

## Etapa H1 — IA: funções de acesso e dados · `IA` (base do `FCCPD`)
**Por quê:** a rubrica de IA pede funções de acesso (30 pts), e o paralelismo do FCCPD usa essas funções (respostas 9 e 12).

| # | Commit | O que muda |
|---|---|---|
| H1.1 | `feat(seed): adiciona artesã da Comunidade do Pilar e mais histórico de compras` | `02_seed.sql`: 1 artesão do Pilar, 2–3 produtos, pedidos de mais compradores (resposta 15) |
| H1.2 | `feat(ia): funções de acesso aos dados do Postgres` | `ia-recomendacao/dados.py`: `buscar_produto`, `listar_produtos`, `historico_do_usuario`, `listar_avaliacoes`, cada uma tratando "não encontrado" |
| H1.3 | `refactor(ia): recomendador lê os dados só pelas funções de acesso` | `recomendador.py`, `service.py`, `treino.py` |
| H1.4 | `feat(ia): usa o JSON exportado quando o banco está fora do ar` | caso difícil documentado |
| H1.5 | `test(ia): casos de produto e usuário inexistentes nas funções de acesso` | `testes/casos.sh` |

**Validação:** `casos.sh` + mudar um preço no banco e ver a resposta mudar.

---

## Etapa I — FCCPD Parte 2 · `FCCPD` · **entrega 24/11**
**Por quê:** distribuição (2,4) + paralelismo com ganho (2,1) + benchmark (1,5) (respostas 12 e 13).

| # | Commit | O que muda |
|---|---|---|
| I.1 | `feat(ia): recalcula recomendações de todos os usuários em lote, sequencial ou paralelo` | `ia-recomendacao/lote.py` com `ProcessPoolExecutor`, opção `--processos N` |
| I.2 | `feat(seed): gera usuários e compras sintéticos para o teste de carga` | script separado (não altera a vitrine) |
| I.3 | `test(fccpd): benchmark sequencial × paralelo` | `fccpd-u2/benchmark.py`: 1, 2 e 4 processos × 5 repetições; CSV com os resultados |
| I.4 | `docs(fccpd): relatório da Parte 2 com diagrama e justificativa dos serviços` | `fccpd-u2/RELATORIO.md`: diagrama (API, worker, IA, banco), por que cada serviço existe, onde está o trecho paralelo, metodologia, resultados, interpretação |
| I.5 | `docs(fccpd): evidências da comunicação entre os serviços` | `fccpd-u2/evidencias/`: logs de API → fila → worker e de API/front → IA |

**Validação:** benchmark roda do zero com um comando; ganho medido em números.
**Entrega:** link do repositório no Classroom + apresentação oral.

---

## Etapa C — Painel do artesão + cache · `WEB` (etapa 1.3 do plano antigo) · 27/11
| # | Commit | O que muda |
|---|---|---|
| C.1 | `feat(produtos): artesão cria, edita e desativa os próprios produtos` | `POST/PUT/DELETE /produtos` (desativar = `status inativo`) |
| C.2 | `feat(artesoes): indicadores do artesão pela view vw_indicadores_artesao` | `GET /artesoes/eu/indicadores` |
| C.3 | `feat(cache): cache em memória da vitrine e dos filtros` | `utils/cache.js` (`Map` + 60 s), limpo em C.1 |
| C.4 | `test(produtos): permissões do dono, validação e cache` | ~15 testes |

---

## Etapa H2 — IA: log, resumo, sentimento e README · `IA` · **entrega 27/11**
| # | Commit | O que muda |
|---|---|---|
| H2.1 | `feat(ia): registra toda chamada no log, com função, parâmetros, registros e sucesso ou erro` | `log.jsonl`, uma linha por chamada, inclusive erros; "quem chamou" = backend, frontend ou script (sem dado pessoal) |
| H2.2 | `feat(ia): script de resumo do log` | `resumo.py`: chamadas por função, erros, registros mais e nunca consultados, respostas (a), (b) e (c) |
| H2.3 | `feat(ia): análise de sentimento por regra nas avaliações` | lista de palavras + negação; rota `GET /produtos/{id}/sentimento` |
| H2.4 | `feat(ia): métricas do sentimento com avaliações rotuladas à mão` | ~20 avaliações rotuladas; acurácia, precisão, recall |
| H2.5 | `feat(ia): classificação de produtos por palavras-chave, com métricas` | grava em `classificacao_produto` (classe + confiança); acurácia contra a categoria real |
| H2.5b | `docs(ia): interpretação das métricas dos três modelos` | recomendação (já existe `/recomendacoes/metricas`), sentimento e classificação: o que os números dizem (a rubrica do PI pede "métricas de cada modelo interpretadas") |
| H2.6 | `docs(ia): README na ordem pedida pela rubrica` | instalar e rodar → dicionário de dados → funções → 3 chamadas reproduzíveis → resumo → (a)(b)(c) → uso de IA; inclui o passo "mude o preço/a nota de um produto e veja a resposta mudar" |

**Validação:** a autoavaliação da rubrica: alguém de fora, só com o README, carrega os dados, chama 3 vezes, abre o log e aponta 3 linhas.

---

## Etapa D — Carrinho, pedidos e notificação · `WEB` `FCCPD` (etapa 1.4) · 22–23/11
| # | Commit | O que muda |
|---|---|---|
| D.1 | `feat(carrinho): carrinho do usuário logado salvo no banco` | `GET/PUT/DELETE /carrinho` sobre `carrinho` e `item_carrinho` (resposta 5) |
| D.2 | `feat(pedidos): checkout pelo contrato, reaproveitando o checkout seguro` | `POST /pedidos` (comprador do token, preço do banco, frete, previsão) |
| D.3 | `feat(pedidos): lista e detalhe de pedidos conforme o perfil` | `GET /pedidos`, `GET /pedidos/:codigo` |
| D.4 | `feat(pedidos): artesão muda status e cancelamento devolve estoque` | `PATCH /pedidos/:codigo/status` |
| D.5 | `feat(fila): notifica o artesão quando entra pedido com item dele` | `enfileirar(...)` no service de pedido (resposta 7) |
| D.6 | `test(fccpd): scripts da U1 fazem login antes do checkout` | `teste-concorrencia.js`, `teste-deadlock.js` |
| D.7 | `test(pedidos): fluxo de checkout, permissões e transições` | ~20 testes (fluxo crítico exigido pelo REQ) |

**Validação:** `npm test` + bateria FCCPD U1 (o maior risco, porque `/pedidos` é a mesma rota da U1).

---

## Etapa E — Avaliações, admin e recomendação pela API · `WEB` `IA` `FCCPD` (etapa 1.5) · 28/11
| # | Commit | O que muda |
|---|---|---|
| E.1 | `feat(avaliacoes): comprador avalia produto uma vez` | `POST /produtos/:id/avaliacoes` (409 na segunda) |
| E.2 | `feat(admin): indicadores e aprovação de artesãos` | `/admin/indicadores`, `/admin/artesoes/pendentes`, aprovar e rejeitar |
| E.3 | `test(admin): permissões e regras de aprovação` | ~12 testes |
| E.4 | `feat(recomendacoes): backend repassa as recomendações do módulo de IA com o usuário do token` | `GET /recomendacoes/...` na API chama a IA (timeout 2 s, cai para popularidade). Hoje o frontend chama a IA direto e manda o usuário num cabeçalho que qualquer um forja (`X-Usuario-Id`); passando pelo backend, o usuário vem do login. Também é comunicação real API → IA para o FCCPD |
| E.5 | `test(recomendacoes): repasse, usuário do token e queda da IA` | ~5 testes |

---

## Etapa F — Swagger · `WEB`
| # | Commit | O que muda |
|---|---|---|
| F.1 | `docs(api): especificação OpenAPI de todas as rotas` | `backend/openapi.yaml`, escrito à mão a partir de `docs/api.md` |
| F.2 | `feat(api): Swagger UI em /docs` | `swagger-ui-express` |

---

## Etapa G — Frontend ligado à API · `WEB` · **Thainá** (commits na conta dela)
Cada commit troca um service mantendo as assinaturas (as telas não mudam).

| # | Commit | Libera quando |
|---|---|---|
| G.1 | `feat(front): client apiFetch com URL da API e cookie` + rewrite `/api` na Vercel | já (15/11) |
| G.2 | `feat(front): catálogo, artesãos e avaliações vindos da API` | já (PR #9) |
| G.3 | `feat(front): login, cadastro (com região) e sessão pela API` | depois de B |
| G.4 | `feat(front): carrinho sincronizado com o servidor no login` | depois de D.1 |
| G.5 | `feat(front): checkout e pedidos pela API` | depois de D |
| G.6 | `feat(front): painel do artesão pela API` | depois de C |
| G.7 | `feat(front): painel admin, avaliações e recomendações pela API` | depois de E (recomendações passam a chamar `/api/recomendacoes`, não a IA direto) |
| G.8 | `refactor(front): remove a Fake API e os mocks` | no fim |

**Apoio:** a Ana faz o smoke test e o aceite por persona a cada commit que entrar.

---

## Etapa J — Deploy · `WEB`
| # | Commit | O que muda |
|---|---|---|
| J.0 | (sem commit) deploy de teste em 21/11 | sobe a API da etapa B no Render + banco no Neon para testar cookie, CORS e partida a frio cedo |
| J.1 | `feat(worker): opção de rodar o worker dentro da API em produção` | variável `WORKER_EMBUTIDO=true` (**obrigatório**: o Render não tem worker gratuito) |
| J.2 | `chore(deploy): configuração do Render para API e IA` | `render.yaml` (2 web services gratuitos); banco no **Neon** |
| J.3 | `chore(front): aponta o rewrite /api para o backend publicado` | `next.config.mjs` + variáveis na Vercel |
| J.4 | `docs: URLs publicadas e como testar` | README |

**Validação:** fluxo completo **no ambiente publicado** (busca → carrinho → pedido → painel), exigido pela rubrica.
**Restrições do plano gratuito (conferidas em 14/11 na documentação do Render):**
- *Background worker* **não** tem plano gratuito → J.1 é obrigatório.
- O Postgres gratuito do Render **expira em 30 dias** (e é apagado 14 dias depois) → usar o **Neon** (gratuito, não expira) para o banco.
- O serviço gratuito **dorme após 15 min sem acesso** e leva ~1 min para acordar. Antes da apresentação, abrir o site e a API alguns minutos antes. O timeout de 2 s da recomendação cai para popularidade enquanto a IA acorda (já previsto no RNF-02).
- São 750 horas gratuitas por mês para o workspace inteiro. Com o serviço dormindo quando ninguém usa, 2 serviços cabem.
- **Ainda a confirmar no J.0:** se o BentoML cabe na memória do serviço gratuito.

**Decisão (14/11):** mantido Render (API e IA) + Neon (banco). Alternativas avaliadas: Vercel para a API, Railway (pago, cerca de US$ 5/mês), Fly.io, Koyeb, Hugging Face e VM da Oracle.
**Para poder trocar depois sem retrabalho:**
- Tudo que depende do provedor fica em **variáveis de ambiente** (`DATABASE_URL`, `JWT_SECRET`, `RECOMENDACAO_URL`, `CORS_ORIGEM`, `WORKER_EMBUTIDO`). O código não cita o Render em lugar nenhum.
- O banco no **Neon** é independente da hospedagem: trocar o host da API não mexe nos dados.
- Arquivos específicos do Render: só o `render.yaml`. No frontend, só a URL do rewrite.
- Se um dia a API for para um provedor sem processo fixo (ex.: Vercel), a única adaptação é o worker (processar a fila logo após a resposta). Para Railway ou VM, basta desligar `WORKER_EMBUTIDO` e subir o worker separado, como no local.

---

## Etapa K — Desafio de code smells · `REQ` · **cada integrante**
Cada pessoa faz o **próprio** commit, na **própria** conta, na própria camada (resposta 17). Eu ajudo a apontar o smell e a técnica.

| Quem | Camada | Commit (exemplo de formato) |
|---|---|---|
| Everton | backend | `refactor(backend): <smell> em <arquivo> — <técnica>` |
| Thainá | frontend | `refactor(front): <smell> em <arquivo> — <técnica>` |
| Drielly | SQL/seed | `refactor(sql): <smell> em <arquivo> — <técnica>` |
| Ana | testes | `refactor(testes): <smell> em <arquivo> — <técnica>` |
| (quem coordenar) | — | `docs(refatoracao): registra smells, decisões e casos sem refatoração` → `docs/refatoracao/smells.md` |

**Validação:** testes passando depois de cada commit (comportamento preservado).
**Entrega:** link do repositório com os commits individuais identificados.

---

## Etapa L — Fechamento · `WEB` `REQ`
| # | Commit | O que muda |
|---|---|---|
| L.1 | `docs: README com arquitetura, execução, tecnologias e deploy` | README da raiz reorganizado |
| L.2 | `docs: arquitetura da U2` | `docs/arquitetura.md` com front, API, worker, IA e banco |
| L.3 | `docs: uso de IA na U2` | `docs/uso-de-ia.md` |
| L.4 | `chore: atualiza .env.example` | Prisma, cookie, URL da IA, worker embutido |
| L.5 | `docs: evidências da U2 de banco, recomendação e processamento assíncrono` | `evidencias-u2/`: prints e logs do ambiente publicado (entregável obrigatório da Web). A pasta `evidencias/` da U1 não é tocada |

**Fora do Git:** vídeo do fluxo com a aba Network aberta · Plano de Testes v2.2 (revisão final) · relatório de validação contra os critérios de aceitação · envio no Forms (02/12).

---

## Resumo de commits por cadeira

| Cadeira | Etapas | Commits (aprox.) |
|---|---|---|
| WEB | 0, A, B, C, D, E, F, G, J, L | ~45 |
| FCCPD | I (+ D.5, D.6) | ~7 |
| IA | H1, H2 (+ E.1 alimenta o sentimento) | ~11 |
| REQ | K (+ A como refatoração, + testes de cada etapa) | 4 individuais + 1 registro |

## Riscos do plano
1. **A (Prisma) atrasar** e empurrar o FCCPD. Mitigação: se passar de 16/11, as rotas da U1 ficam em SQL e só a parte nova vai para o Prisma.
2. **D quebrar a U1**, porque `/pedidos` é a mesma rota. Mitigação: D.6 antes de D.2 e a bateria completa no PR.
3. **Frontend dependente do backend.** Mitigação: G começa já com a leitura (PR #9). O resto acompanha B, D e E.
4. **Deploy no último dia.** Mitigação: J.0 (deploy de teste em 21/11).
5. **Carga do Everton.** A agenda tem uma etapa por dia sem folga entre 22/11 e 01/12. Se algo atrasar, sai primeiro o que vale menos: E.2 (admin) e C.3 (cache) ficam simples, H2.5 (classificação) vira opcional. **Nunca** cortar D (fluxo de ponta a ponta, 35%) nem o log da IA (H2.1–H2.2, 30 pts).

---

## Validação do plano (14/11/2026)

### Cobertura: todo item cobrado tem etapa?
| Exigência (doc 02) | Etapa |
|---|---|
| Web — vitrine, busca, filtros, produto, artesão | PR #9 + G.2 |
| Web — carrinho persistido | D.1 + G.4 |
| Web — pedido criado e confirmado | D.2–D.4 + G.5 |
| Web — cadastro, login, sessão, rotas protegidas, perfis | 1.1 (feito) + B + G.3 |
| Web — painel do artesão (catálogo, estoque, pedidos) | C + D.4 + G.6 |
| Web — painel admin (gestão básica e indicadores) | E.2 + G.7 |
| Web — recomendação integrada | já existe + E.4 + G.7 |
| Web — assíncrono com necessidade real | D.5 |
| Web — cache | C.3 |
| Web — API documentada (Swagger) | F |
| Web — deploy e banco de produção | J |
| Web — Prisma, camadas, JWT e cookies | A, B |
| Web — vídeo com aba Network, README, .env.example, evidências, uso de IA | L (+ L.5) |
| FCCPD — arquitetura distribuída, diagrama, justificativa | I.4 (+ E.4: API → IA) |
| FCCPD — paralelismo com ganho; benchmark | I.1–I.3 |
| FCCPD — evidência de comunicação | I.5 |
| IA — dados, caso difícil, dicionário | H1.1, H1.4, H2.6 |
| IA — funções de acesso, "não encontrado", mudar dado muda resposta | H1.2–H1.3, H1.5, H2.6 |
| IA — log por chamada + resumo (a)(b)(c) | H2.1–H2.2 |
| IA — README na ordem | H2.6 |
| PI/IA — classificação, sentimento, métricas interpretadas | H2.3–H2.5b |
| REQ — testes automatizados, fluxos críticos (checkout, cadastro) | testes de cada etapa (D.7, 1.1) |
| REQ — resultados registrados | seção 8.4 a cada etapa |
| REQ — refatorações justificadas | A (+ 8.6) e K |
| REQ — validação contra critérios de aceitação | L (fora do Git) |
| REQ — 1 commit individual por integrante | K |

### Lacunas encontradas e já corrigidas nesta versão
1. **Faltavam as evidências da U2** (entregável obrigatório da Web) → criado L.5.
2. **Faltavam as métricas da classificação** (o PI pede métricas de *cada* modelo) → H2.5 com métricas + H2.5b de interpretação.
3. **Recomendação personalizada confiava num cabeçalho forjável** → E.4 (backend repassa com o usuário do login).
4. **O README da IA não dizia como mostrar que "mudar um dado muda a resposta"** → incluído em H2.6.
5. **D vinha depois de C e no meio da semana da IA** → D passou para 22–23/11, antes da IA; C foi para 27/11.
6. **As etapas I e C se sobrepunham (20–22/11)** → agenda dia a dia, uma frente por vez.
7. **Premissas de deploy erradas:** worker gratuito não existe e o Postgres gratuito do Render expira → J.1 obrigatório e banco no Neon.
8. **Deploy só no fim** → J.0 em 21/11.

### O que continua sem confirmação
- Se o BentoML cabe na memória do serviço gratuito do Render (testar no J.0).
- Qualquer atividade de professor fora do documento do PI.

Fonte das restrições do Render: [Deploy for Free (documentação do Render)](https://render.com/docs/free).
