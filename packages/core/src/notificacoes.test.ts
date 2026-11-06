import { describe, expect, it } from "vitest";
import { STATUS_PEDIDO } from "@pizzaria/shared";
import { estimativaPreparo, mensagemStatusPedido } from "./notificacoes";

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

describe("tempo médio ao iniciar o preparo", () => {
  const config = { tempoEntregaMinutos: 45, tempoRetiradaMinutos: 30, fusoHorario: "America/Sao_Paulo" };
  // 20:00 em São Paulo (UTC-3)
  const inicio = new Date("2026-11-06T23:00:00Z");

  it("calcula o horário previsto no fuso da loja, separado por entrega e retirada", () => {
    expect(estimativaPreparo(config, "entrega", inicio)).toEqual({ minutos: 45, previsao: "20:45" });
    expect(estimativaPreparo(config, "retirada", inicio)).toEqual({ minutos: 30, previsao: "20:30" });
  });

  it("a mensagem de em preparo leva tempo médio e previsão", () => {
    const m = mensagemStatusPedido({ numero: 12, status: "em_preparo", tipoEntrega: "entrega", motivoCancelamento: null, estimativa: estimativaPreparo(config, "entrega", inicio) });
    expect(m).toContain("#12");
    expect(m).toContain("cerca de 45 min");
    expect(m).toContain("20:45");
    expect(m).toContain("para entrega");
    const r = mensagemStatusPedido({ numero: 3, status: "em_preparo", tipoEntrega: "retirada", motivoCancelamento: null, estimativa: estimativaPreparo(config, "retirada", inicio) });
    expect(r).toContain("para ficar pronto");
  });

  it("sem estimativa, a mensagem continua a de sempre", () => {
    expect(mensagemStatusPedido({ numero: 1, status: "em_preparo", tipoEntrega: "entrega", motivoCancelamento: null })).toBe("👨‍🍳 Seu pedido *#1* está sendo preparado!");
  });
});
