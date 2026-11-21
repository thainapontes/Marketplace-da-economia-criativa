// ============================================================================
// Cria o banco do Origem num PostgreSQL vazio (ex.: o Neon, em produção).
//
// Localmente quem faz isso é o docker compose: ele roda os arquivos de sql/ na
// primeira subida. Num banco gerenciado não há esse gatilho, então este script
// roda os MESMOS arquivos, na mesma ordem (a ordem alfabética, igual à do
// Docker: 01_schema, 01b_extensoes_u2, 02_seed, 03_fila).
//
// Uso:
//   DATABASE_URL="postgres://...neon.tech/origem?sslmode=require" npm run banco:criar
//
// Se o banco já tiver as tabelas, o script PARA sem mexer em nada. Para apagar
// tudo e recriar do zero (perde pedidos, cadastros e avaliações feitos lá):
//   DATABASE_URL=... npm run banco:criar -- --apagar-tudo
// ============================================================================

import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL (o endereço do banco onde criar as tabelas).");
  process.exit(1);
}

const PASTA = new URL("../sql/", import.meta.url);
const arquivos = readdirSync(PASTA).filter((nome) => nome.endsWith(".sql")).sort();
const apagarTudo = process.argv.includes("--apagar-tudo");

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  const { rows } = await cliente.query("SELECT to_regclass('public.usuario') IS NOT NULL AS existe");
  if (rows[0].existe && !apagarTudo) {
    console.error("O banco já tem as tabelas do Origem. Nada foi feito.");
    console.error("Para apagar tudo e recriar: npm run banco:criar -- --apagar-tudo");
    process.exitCode = 1;
  } else {
    if (apagarTudo) {
      console.log("Apagando o schema public inteiro…");
      await cliente.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    }
    for (const nome of arquivos) {
      console.log(`Rodando sql/${nome}…`);
      await cliente.query(readFileSync(new URL(nome, PASTA), "utf8"));
    }
    const { rows: contagem } = await cliente.query(
      "SELECT (SELECT COUNT(*) FROM produto)::int AS produtos, (SELECT COUNT(*) FROM usuario)::int AS usuarios",
    );
    console.log(`Pronto: ${contagem[0].produtos} produtos e ${contagem[0].usuarios} usuários.`);
  }
} finally {
  await cliente.end();
}
