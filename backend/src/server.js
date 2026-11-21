// ============================================================================
// API HTTP do Origem — ponto de entrada.
//
// Só abre a porta. Middlewares e rotas estão em src/app.js; as rotas do
// FCCPD U1 em src/routes/laboratorio.routes.js; o contrato completo em docs/api.md.
//
// Subir:  npm run api    (e, em outro terminal, npm run worker)
// Produção no Render: WORKER_EMBUTIDO=true roda o worker da fila aqui dentro
// (o plano gratuito não tem processo de worker separado).
// ============================================================================

import { app } from "./app.js";
import { config } from "./config/env.js";
import { pool } from "./config/database.js";

const servidor = app.listen(config.porta, () => {
  console.log(`API do Origem ouvindo em http://localhost:${config.porta} (Swagger em /docs)`);
  console.log(`Checkout de POST /pedidos: ${config.checkoutIngenuo ? "INGÊNUO (com race condition)" : "SEGURO"}`);
  console.log(`CORS liberado para: ${config.origensPermitidas.join(", ")}`);
  console.log(`Worker da fila: ${config.workerEmbutido ? "EMBUTIDO nesta API" : "separado (npm run worker)"}`);
});

const worker = config.workerEmbutido ? (await import("./worker.js")).iniciarWorker() : null;

// Desligamento gracioso: o Render manda SIGTERM a cada deploy. Para de aceitar
// requisições, deixa o worker terminar o job que está na mão e fecha o banco.
let saindo = false;
for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, async () => {
    if (saindo) return;
    saindo = true;
    console.log(`Recebi ${sinal}: encerrando a API…`);
    await new Promise((pronto) => servidor.close(pronto));
    if (worker) await worker.parar();
    await pool.end();
    process.exit(0);
  });
}
