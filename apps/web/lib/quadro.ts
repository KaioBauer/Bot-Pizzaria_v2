import { proximosStatus, statusFinal, type StatusPedido, type TipoEntrega } from "@pizzaria/shared";

/** Regras de exibição do quadro de pedidos (puras, testadas). */

export type ColunaQuadro = "pagamento" | "novos" | "preparo" | "saida" | "finalizados";

export const COLUNAS: Array<{ id: ColunaQuadro; titulo: string; vaziaTexto: string }> = [
  { id: "pagamento", titulo: "Aguardando Pix", vaziaTexto: "" },
  { id: "novos", titulo: "Novos", vaziaTexto: "Nenhum pedido novo" },
  { id: "preparo", titulo: "Em preparo", vaziaTexto: "Nada no forno" },
  { id: "saida", titulo: "Prontos / Em entrega", vaziaTexto: "Nada aguardando saída" },
];

export function colunaDoStatus(status: StatusPedido): ColunaQuadro {
  switch (status) {
    case "aguardando_pagamento":
      return "pagamento";
    case "novo":
      return "novos";
    case "em_preparo":
      return "preparo";
    case "saiu_para_entrega":
    case "pronto_para_retirada":
      return "saida";
    case "concluido":
    case "cancelado":
      return "finalizados";
  }
}

const ROTULO_ACAO: Partial<Record<StatusPedido, string>> = {
  novo: "Confirmar pagamento",
  em_preparo: "Iniciar preparo",
  saiu_para_entrega: "Saiu para entrega",
  pronto_para_retirada: "Pronto p/ retirada",
  concluido: "Concluir",
};

/** O botão grande do cartão: próximo passo do fluxo (nunca o cancelamento). */
export function acaoPrincipal(
  status: StatusPedido,
  tipoEntrega: TipoEntrega
): { para: StatusPedido; rotulo: string } | null {
  const para = proximosStatus(status, tipoEntrega).find((s) => s !== "cancelado");
  return para ? { para, rotulo: ROTULO_ACAO[para] ?? para } : null;
}

export function minutosDesde(iso: string, agora: number): number {
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60_000));
}

/** Atraso visual: verde até 30 min, âmbar até 45, vermelho depois. */
export function nivelAtraso(status: StatusPedido, minutos: number): "ok" | "atencao" | "atrasado" {
  if (statusFinal(status) || status === "aguardando_pagamento") return "ok";
  if (minutos >= 45) return "atrasado";
  if (minutos >= 30) return "atencao";
  return "ok";
}

/** Pedido que já deveria ter saído na impressora (print-agent parado, sem papel...). */
export function impressaoPendente(
  pedido: { status: StatusPedido; impressoEm: string | null; criadoEm: string; reimpressaoSolicitadaEm: string | null },
  agora: number
): boolean {
  if (pedido.status === "aguardando_pagamento" || pedido.status === "cancelado") return false;
  const esperaMs = 90_000;
  if (pedido.reimpressaoSolicitadaEm) return agora - new Date(pedido.reimpressaoSolicitadaEm).getTime() > esperaMs;
  return pedido.impressoEm === null && agora - new Date(pedido.criadoEm).getTime() > esperaMs;
}

/** Nome do canal de origem para exibição ("pelo WhatsApp", selo "Link"...). */
export function rotuloCanal(canal: string): string {
  switch (canal) {
    case "whatsapp":
      return "WhatsApp";
    case "telegram":
      return "Telegram"; // pedidos antigos, de antes de ser só WhatsApp
    case "link":
      return "Link";
    default:
      return canal;
  }
}
