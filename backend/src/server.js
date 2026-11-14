// ============================================================================
// API HTTP do Origem — ponto de entrada.
//
// Só abre a porta. Middlewares e rotas estão em src/app.js; as rotas do
// FCCPD U1 em src/routes/laboratorio.routes.js; o contrato completo em docs/api.md.
//
// Subir:  npm run api    (e, em outro terminal, npm run worker)
// ============================================================================

import { app } from "./app.js";
import { config } from "./config/env.js";

app.listen(config.porta, () => {
  console.log(`API do Origem ouvindo em http://localhost:${config.porta}`);
  console.log(`Checkout de POST /pedidos: ${config.checkoutIngenuo ? "INGÊNUO (com race condition)" : "SEGURO"}`);
  console.log(`CORS liberado para: ${config.origensPermitidas.join(", ")}`);
});
