# Módulo de IA do Origem: recomendação, sentimento e classificação

Projeto Final de IA Aplicada (U2), do grupo **Origem**, turma de ADS do 4º período, 2026.2.

O módulo é um serviço HTTP (BentoML com uma app FastAPI em `/api`, na porta 3001) que o
marketplace Origem consome. Ele faz três coisas, todas por **regra simples, sem treinar
modelo**:

- **recomendação** de produtos, por semelhança, histórico de compra e popularidade;
- **sentimento** das avaliações (positivo, neutro ou negativo), por léxico;
- **classificação** do produto numa categoria, por palavras-chave no nome e na descrição.

Os dados vêm do PostgreSQL do backend, lidos **só** pelas funções de `dados.py`, e cada
chamada vira uma linha no log `logs/uso_dados.jsonl`. O `resumo.py` lê esse log e responde às
perguntas (a), (b) e (c).

Sumário: [1. Instalar e rodar](#1-instalar-e-rodar) ·
[2. Dicionário de dados](#2-dicionário-de-dados) ·
[3. Funções de acesso](#3-funções-de-acesso) ·
[4. Gerar o log com três chamadas](#4-gerar-o-log-com-três-chamadas) ·
[5. Ver o resumo](#5-ver-o-resumo) ·
[6. Respostas (a), (b) e (c)](#6-respostas-a-b-e-c) ·
[7. Declaração de uso de IA](#7-declaração-de-uso-de-ia) ·
[Anexos](#anexos)

---

## 1. Instalar e rodar

Pré-requisitos: [uv](https://docs.astral.sh/uv/) (ele instala o Python 3.13 sozinho, se
faltar), Docker com Compose, `curl` e `python3`. O [just](https://github.com/casey/just) é
opcional: ao lado de cada atalho está o comando equivalente.

```bash
git clone https://github.com/thainapontes/Marketplace-da-economia-criativa.git
cd Marketplace-da-economia-criativa/backend
docker compose up -d        # PostgreSQL na porta 5434, já com o seed (os dados do módulo)
cd ../ia-recomendacao
uv sync                     # instala bentoml, fastapi e psycopg num .venv local
just serve                  # = uv run bentoml serve service:RecomendadorOrigem --port 3001
```

Deixe o `just serve` aberto e use outro terminal para o resto. Quando aparecer
`Starting production HTTP BentoServer`, o serviço está no ar. A documentação interativa das
rotas fica em <http://127.0.0.1:3001/api/docs>.

> **Porta 5434 ocupada?** Se o `docker compose up -d` reclamar de `port is already allocated`
> (outro PostgreSQL na máquina), suba o banco em outra porta e aponte o módulo para ela:
>
> ```bash
> ORIGEM_DB_PORTA=5440 docker compose up -d                                   # em backend/
> export DATABASE_URL=postgres://origem:origem@localhost:5440/origem          # antes do just serve
> ```
>
> O mesmo `DATABASE_URL` serve para um banco em qualquer outro endereço (padrão
> `postgres://origem:origem@localhost:5434/origem`). Para os comandos `psql` da seção 3, o
> `docker compose exec` não muda. **Sem banco nenhum**, o módulo funciona do mesmo jeito
> lendo o retrato `dados/catalogo.json` (é o caso difícil 6, abaixo), mas aí a experiência
> de mudar um dado não se aplica.

Para conferir tudo de uma vez, há dois atalhos. `just testes` (= `bash testes/casos.sh`) roda
10 casos HTTP com o serviço no ar e mostra OK ou FALHOU. `just testes-dados` roda os 39 testes
de unidade e precisa só do banco.

---

## 2. Dicionário de dados

**Fonte.** O seed do backend, [`backend/sql/02_seed.sql`](../backend/sql/02_seed.sql),
versionado no repositório: 13 produtos, 5 artesãs e artesãos (uma da Comunidade do Pilar),
7 compradores, 9 pedidos e 8 avaliações. **Todas as pessoas são fictícias**, e os e-mails usam
domínios fictícios (`origem.com.br`, `exemplo.com`). O módulo lê esses dados do PostgreSQL a
cada chamada, então um dado alterado no banco muda a próxima resposta (ver a
[seção 3](#mude-um-dado-e-veja-a-resposta-mudar)).

### Produto (o que `listar_produtos` e `buscar_produto` devolvem)

| Campo | Tipo | Significado | Origem no banco |
|---|---|---|---|
| `id` | inteiro | identificador do produto | `produto.id` |
| `nome` | texto | nome da peça | `produto.nome` |
| `descricao` | texto | descrição livre do artesão (vazia se não houver) | `produto.descricao` |
| `preco` | número | preço atual, em reais | `produto.preco` |
| `imagem` | texto | endereço da foto principal | `produto_imagem` (ordem 0, disponível) |
| `categoria` | texto | Cerâmica, Madeira, Renda ou Couro | `categoria.nome` |
| `tecnica` | texto | técnica artesanal (ex.: Barro Cozido, Renda Renascença) | `tecnica.nome` |
| `regiao` | texto | região de Pernambuco | `regiao.nome` |
| `artesao`, `artesaoId` | texto, inteiro | nome e id de quem fez a peça | `usuario.nome`, `produto.artesao_id` |
| `artesaoAprovado` | booleano | o cadastro do artesão foi aprovado pelo admin | `artesao.aprovado` |
| `estoque` | inteiro | unidades disponíveis (0 = esgotado) | `produto.estoque` |
| `status` | texto | `ativo` ou `inativo` | `produto.status` |
| `vendas` | inteiro | unidades vendidas em pedidos **não cancelados** | soma de `item_pedido.quantidade` |
| `notaMedia` | número | média das notas (1 a 5), ou 0 sem avaliação | média de `avaliacao_produto.nota` |

### Histórico de compra (`historico_do_usuario`)

Lista de ids de produto que o usuário comprou, sem repetir, na ordem da primeira compra.
Pedido cancelado não conta. **Não traz nada pessoal**: nem endereço, nem pagamento.

### Avaliação (`listar_avaliacoes`)

| Campo | Significado |
|---|---|
| `id`, `produtoId` | ids da avaliação e do produto |
| `nota` | 1 a 5 |
| `comentario` | texto livre, que a análise de sentimento lê |
| `criadoEm` | data e hora |

Quem avaliou **não sai** da função (RNF-03).

### Classificação gravada (`gravar_classificacao` → tabela `classificacao_produto`)

| Coluna | Significado |
|---|---|
| `produto_id` | produto classificado |
| `classe` | categoria que o texto sugere, ou `indefinida` |
| `confianca` | 0 a 1: a fatia da classe vencedora no total de pontos |
| `status` | `aprovado` (bate com a categoria do produto) ou `revisao` (o admin deve olhar) |

### Arquivos de dados da pasta

| Arquivo | O que é |
|---|---|
| `dados/catalogo.json` | **retrato** do banco (produtos, compradores, históricos, avaliações), usado quando o banco está fora do ar. Para regerar: `just retrato` |
| `dados/avaliacoes_rotuladas.json` | 36 avaliações com o sentimento dado à mão (8 do seed e 28 fictícias), para as métricas |
| `dados/produtos_rotulados.json` | 12 produtos fictícios com a categoria dada à mão, para as métricas |

### Casos difíceis, de propósito

| # | Caso | Onde está | O que o módulo faz |
|---|---|---|---|
| 1 | **ID inexistente** | produto 999, usuário 999 | a função devolve `None`, a rota responde 404 e o log registra `nao-encontrado` |
| 2 | **Usuário sem histórico** | compradora 13 (Lívia), que nunca comprou | a função devolve `[]` e a pessoa recebe só os mais populares |
| 3 | **Item sem semelhantes e sem histórico** | produto 13, sem venda e sem avaliação | popularidade 0; ele só aparece se alguém pedir um produto parecido |
| 4 | **Produto esgotado** | produto 8, estoque 0 | nunca é recomendado (RF-04) |
| 5 | **Pedido cancelado** | pedido 9 | não conta como compra nem como venda |
| 6 | **Banco fora do ar** | qualquer chamada | as funções leem o retrato `dados/catalogo.json` e o log registra `"fonte": "retrato"` |
| 7 | **Produto sem avaliação** | produto 13 | o sentimento devolve lista vazia, e não erro |

---

## 3. Funções de acesso

O módulo **só** chega aos dados por estas funções, todas em [`dados.py`](dados.py). Nem as
regras (`recomendador.py`, `sentimento.py`, `classificador.py`) nem o serviço HTTP escrevem SQL.

| Função | Devolve | Caso "não encontrado" |
|---|---|---|
| `listar_produtos()` | todos os produtos, inclusive inativos e esgotados | `[]` se o catálogo estiver vazio |
| `buscar_produto(produto_id)` | um produto | `None` se o id não existir |
| `historico_do_usuario(usuario_id)` | ids dos produtos comprados | `None` se o usuário não existir; `[]` se ele nunca comprou |
| `listar_avaliacoes(produto_id)` | avaliações do produto, da mais nova para a mais antiga | `None` se o produto não existir; `[]` se não tem avaliação |
| `listar_compradores()` | ids de todos os compradores | `[]` se não houver |
| `historicos_de_todos()` | `{usuario_id: [ids]}` de todos os compradores, numa consulta só (lote do FCCPD) | `{}` se não houver comprador |
| `gravar_classificacao(produto_id, classe, confianca, status)` | `{"id": ...}` da linha gravada; **é a única que escreve** | `None` se o produto não existir |

Toda chamada passa pelo decorador `@uso.registrado` ([`uso.py`](uso.py)), que grava a linha
do log. As rotas também registram uma linha própria (`recomendar_por_produto`,
`recomendar_por_usuario`, `sentimento_do_produto`, `classificar_produto`). Assim, uma chamada
HTTP aparece no log como a rota mais as funções de dados que ela usou.

### Mude um dado e veja a resposta mudar

Com o serviço no ar, peça as recomendações da compradora 13. Ela não tem histórico, então
recebe só os mais populares:

```bash
curl -s -H 'X-Usuario-Id: 13' "http://127.0.0.1:3001/api/usuarios/13/recomendados?limite=5" | python3 -c 'import json,sys; print([r["id"] for r in json.load(sys.stdin)["recomendacoes"]])'
```

```
[3, 11, 4, 1, 2]
```

Agora esgote o produto 3 no banco e repita **o mesmo** `curl`:

```bash
cd ../backend && docker compose exec -T postgres psql -U origem -c "UPDATE produto SET estoque = 0 WHERE id = 3" && cd ../ia-recomendacao
```

```
[11, 4, 1, 2, 9]
```

O produto 3 saiu da lista (RF-04: esgotado não é recomendado) e o 9 entrou no lugar dele, sem
reiniciar nem retreinar nada. Também dá para mexer numa nota: com
`UPDATE avaliacao_produto SET nota = 1 WHERE id = 4`, o produto 4 cai do 3º para o 5º lugar,
porque a popularidade usa a nota média. Para desfazer as duas mudanças:

```bash
cd ../backend && docker compose exec -T postgres psql -U origem -c "UPDATE produto SET estoque = 5 WHERE id = 3; UPDATE avaliacao_produto SET nota = 5 WHERE id = 4" && cd ../ia-recomendacao
```

---

## 4. Gerar o log com três chamadas

O log fica em **`ia-recomendacao/logs/uso_dados.jsonl`**. Ele é criado na primeira chamada, e
cada chamada acrescenta linhas no fim, sem apagar as anteriores. Com o serviço no ar, rode estas
três chamadas, de qualquer pasta:

```bash
# 1. peças parecidas com o produto 1 (caminho feliz)
curl -s "http://127.0.0.1:3001/api/produtos/1/recomendados?limite=4"

# 2. recomendações da compradora 13, que nunca comprou (caso difícil: sem histórico)
curl -s -H 'X-Usuario-Id: 13' "http://127.0.0.1:3001/api/usuarios/13/recomendados?limite=5"

# 3. produto que não existe (caso difícil: ID inexistente)
curl -s "http://127.0.0.1:3001/api/produtos/999/recomendados"
```

Depois, abra o log (de dentro de `ia-recomendacao/`):

```bash
tail -n 8 logs/uso_dados.jsonl
```

As três chamadas geram 8 linhas. Tirando o campo `duracao_ms`, e com outra data e hora, elas
ficam assim:

```json
{"data_hora": "2026-11-21T09:57:26-03:00", "funcao": "buscar_produto", "quem_chamou": "api", "parametros": {"produto_id": 1}, "fonte": "banco", "resultado": "sucesso", "registros": 1, "ids": [1]}
{"data_hora": "2026-11-21T09:57:26-03:00", "funcao": "listar_produtos", "quem_chamou": "api", "parametros": {}, "fonte": "banco", "resultado": "sucesso", "registros": 13}
{"data_hora": "2026-11-21T09:57:26-03:00", "funcao": "recomendar_por_produto", "quem_chamou": "api", "parametros": {"produto_id": 1, "limite": 4}, "fonte": "banco", "resultado": "sucesso", "registros": 4, "ids": [5, 9, 3, 11]}
{"data_hora": "2026-11-21T09:57:26-03:00", "funcao": "historico_do_usuario", "quem_chamou": "api", "parametros": {"usuario_id": 13}, "fonte": "banco", "resultado": "sucesso", "registros": 0, "ids": []}
{"data_hora": "2026-11-21T09:57:26-03:00", "funcao": "listar_produtos", "quem_chamou": "api", "parametros": {}, "fonte": "banco", "resultado": "sucesso", "registros": 13}
{"data_hora": "2026-11-21T09:57:26-03:00", "funcao": "recomendar_por_usuario", "quem_chamou": "api", "parametros": {"usuario_id": 13, "limite": 5}, "fonte": "banco", "resultado": "sucesso", "registros": 5, "ids": [3, 11, 4, 1, 2]}
{"data_hora": "2026-11-21T09:57:26-03:00", "funcao": "buscar_produto", "quem_chamou": "api", "parametros": {"produto_id": 999}, "fonte": "banco", "resultado": "nao-encontrado", "registros": 0}
{"data_hora": "2026-11-21T09:57:26-03:00", "funcao": "recomendar_por_produto", "quem_chamou": "api", "parametros": {"produto_id": 999, "limite": 4}, "fonte": "banco", "resultado": "nao-encontrado", "registros": 0}
```

**Três linhas que mostram o uso dos dados:**

- **linha 3:** a recomendação do produto 1 usou o catálogo e devolveu os produtos 5, 9, 3 e 11;
- **linha 4:** o histórico da compradora 13 foi consultado e veio vazio (`"registros": 0, "ids": []`),
  que é o caso "sem histórico";
- **linha 7:** o produto 999 foi procurado e não existe (`"resultado": "nao-encontrado"`).

### Campos de cada linha

| Campo | Significado |
|---|---|
| `data_hora` | quando a função foi chamada (hora local, com fuso) |
| `funcao` | nome da função de dados ou da rota |
| `quem_chamou` | `frontend`, `backend`, `teste`, `lote`, `script` ou `api` (chamada direta, sem identificação). Vem do header `X-Origem-Chamador` ou da variável `ORIGEM_CHAMADOR` |
| `parametros` | os argumentos da função, **só ids e números**: nenhum nome, e-mail ou texto livre |
| `fonte` | `banco` ou `retrato` (quando o banco estava fora do ar) |
| `resultado` | `sucesso`, `nao-encontrado` ou `erro` |
| `registros` | quantos registros a função devolveu |
| `ids` | quais registros voltaram. Fica de fora nas leituras em massa (`listar_produtos`, `listar_compradores`, `historicos_de_todos`), que devolvem a tabela inteira |
| `erro` | tipo e motivo do erro, só quando `resultado` = `erro` |
| `duracao_ms` | quanto tempo a chamada levou |

O arquivo [`exemplos/uso_dados.jsonl`](exemplos/uso_dados.jsonl) é um log completo, gerado com
as três chamadas acima, `just testes`, uma chamada de sentimento, uma de classificação, o lote
do FCCPD e uma leitura com o banco desligado. É dele que saem as respostas da seção 6.

> O log antigo, `logs/recomendacao_log.jsonl`, continua existindo. Ele é o registro de negócio
> da AV1 (uma linha por produto recomendado, RF-03) e alimenta a rota
> `/api/recomendacoes/metricas`. O log de uso pedido no Projeto Final é o `uso_dados.jsonl`.

---

## 5. Ver o resumo

```bash
just resumo                     # = uv run python resumo.py
```

O resumo sai em Markdown, com estas partes:

1. chamadas por função (sucesso, não encontrado, erro e registros devolvidos) e as funções nunca chamadas;
2. quem chamou e de onde vieram os dados (banco ou retrato);
3. os produtos mais usados e os **nunca usados**, com o motivo de cada um;
4. os erros, com o motivo e a hora;
5. as respostas (a), (b) e (c), escritas a partir dos números.

Para gravar num arquivo: `uv run python resumo.py --saida resumo.md`. Para resumir outro log:
`--log caminho.jsonl`. O resumo do log de exemplo está em
[`exemplos/resumo.md`](exemplos/resumo.md).

---

## 6. Respostas (a), (b) e (c)

As respostas saem de [`exemplos/resumo.md`](exemplos/resumo.md), o resumo do log de exemplo.

**(a) Qual dado o módulo mais usa?** O **catálogo de produtos**. `listar_produtos` foi chamada
7 vezes e devolveu 91 registros, muito mais que qualquer outra função, porque toda recomendação
lê o catálogo inteiro para comparar com a referência e calcular a popularidade. O registro mais
usado foi o **produto 1** (Cangaceiro de Barro), que aparece em 10 chamadas: ele é a referência
dos casos de teste e um dos mais vendidos.

*O que isso sugere:* com 13 produtos, ler tudo a cada chamada custa pouco (de 15 a 30 ms por leitura, pelo `duracao_ms` do log).
Com milhares de produtos, essa seria a primeira coisa a otimizar, com cache do catálogo ou com
as listas calculadas em lote, que é o que o `lote.py` do FCCPD já faz.

**(b) Algum dado nunca foi usado, e o que isso sugere?** Sim, três produtos, cada um por um
motivo:

- **produto 8** (Cinto de Vaqueiro): está **esgotado**, então nunca é recomendado. Aqui "nunca
  usado" é a regra funcionando (RF-04);
- **produto 10** (Painel Entalhado): **não tem venda nem avaliação**. É o arranque a frio: a
  popularidade não ajuda produto novo, e ele só aparece se alguém pedir um parecido. Isso
  sugere reservar algum espaço para novidades na vitrine;
- **produto 6** (Escultura Cabra do Sertão): está elegível e já vendeu, mas nenhuma chamada
  pediu algo parecido com ele. Isso sugere que os casos de teste se concentram em poucos produtos.

Também nunca foram chamadas `listar_compradores` (só o `exportar.py` usa) e
`gravar_classificacao` (só o `just classificar` usa), e 5 dos 7 compradores nunca tiveram
recomendação pedida.

**(c) Houve erro, e por quê?** Sim, **1 erro**: `TimeoutError: passou de 2 s (RF-08)`, em
`recomendar_por_produto`. Foi o caso 4 de `just testes`, que simula lentidão de propósito
(header `X-Simular-Falha: lentidao`). O serviço respondeu 503 em 2 s em vez de deixar o
cliente esperando, que é o comportamento pedido. Além disso, duas coisas aparecem no log sem
ser erro:

- **6 chamadas "não encontrado"** (produto e usuário 999). A resposta certa para elas é 404
  (RF-02), e o log separa esse caso do erro;
- **1 leitura veio do retrato** (`"fonte": "retrato"`), porque o banco estava desligado. A
  resposta saiu do mesmo jeito.

---

## 7. Declaração de uso de IA

O módulo foi desenvolvido com o **Claude Code** (Anthropic), como copiloto, desde a AV2 de IA.
Na U2, a IA escreveu: as funções de acesso ao Postgres e o retrato JSON (`dados.py`,
`exportar.py`), o log de uso (`uso.py`), o resumo (`resumo.py`), a análise de sentimento e a
classificação por regra (`sentimento.py`, `classificador.py`), as métricas (`metricas.py`,
`METRICAS.md`), os testes (`testes/`) e este README. Os textos fictícios dos conjuntos rotulados
e os rótulos também foram propostos pela IA e revisados pela equipe.

Foram decisões da equipe: o que o módulo faz (as três funções e o uso delas no marketplace), as
regras de negócio da AV1 (pesos, limite por artesão, timeout de 2 s), ler os dados do mesmo
banco do backend e o que entra em cada entrega. Todos os números deste README e do
`METRICAS.md` saíram de execuções reais e foram conferidos pela equipe, que é responsável por
entender e defender o código. O registro completo do projeto fica em
[`docs/uso-de-ia.md`](../docs/uso-de-ia.md).

---

## Anexos

### Rotas

| Rota | O que faz |
|---|---|
| `GET /api/produtos/{id}/recomendados?limite=` | peças parecidas (RF-01, RF-02, RF-04, RF-05, RF-07); limite padrão 4 |
| `GET /api/usuarios/{id}/recomendados?limite=` | pelo histórico de compra (RF-06); exige `X-Usuario-Id` igual ao id (senão 401 ou 403); limite padrão 8 |
| `GET /api/produtos/{id}/sentimento` | sentimento de cada avaliação e o resumo do produto |
| `GET /api/produtos/{id}/classificacao` | categoria sugerida pelo texto, confiança e status (é uma prévia: não grava) |
| `GET /api/recomendacoes/metricas?de=&ate=` | quantidade de recomendações por critério num período (RNF-07) |

Em todas: id inexistente = 404; falha ou mais de 2 s = 503 com `{"erro": ...}` (RF-08).

### Como a aplicação Web usa o módulo

O site do Origem não chama o módulo direto: ele pede à API (`backend/`), e a API chama estas rotas com o
usuário do login no `X-Usuario-Id` e `X-Origem-Chamador: backend`. Por isso, no log, as chamadas do site
aparecem com `quem_chamou: backend`.

| Tela do site | Rota da API | Rota do módulo |
|---|---|---|
| Produto, "Peças relacionadas" | `GET /recomendacoes/produtos/{id}` | `/api/produtos/{id}/recomendados` |
| Início, "Escolhidos para você" | `GET /recomendacoes/eu` | `/api/usuarios/{id}/recomendados` |
| Produto, selo de sentimento nas avaliações | `GET /produtos/{id}/sentimento` | `/api/produtos/{id}/sentimento` |
| Admin, "Classificação (IA)" | `GET /admin/classificacoes` | `/api/produtos/{id}/classificacao` |

Se o módulo cair ou passar de 2 s, a API responde mesmo assim: as recomendações viram os mais vendidos e
o sentimento e a classificação voltam como `fonte: "indisponivel"`. Evidências em
[`evidencias-u2/`](../evidencias-u2/README.md) (`02-recomendacao.txt`, `04-sentimento-classificacao.txt`
e `07-log-uso-ia-trecho.jsonl`).

### Métricas dos três modelos

A interpretação está em [`METRICAS.md`](METRICAS.md), e os números completos em
[`resultados/metricas.md`](resultados/metricas.md), gerados por `just metricas`. Em resumo: a
recomendação tem 80% de acerto@3 (contra 40% só com popularidade), o sentimento acerta 50% no
conjunto de teste (contra 42% chutando sempre "positivo") e a classificação acerta 75% no teste.
Nos 3 erros da classificação, a resposta foi "indefinida", e nunca uma categoria errada.

### Regras

- **Similaridade (RF-01):** mesmo artesão +3, mesma técnica +2, mesma região +1.
- **Histórico (RF-06):** técnica de algum item comprado +2, categoria +1; o que já foi comprado não volta.
- **Popularidade (RF-07):** `0,7 × vendas / maior venda + 0,3 × nota média / 5`. Ela completa as listas.
- **Elegibilidade (RF-04)** e **no máximo 2 por artesão (RNF-06)** valem para todas as listas.
- **Sentimento:** léxico sem acento, expressões de várias palavras, negação até 3 palavras
  antes, intensificador 1,5×, atenuador 0,5× e peso 1,5× depois de "mas" ou "porém". Acima de
  +0,5 é positivo, abaixo de -0,5 é negativo, e o resto é neutro.
- **Classificação:** palavra-chave no nome vale 2 pontos, e na descrição vale 1; a confiança é a
  fatia da vencedora. Empate ou nada encontrado dá `indefinida`. Confiança abaixo de 0,6 ou
  classe diferente da categoria do produto dá `revisao`.

### Arquivos

| Arquivo | Papel |
|---|---|
| `service.py` | serviço BentoML com as rotas REST (FastAPI em `/api`) |
| `dados.py` | funções de acesso, a única porta para os dados |
| `uso.py` | log de uso: decorador `@registrado` e `logs/uso_dados.jsonl` |
| `resumo.py` | resumo do log e respostas (a), (b), (c) (`just resumo`) |
| `recomendador.py`, `sentimento.py`, `classificador.py` | as três regras, em funções puras |
| `metricas.py` | métricas dos três modelos (`just metricas`) |
| `classificar.py` | classifica o catálogo e grava em `classificacao_produto` (`just classificar`) |
| `lote.py` | recalcula as recomendações de todos os compradores em paralelo (FCCPD U2) |
| `exportar.py` | regera o retrato `dados/catalogo.json` (`just retrato`) |
| `testes/` | `casos.sh` (10 casos HTTP) e os testes de unidade de dados, log, sentimento e classificação |
| `exemplos/` | o log de exemplo e o resumo dele |

### Decisões

- **Rotas REST em vez de `@bentoml.api`:** a AV1 especifica `GET` com id no caminho e erros com
  `{"erro": ...}`. Uma app FastAPI montada no BentoML (`@bentoml.asgi_app`) mantém esse contrato.
- **Porta 3001**, porque a 3000 é do frontend Next.js.
- **Login simulado** pelo header `X-Usuario-Id`, e **falha simulada** pelo header
  `X-Simular-Falha: erro | lentidao`, que existe só para demonstrar o RF-08.
- **Log best-effort:** se o disco falhar, a resposta sai mesmo assim.
- **Fora do escopo:** as metas de desempenho do RNF-01 e do RNF-05 (p95 de 300 ms com 10.000
  produtos) não foram medidas aqui. O paralelismo está medido no
  [relatório do FCCPD U2](../fccpd-u2/RELATORIO.md).

### Empacotar (opcional)

`just imagem` gera o Bento e a imagem Docker `recomendador-origem:av2`, e `just serve-container`
sobe a mesma API na porta 3001.
