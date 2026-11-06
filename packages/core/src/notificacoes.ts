import type { StatusPedido, TipoEntrega } from "@pizzaria/shared";

/** Tempo médio e horário previsto, mandados quando o pedido entra em preparo. */
export interface EstimativaPreparo {
  minutos: number;
  /** "20:45", no fuso da loja. */
  previsao: string;
}

/** Estimativa a partir do momento em que o pedido entrou em preparo. */
export function estimativaPreparo(
  config: { tempoEntregaMinutos: number; tempoRetiradaMinutos: number; fusoHorario: string },
  tipoEntrega: TipoEntrega,
  inicio: Date
): EstimativaPreparo {
  const minutos = tipoEntrega === "entrega" ? config.tempoEntregaMinutos : config.tempoRetiradaMinutos;
  const previsao = new Date(inicio.getTime() + minutos * 60_000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.fusoHorario,
  });
  return { minutos, previsao };
}

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
  /** Só para em_preparo: tempo médio e horário previsto. */
  estimativa?: EstimativaPreparo | null;
}): string | null {
  const n = `*#${pedido.numero}*`;
  switch (pedido.status) {
    case "novo":
      return `✅ Pagamento confirmado! Seu pedido ${n} já entrou na fila de preparo.`;
    case "em_preparo": {
      const e = pedido.estimativa;
      if (!e) return `👨‍🍳 Seu pedido ${n} está sendo preparado!`;
      const alvo = pedido.tipoEntrega === "entrega" ? "para entrega" : "para ficar pronto";
      return `👨‍🍳 Seu pedido ${n} está sendo preparado!
⏱️ Tempo médio ${alvo}: cerca de ${e.minutos} min, previsão às *${e.previsao}*.`;
    }
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
