// ============================================================================
// CHECKOUT INGÊNUO — a versão COM O BUG. Mantida de propósito.
//
// NÃO USE ISTO EM PRODUÇÃO. Este arquivo existe para o teste comparativo da
// Etapa 3: é a prova de que a race condition é real e mensurável, e não uma
// preocupação teórica.
//
// É o mesmo padrão que estava no frontend do Origem, em
// frontend/src/services/api/produtos.service.ts (removerEstoque): confere o
// estoque numa passada e só depois escreve, em outra.
//
// O padrão se chama "check-then-act" (confere, depois age) e a falha que ele
// produz se chama "lost update" (atualização perdida).
//
// Note que ESTE CÓDIGO ESTÁ DENTRO DE UMA TRANSAÇÃO e continua errado. É a
// demonstração de que transação, sozinha, NÃO resolve concorrência: no nível de
// isolamento padrão do PostgreSQL (READ COMMITTED), duas transações conseguem
// ler o mesmo saldo antes de qualquer uma escrever. Transação protege contra
// falha no meio do caminho, não contra concorrência.
// ============================================================================

import { comTransacao } from "../config/database.js";
import { EstoqueInsuficiente, ProdutoInexistente, gravarPedido } from "../repositories/pedido.repository.js";

export async function criarPedidoIngenuo({ compradorId, enderecoEntrega, metodoPagamento, itens }) {
  // Sem ordenação por id — de propósito. Além da race condition de estoque,
  // esta versão também está sujeita a deadlock quando dois carrinhos contêm os
  // mesmos produtos em ordens diferentes.
  return comTransacao(async (cliente) => {
    const itensConfirmados = [];

    for (const item of itens) {
      // --------------------------------------------------------------------
      // PASSO 1 — LÊ o estoque.
      // Este SELECT não trava nada (sem FOR UPDATE). Duas transações
      // simultâneas leem tranquilamente o MESMO valor aqui.
      // --------------------------------------------------------------------
      const leitura = await cliente.query(
        `SELECT estoque, preco, artesao_id FROM produto WHERE id = $1 AND status = 'ativo'`,
        [item.produtoId],
      );

      if (leitura.rowCount === 0) {
        throw new ProdutoInexistente(item.produtoId);
      }
      const atual = leitura.rows[0];

      // --------------------------------------------------------------------
      // PASSO 2 — DECIDE, na memória da aplicação.
      //
      // AQUI ESTÁ A JANELA DO BUG. Entre o SELECT do passo 1 e o UPDATE do
      // passo 3, outra transação pode ter vendido a última peça. Esta decisão
      // está sendo tomada com uma informação que já pode ter vencido — como
      // duas pessoas que olham a mesma vaga de estacionamento livre e as duas
      // decidem entrar.
      // --------------------------------------------------------------------
      if (atual.estoque < item.quantidade) {
        throw new EstoqueInsuficiente(item.produtoId);
      }

      // --------------------------------------------------------------------
      // PASSO 3 — ESCREVE o valor que a aplicação calculou.
      //
      // `SET estoque = $2` com um número fixo, calculado no passo 2. Se duas
      // transações leram 10 e as duas escrevem 9, a segunda escrita SOBRESCREVE
      // a primeira: duas unidades foram vendidas, mas o estoque só caiu uma.
      // A escrita da primeira transação foi PERDIDA (lost update).
      //
      // Repare também que não há nenhuma condição no WHERE: o banco obedece sem
      // conferir nada, porque quem "conferiu" foi a aplicação, tarde demais.
      // --------------------------------------------------------------------
      const novoEstoque = atual.estoque - item.quantidade;
      await cliente.query(
        `UPDATE produto SET estoque = $2, atualizado_em = now() WHERE id = $1`,
        [item.produtoId, novoEstoque],
      );

      itensConfirmados.push({
        produtoId: item.produtoId,
        artesaoId: Number(atual.artesao_id),
        quantidade: item.quantidade,
        precoUnitario: Number(atual.preco),
        estoqueRestante: novoEstoque,
      });
    }

    return gravarPedido(cliente, {
      compradorId,
      enderecoEntrega,
      metodoPagamento,
      itensConfirmados,
    });
  });
}
