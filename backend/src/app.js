// ============================================================================
// Aplicação Express do Origem — monta middlewares e rotas.
//
// Separado de server.js (que só abre a porta) para que os testes automatizados
// (testes/api/) chamem o app direto com supertest, sem subir servidor.
//
// Ordem importa:
//   1. CORS, cookies e leitura de JSON
//   2. rotas
//   3. rota não encontrada (404 em JSON)
//   4. tratador de erros (sempre por último)
// ============================================================================

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/env.js";
import { rotasLaboratorio } from "./routes/laboratorio.routes.js";
import { rotasAuth } from "./routes/auth.routes.js";
import { rotasUsuarios } from "./routes/usuarios.routes.js";
import { rotasFiltros } from "./routes/filtros.routes.js";
import { rotasProdutos } from "./routes/produtos.routes.js";
import { rotasArtesoes } from "./routes/artesoes.routes.js";
import { rotaNaoEncontrada, tratadorDeErros } from "./middlewares/erros.js";

export const app = express();

// O frontend roda em outra origem (porta 3000 / Vercel): sem CORS o navegador
// bloqueia as chamadas. Só as origens de CORS_ORIGEM são aceitas; chamadas sem
// cabeçalho Origin (curl, scripts de teste) não são afetadas.
// credentials: true deixa o navegador enviar e receber o cookie de sessão nessas
// origens (o frontend usa fetch com credentials: "include").
app.use(cors({ origin: config.origensPermitidas, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use(rotasLaboratorio);
app.use(rotasAuth);
app.use(rotasUsuarios);
app.use(rotasFiltros);
app.use(rotasProdutos);
app.use(rotasArtesoes);

app.use(rotaNaoEncontrada);
app.use(tratadorDeErros);
