import { describe, expect, it } from "vitest";
import { STATUS_PEDIDO } from "@pizzaria/shared";
import { mensagemStatusPedido } from "./notificacoes";

const base = { numero: 7, tipoEntrega: "entrega" as const, motivoCancelamento: null };

describe("mensagemStatusPedido", () => {
  it("tem mensagem com o número do pedido para todo status notificável", () => {
    for (const status of STATUS_PEDIDO.filter((s) => s !== "aguardando_pagamento")) {
      expect(mensagemStatusPedido({ ...base, status }), status).toContain("#7");
    }
  });

  it("não notifica aguardando pagamento", () => {
    expect(mensagemStatusPedido({ ...base, status: "aguardando_pagamento" })).toBeNull();
  });

  it("inclui o motivo do cancelamento quando houver", () => {
    expect(mensagemStatusPedido({ ...base, status: "cancelado", motivoCancelamento: "Endereço fora da área" })).toContain(
      "Motivo: Endereço fora da área"
    );
    expect(mensagemStatusPedido({ ...base, status: "cancelado" })).not.toContain("Motivo");
    expect(mensagemStatusPedido({ ...base, status: "cancelado", formaPagamento: "pix" })).toContain("devolvido automaticamente");
    expect(mensagemStatusPedido({ ...base, status: "cancelado", formaPagamento: "dinheiro" })).not.toContain("devolvido");
  });

  it("diferencia entrega e retirada na conclusão", () => {
    expect(mensagemStatusPedido({ ...base, status: "concluido" })).toContain("entregue");
    expect(mensagemStatusPedido({ ...base, status: "concluido", tipoEntrega: "retirada" })).toContain("retirado");
  });
});
