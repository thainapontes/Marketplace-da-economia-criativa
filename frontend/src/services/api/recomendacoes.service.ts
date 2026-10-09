import type { Produto } from "@/types/produto";
import { produtosService } from "./produtos.service";
import { pedidosService } from "./pedidos.service";
import { delay } from "./client";

/**
 * Endereço do módulo de recomendação (ia-recomendacao/, serviço BentoML). Sem a variável,
 * o frontend continua só com o cálculo local — é o caso do deploy na Vercel.
 */
const URL_MODULO_IA = process.env.NEXT_PUBLIC_RECOMENDACAO_URL;
const TIMEOUT_MS = 2000; // RF-08 / RNF-02

interface RespostaModulo {
  recomendacoes: { id: number; criterio: string; score: number }[];
}

/** Pede ao módulo de IA; erro, 404 ou timeout são tratados por quem chama. */
async function viaModuloIA(caminho: string, headers?: HeadersInit): Promise<Produto[]> {
  const resposta = await fetch(`${URL_MODULO_IA}/api/${caminho}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!resposta.ok) throw new Error(`módulo de recomendação respondeu ${resposta.status}`);
  const { recomendacoes } = (await resposta.json()) as RespostaModulo;

  // O módulo decide a ordem; os dados exibidos vêm da Fake API (preço e estoque atuais).
  const todos = await produtosService.listarTodos();
  return recomendacoes
    .map((item) => todos.find((produto) => produto.id === item.id))
    .filter((produto): produto is Produto => produto !== undefined);
}

/**
 * Recomendação simples por similaridade de atributos (mesma técnica, artesão ou região),
 * equivalente ao critério registrado em `recomendacao_log` no modelo de dados (docs/Origem_DDL.md).
 * Fica como contingência quando o módulo de IA não está configurado ou não responde.
 */
async function calculoLocal(produtoId: number, limite: number): Promise<Produto[]> {
  const todos = await produtosService.listarTodos();
  const referencia = todos.find((produto) => produto.id === produtoId);
  if (!referencia) return delay([]);

  const pontuados = todos
    .filter((produto) => produto.id !== produtoId)
    .map((produto) => {
      let score = 0;
      if (produto.artesaoId === referencia.artesaoId) score += 3;
      if (produto.tecnica === referencia.tecnica) score += 2;
      if (produto.regiao === referencia.regiao) score += 1;
      return { produto, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((item) => item.produto);

  return delay(pontuados);
}

/**
 * Contingência do RF-06: técnica (+2) e categoria (+1) dos itens já comprados, a partir dos
 * pedidos da Fake API. Sem histórico devolve lista vazia e a seção não aparece.
 */
async function historicoLocal(email: string, limite: number): Promise<Produto[]> {
  const pedidos = await pedidosService.listarPorCliente(email);
  const comprados = pedidos.flatMap((pedido) => pedido.itens.map((item) => item.produto));
  if (comprados.length === 0) return [];

  const idsComprados = new Set(comprados.map((produto) => produto.id));
  const tecnicas = new Set(comprados.map((produto) => produto.tecnica));
  const categorias = new Set(comprados.map((produto) => produto.categoria));
  const todos = await produtosService.listarTodos();

  return todos
    .filter((produto) => !idsComprados.has(produto.id) && produto.status === "ativo" && produto.estoque > 0)
    .map((produto) => ({
      produto,
      score: (tecnicas.has(produto.tecnica) ? 2 : 0) + (categorias.has(produto.categoria) ? 1 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((item) => item.produto);
}

/** Hooks/componentes continuam vendo apenas `Produto[]`, venha a lista do módulo de IA ou do cálculo local. */
export const recomendacoesService = {
  async recomendarSimilares(produtoId: number, limite = 4): Promise<Produto[]> {
    if (URL_MODULO_IA) {
      try {
        return await viaModuloIA(`produtos/${produtoId}/recomendados?limite=${limite}`);
      } catch {
        // RF-08: módulo fora do ar, lento ou sem o produto (ex.: recém-cadastrado no painel) —
        // a página segue com o cálculo local, sem mostrar erro ao comprador.
      }
    }
    return calculoLocal(produtoId, limite);
  },

  /** RF-06: recomendações para o comprador logado (página inicial). */
  async recomendarParaUsuario(usuarioId: number, email: string, limite = 4): Promise<Produto[]> {
    if (URL_MODULO_IA) {
      try {
        // Autenticação simulada, como no restante da Fake API: o módulo recebe o id do usuário logado.
        return await viaModuloIA(`usuarios/${usuarioId}/recomendados?limite=${limite}`, {
          "X-Usuario-Id": String(usuarioId),
        });
      } catch {
        // RF-08: segue com o histórico local, sem mostrar erro.
      }
    }
    return historicoLocal(email, limite);
  },
};
