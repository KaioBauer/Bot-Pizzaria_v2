import type { TipoEntrega } from "./tipos";

export const STATUS_PEDIDO = [
  "aguardando_pagamento",
  "novo",
  "em_preparo",
  "saiu_para_entrega",
  "pronto_para_retirada",
  "concluido",
  "cancelado",
] as const;

export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  novo: "Novo",
  em_preparo: "Em preparo",
  saiu_para_entrega: "Saiu para entrega",
  pronto_para_retirada: "Pronto para retirada",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/**
 * Máquina de status. Cancelamento é permitido a partir de qualquer status
 * não final; `saiu_para_entrega` só existe para entrega e
 * `pronto_para_retirada` só para retirada.
 */
export function proximosStatus(
  atual: StatusPedido,
  tipoEntrega: TipoEntrega
): StatusPedido[] {
  switch (atual) {
    case "aguardando_pagamento":
      return ["novo", "cancelado"];
    case "novo":
      return ["em_preparo", "cancelado"];
    case "em_preparo":
      return [
        tipoEntrega === "entrega" ? "saiu_para_entrega" : "pronto_para_retirada",
        "cancelado",
      ];
    case "saiu_para_entrega":
    case "pronto_para_retirada":
      return ["concluido", "cancelado"];
    case "concluido":
    case "cancelado":
      return [];
  }
}

export function podeTransicionar(
  de: StatusPedido,
  para: StatusPedido,
  tipoEntrega: TipoEntrega
): boolean {
  return proximosStatus(de, tipoEntrega).includes(para);
}

export function statusFinal(status: StatusPedido): boolean {
  return status === "concluido" || status === "cancelado";
}

export function ehStatusPedido(valor: string): valor is StatusPedido {
  return (STATUS_PEDIDO as readonly string[]).includes(valor);
}
