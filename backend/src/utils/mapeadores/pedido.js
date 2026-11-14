// ============================================================================
// Registro do banco (formato do Prisma) → objeto `Pedido` da API
// (frontend/src/types/pedido.ts). Mapeamento: docs/api.md, seções 3 e 9.
// ============================================================================

import { paraProduto } from "./catalogo.js";

const arredondar = (valor) => Math.round(valor * 100) / 100;

export function paraPedido(registro) {
  const total = Number(registro.valor_total);
  const frete = Number(registro.frete);
  return {
    codigo: registro.codigo,
    data: registro.criado_em.toISOString(),
    clienteEmail: registro.usuario.email,
    enderecoEntrega: registro.endereco_entrega,
    // Em itens[].produto.preco vai o preço PAGO (item_pedido.preco_unitario),
    // não o preço atual do produto, que pode ter mudado depois da compra.
    itens: registro.item_pedido.map((item) => ({
      produto: { ...paraProduto(item.produto), preco: Number(item.preco_unitario) },
      quantidade: item.quantidade,
    })),
    // subtotal não é coluna: é sempre total - frete (evita guardar o mesmo dado duas vezes).
    subtotal: arredondar(total - frete),
    frete,
    total,
    status: registro.status,
    previsaoEntrega: registro.previsao_entrega ? registro.previsao_entrega.toISOString() : null,
    pagamento: registro.pagamento
      ? {
          metodo: registro.pagamento.metodo,
          status: registro.pagamento.status,
          valor: Number(registro.pagamento.valor),
          processadoEm: registro.pagamento.processado_em.toISOString(),
        }
      : null,
  };
}
