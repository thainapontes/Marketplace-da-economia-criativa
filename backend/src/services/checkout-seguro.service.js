// ============================================================================
// CHECKOUT SEGURO — a versão correta.
//
// Técnica: UPDATE CONDICIONAL ATÔMICO dentro de uma transação.
// Esta é a implementação da regra já documentada pela equipe na seção 7 de
// docs/Origem_DDL.md.
//
// Forma da transação:
//     BEGIN;
//     UPDATE produto SET estoque = estoque - :qtd
//      WHERE id = :id AND estoque >= :qtd;     -- 0 linhas => sem saldo
//     INSERT INTO pedido ...;
//     INSERT INTO item_pedido ...;
//     COMMIT;
// ============================================================================

import { comTransacao } from "../config/database.js";
import { explicarFalhaDeEstoque, gravarPedido } from "../repositories/pedido.repository.js";

export async function criarPedidoSeguro({ compradorId, enderecoEntrega, metodoPagamento, itens }) {
  // ------------------------------------------------------------------------
  // PREVENÇÃO DE DEADLOCK
  //
  // Deadlock = duas transações presas esperando uma pela outra. Acontece se a
  // Ana travar o produto 1 e depois pedir o 7, enquanto o Bruno trava o 7 e
  // depois pede o 1: cada um segura o que o outro precisa e nenhum avança.
  //
  // Ordenar os itens por produto_id faz TODAS as transações adquirirem os
  // locks na MESMA ordem. Deadlock exige um ciclo de espera; com ordem única o
  // ciclo é impossível, e a espera vira uma fila reta — que sempre anda.
  //
  // É o equivalente, em código, ao "ORDER BY id" quando se trava via SELECT.
  // ------------------------------------------------------------------------
  const itensOrdenados = [...itens].sort((a, b) => a.produtoId - b.produtoId);

  return comTransacao(async (cliente) => {
    const itensConfirmados = [];

    for (const item of itensOrdenados) {
      // --------------------------------------------------------------------
      // O CORAÇÃO DA SOLUÇÃO.
      //
      // Três decisões, cada uma essencial:
      //
      // 1) `SET estoque = estoque - $2` — a aplicação manda a OPERAÇÃO, não um
      //    valor que calculou antes. O banco lê o saldo no instante exato da
      //    escrita, então não existe valor vencido na mão da aplicação.
      //
      // 2) `AND estoque >= $2` no WHERE — conferir e escrever passaram a ser UM
      //    único comando SQL, e um comando SQL é atômico (indivisível). A
      //    janela entre "conferi" e "escrevi", onde a race condition morava,
      //    deixou de existir. Não há mais onde outra transação se encaixar.
      //
      // 3) O UPDATE toma automaticamente um LOCK DE LINHA sobre este produto,
      //    que dura até o COMMIT/ROLLBACK. Uma segunda compra do mesmo produto
      //    fica BLOQUEADA (não recebe erro: dorme na fila). Quando acorda, o
      //    PostgreSQL reavalia o WHERE contra a versão NOVA da linha — ela não
      //    reaproveita o valor que tinha visto antes de dormir. Se o saldo
      //    acabou, o WHERE falha e o UPDATE afeta 0 linhas.
      //
      // `RETURNING` traz de volta os dados da linha já atualizada, então não
      // precisamos de nenhum SELECT antes nem depois.
      // --------------------------------------------------------------------
      const baixa = await cliente.query(
        `UPDATE produto
            SET estoque       = estoque - $2,
                atualizado_em = now()
          WHERE id       = $1
            AND status   = 'ativo'
            AND estoque >= $2
          RETURNING id, artesao_id, preco, estoque`,
        [item.produtoId, item.quantidade],
      );

      // 0 linhas afetadas = a condição não bateu. Não é exceção do banco, é uma
      // resposta: "não deu". Lançamos o erro, o comTransacao dá ROLLBACK e a
      // API responde 409 Conflict.
      if (baixa.rowCount === 0) {
        throw await explicarFalhaDeEstoque(cliente, item.produtoId);
      }

      const linha = baixa.rows[0];
      itensConfirmados.push({
        produtoId: Number(linha.id),
        artesaoId: Number(linha.artesao_id),
        quantidade: item.quantidade,
        // NUMERIC chega como string para não perder precisão decimal.
        precoUnitario: Number(linha.preco),
        estoqueRestante: linha.estoque,
      });
    }

    // Só chegamos aqui se TODOS os itens tiveram baixa bem-sucedida.
    return gravarPedido(cliente, {
      compradorId,
      enderecoEntrega,
      metodoPagamento,
      itensConfirmados,
    });
  });
}
