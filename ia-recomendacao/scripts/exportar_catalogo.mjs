/**
 * Gera dados/catalogo.json a partir dos mocks do frontend, para que o módulo de IA
 * e a Fake API usem os mesmos ids de produto, artesão e usuário.
 *
 * Uso (Node 23+, que executa TypeScript sem compilar):
 *   node scripts/exportar_catalogo.mjs
 *
 * O professor não precisa rodar este script: o catalogo.json gerado já vem no repositório.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { produtosMock } from "../../frontend/src/mocks/produtos.mock.ts";
import { avaliacoesMock } from "../../frontend/src/mocks/avaliacoes.mock.ts";

const aqui = dirname(fileURLToPath(import.meta.url));

// Vendas sintéticas (a Fake API não guarda contagem de vendas). O produto 8 é muito vendido
// mas está sem estoque: serve para mostrar que o RF-04 vence a popularidade.
const vendas = { 1: 42, 2: 18, 3: 35, 4: 27, 5: 22, 6: 9, 7: 15, 8: 31, 9: 12, 10: 6, 11: 20 };

// Produto extra, só do catálogo da IA: desativado pelo artesão (status "inativo"), para o RF-04.
const produtoInativo = {
  id: 11,
  nome: "Jarro de Barro Pintado (fora de linha)",
  preco: 150,
  imagem: produtosMock[0].imagem,
  categoria: "Cerâmica",
  tecnica: "Cerâmica",
  regiao: "Agreste",
  artesao: "Maria das Graças Silva",
  artesaoId: 1,
  estoque: 4,
  status: "inativo",
};

// Histórico de compra reduzido a ids de produto (RNF-03: sem endereço nem pagamento).
// Vem de frontend/src/mocks/pedidos.mock.ts: a compradora Camila (usuário 1,
// comprador@origem.com.br) comprou os produtos 1 e 4 (PE-4821) e 3 (PE-4790).
const historico = { 1: [1, 4, 3] };

const usuarios = [1, 2, 3, 4, 5, 6];

function notaMedia(produtoId) {
  const notas = avaliacoesMock.filter((a) => a.produtoId === produtoId).map((a) => a.nota);
  if (notas.length === 0) return 0;
  return Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 100) / 100;
}

const produtos = [
  ...produtosMock.map((p) => ({
    id: p.id,
    nome: p.nome,
    preco: p.preco,
    imagem: p.imagem,
    categoria: p.categoria,
    tecnica: p.tecnica,
    regiao: p.regiao,
    artesao: p.artesao,
    artesaoId: p.artesaoId,
    estoque: p.estoque,
    status: p.status,
  })),
  produtoInativo,
].map((p) => ({ ...p, vendas: vendas[p.id] ?? 0, notaMedia: notaMedia(p.id) }));

const catalogo = { produtos, historico, usuarios };
const destino = join(aqui, "..", "dados", "catalogo.json");
writeFileSync(destino, JSON.stringify(catalogo, null, 2) + "\n", "utf-8");
console.log(`${produtos.length} produtos gravados em ${destino}`);
