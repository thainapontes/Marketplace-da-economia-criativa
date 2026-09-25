import type { FiltrosProduto, NovoProduto, Produto } from "@/types/produto";
import { produtosMock } from "@/mocks/produtos.mock";
import { normalizeText } from "@/utils/normalizeText";
import { delay, ApiError } from "./client";
import { artesoesService } from "./artesoes.service";

// Cópia mutável em memória: permite simular criação/edição de produtos (painel do artesão)
// durante a sessão, sem precisar de um backend real ainda (isso chega na Avaliação 2).
const produtos: Produto[] = [...produtosMock];
let proximoId = Math.max(...produtos.map((produto) => produto.id)) + 1;

export const produtosService = {
  async listarTodos(): Promise<Produto[]> {
    return delay([...produtos]);
  },

  async buscarPorId(id: number): Promise<Produto> {
    const produto = produtos.find((item) => item.id === id);
    if (!produto) {
      await delay(null, 300);
      throw new ApiError(`Produto ${id} não encontrado.`);
    }
    return delay(produto);
  },

  async filtrar(filtros: FiltrosProduto): Promise<Produto[]> {
    const busca = filtros.busca ? normalizeText(filtros.busca) : "";
    const resultado = produtos.filter((produto) => {
      const combinaRegiao = !filtros.regiao || filtros.regiao === "Todas" || produto.regiao === filtros.regiao;
      const combinaTecnica = !filtros.tecnica || filtros.tecnica === "Todas" || produto.tecnica === filtros.tecnica;
      const combinaCategoria = !filtros.categoria || filtros.categoria === "Todas" || produto.categoria === filtros.categoria;
      const combinaArtesao = !filtros.artesaoId || produto.artesaoId === filtros.artesaoId;
      const textoAlvo = normalizeText(`${produto.nome} ${produto.artesao} ${produto.tecnica}`);
      const combinaBusca = !busca || textoAlvo.includes(busca);
      return combinaRegiao && combinaTecnica && combinaCategoria && combinaArtesao && combinaBusca;
    });
    return delay(resultado);
  },

  async criar(dados: NovoProduto): Promise<Produto> {
    const artesao = await artesoesService.buscarPorIdInterno(dados.artesaoId);
    const produto: Produto = {
      ...dados,
      id: proximoId++,
      artesao: artesao?.nome ?? "Artesão Origem",
      imagens: [dados.imagem],
      status: "ativo",
    };
    produtos.unshift(produto);
    return delay(produto, 400);
  },

  /** Edita um produto já publicado (painel do artesão). */
  async atualizar(id: number, dados: NovoProduto): Promise<Produto> {
    const produto = produtos.find((item) => item.id === id);
    if (!produto) {
      await delay(null, 300);
      throw new ApiError(`Produto ${id} não encontrado.`);
    }
    Object.assign(produto, dados, { imagens: [dados.imagem] });
    return delay(produto, 350);
  },

  /** Remove um produto do catálogo (painel do artesão). */
  async remover(id: number): Promise<void> {
    const indice = produtos.findIndex((item) => item.id === id);
    if (indice === -1) {
      await delay(null, 250);
      throw new ApiError(`Produto ${id} não encontrado.`);
    }
    produtos.splice(indice, 1);
    await delay(null, 300);
  },
  async removerEstoque(itens: { produtoId: number; quantidade: number }[]): Promise<void> {
    for (const item of itens) {
      if (!Number.isInteger(item.quantidade) || item.quantidade <= 0) {
        throw new ApiError("A quantidade deve ser um número inteiro maior que zero.");
      }

      const produto = produtos.find((atual) => atual.id === item.produtoId);

      if (!produto || produto.estoque < item.quantidade) {
        throw new ApiError(`Estoque insuficiente para o produto ${item.produtoId}.`);
      }
    }

    itens.forEach((item) => {
      const produto = produtos.find((atual) => atual.id === item.produtoId)!;
      produto.estoque -= item.quantidade;
    });

    await delay(null, 200);
  },
  /**
   * Inverso de removerEstoque — devolve as unidades ao catálogo. Usado quando um pedido
   * confirmado é cancelado, para que as peças voltem a ficar disponíveis para venda.
   * Ignora silenciosamente itens de produto que não existem mais (ex.: removido do
   * catálogo depois do pedido), em vez de falhar o cancelamento por causa disso.
   */
  async devolverEstoque(itens: { produtoId: number; quantidade: number }[]): Promise<void> {
    itens.forEach((item) => {
      const produto = produtos.find((atual) => atual.id === item.produtoId);
      if (produto) {
        produto.estoque += item.quantidade;
      }
    });
    await delay(null, 200);
  },
};
