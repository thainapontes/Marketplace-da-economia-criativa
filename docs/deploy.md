# Deploy do Origem

Onde cada parte fica, todas no plano gratuito:

| Parte | Onde | Arquivo de configuração |
|---|---|---|
| Banco PostgreSQL | **Neon** | nenhum (criado com `npm run banco:criar`) |
| API (Node/Express) | **Render**, serviço `origem-api` | [`render.yaml`](../render.yaml) |
| Módulo de IA (BentoML) | **Render**, serviço `origem-ia` | [`render.yaml`](../render.yaml) |
| Frontend (Next.js) | **Vercel** | [`frontend/next.config.mjs`](../frontend/next.config.mjs) (rewrite `/api`) |

O banco fica no Neon porque o Postgres gratuito do Render expira em 30 dias. O worker da fila roda
dentro da API (`WORKER_EMBUTIDO=true`) porque o Render não tem worker gratuito. Nada no código cita o
Render: tudo passa por variáveis de ambiente, então trocar de provedor só mexe no `render.yaml`.

## URLs publicadas

| Parte | URL |
|---|---|
| Site | *(a preencher depois do deploy)* |
| API | *(a preencher)*, com o Swagger em `/docs` |
| Módulo de IA | *(a preencher)*, com a documentação em `/api/docs` |

## Passo a passo

### 1. Banco no Neon

1. Crie um projeto no [Neon](https://neon.tech) e copie a *connection string*. Ela termina em
   `?sslmode=require`.
2. Crie as tabelas e o seed, de dentro de `backend/`:
   ```bash
   DATABASE_URL="postgres://...neon.tech/neondb?sslmode=require" npm run banco:criar
   ```
   Deve terminar com `Pronto: 13 produtos e 13 usuários.` Se o banco já tiver tabelas, o script não
   mexe em nada. Para recriar do zero, use `npm run banco:criar -- --apagar-tudo`.

### 2. API e IA no Render

1. No Render: **New → Blueprint**, escolha este repositório. Ele lê o `render.yaml` e cria os dois serviços.
2. O Render pede as variáveis marcadas com `sync: false`:
   - `DATABASE_URL`, nos dois serviços: a string do Neon;
   - `CORS_ORIGEM` (API) e `RECOMENDACAO_CORS` (IA): a URL do site na Vercel. Se ainda não existir,
     ponha qualquer valor e corrija no passo 4;
   - `RECOMENDACAO_URL` (API): a URL pública do `origem-ia`, por exemplo `https://origem-ia.onrender.com`.
     Ela aparece depois que o serviço é criado; dá para preencher em seguida.
3. Espere os dois builds. Para conferir:
   - `https://<api>/saude` responde `{"ok":true,...}`;
   - `https://<api>/docs` abre o Swagger;
   - `https://<ia>/api/produtos/1/recomendados` devolve 4 recomendações.

### 3. Frontend na Vercel

1. Importe o repositório na Vercel com **Root Directory = `frontend`**.
2. Variáveis de ambiente:
   - `API_URL` = a URL da API no Render. Ela liga o rewrite: o navegador chama `/api/...` no domínio do
     site, e a Vercel repassa para a API. Assim o cookie de sessão é do mesmo site;
   - `NEXT_PUBLIC_API_URL` = `/api` (usada pelos services quando a etapa G trocar a Fake API).
3. Faça o deploy e copie a URL do site.

### 4. Fechar o círculo

- No Render, ponha a URL da Vercel em `CORS_ORIGEM` (API) e em `RECOMENDACAO_CORS` (IA).
- Preencha a tabela de URLs no topo deste arquivo.

## Como testar o ambiente publicado

1. Abra a API e o site **alguns minutos antes** de uma apresentação: o serviço gratuito dorme depois de
   15 min sem acesso e leva cerca de 1 min para acordar.
2. `https://<api>/docs`: faça login com `comprador@origem.com.br` / `origem123` (`POST /auth/login`), use
   o token no **Authorize** e chame `GET /recomendacoes/eu`. Com a IA acordada, vem `"fonte": "ia"`; se
   ela ainda estiver dormindo, vem `"fonte": "popularidade"` em 2 s, que é o comportamento previsto (RF-08).
3. Fluxo completo no site: busca → carrinho → pedido → painel do artesão (`maria@origem.com.br`) →
   painel do admin (`admin@origem.com.br`). Na aba Network do navegador, `GET /api/produtos` mostra o
   cabeçalho `X-Cache` (`MISS` na primeira vez e `HIT` em seguida).
4. Fila: depois de um pedido, os logs da API no Render mostram o worker embutido processando os avisos
   (`✅ job ... [notificar_pedido] ok`).

## O que ainda falta confirmar no primeiro deploy (J.0)

- Se o BentoML cabe na memória do serviço gratuito (512 MB). Se não couber, as recomendações continuam
  funcionando pela popularidade da API, e a alternativa é subir a IA em outro provedor e trocar só a
  `RECOMENDACAO_URL`.
- Os logs da IA (`logs/*.jsonl`) ficam no disco do serviço, que é apagado a cada deploy ou quando o
  serviço dorme. Para a entrega de IA vale o log de exemplo do repositório
  ([`ia-recomendacao/exemplos/`](../ia-recomendacao/exemplos/)).
