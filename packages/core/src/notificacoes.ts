import type { StatusPedido, TipoEntrega } from "@pizzaria/shared";

/**
 * Texto enviado ao cliente quando o status do pedido muda (painel ou
 * confirmação do Pix). `null` = não notificar.
 */
export function mensagemStatusPedido(pedido: {
  numero: number;
  status: StatusPedido;
  tipoEntrega: TipoEntrega;
  motivoCancelamento: string | null;
  formaPagamento?: string | null;
}): string | null {
  const n = `*#${pedido.numero}*`;
  switch (pedido.status) {
    case "novo":
      return `✅ Pagamento confirmado! Seu pedido ${n} já entrou na fila de preparo.`;
    case "em_preparo":
      return `👨‍🍳 Seu pedido ${n} está sendo preparado!`;
    case "saiu_para_entrega":
      return `🛵 Seu pedido ${n} saiu para entrega! Daqui a pouco chega aí.`;
    case "pronto_para_retirada":
      return `🍕 Seu pedido ${n} está pronto! Pode vir retirar no balcão.`;
    case "concluido":
      return pedido.tipoEntrega === "entrega"
        ? `Pedido ${n} entregue. Obrigado pela preferência e bom apetite! 😋`
        : `Pedido ${n} retirado. Obrigado pela preferência e bom apetite! 😋`;
    case "cancelado":
      return [
        `❌ Seu pedido ${n} foi cancelado.`,
        pedido.motivoCancelamento ? `Motivo: ${pedido.motivoCancelamento}` : null,
        // O estorno é automático (conferência do Pix); aqui não se sabe se chegou a pagar.
        pedido.formaPagamento === "pix" ? "Se você já tinha pago pelo Pix, o valor é devolvido automaticamente." : null,
        "Se tiver qualquer dúvida, é só chamar por aqui.",
      ]
        .filter(Boolean)
        .join("\n");
    case "aguardando_pagamento":
      return null;
  }
}
