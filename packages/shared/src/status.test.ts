import { describe, expect, it } from "vitest";
import { podeTransicionar, proximosStatus, STATUS_PEDIDO, statusFinal, type StatusPedido } from "./status";

describe("máquina de status", () => {
  it("segue o fluxo completo de entrega", () => {
    const fluxo: StatusPedido[] = ["aguardando_pagamento", "novo", "em_preparo", "saiu_para_entrega", "concluido"];
    for (let i = 0; i < fluxo.length - 1; i++) {
      expect(podeTransicionar(fluxo[i]!, fluxo[i + 1]!, "entrega")).toBe(true);
    }
  });

  it("segue o fluxo completo de retirada", () => {
    const fluxo: StatusPedido[] = ["novo", "em_preparo", "pronto_para_retirada", "concluido"];
    for (let i = 0; i < fluxo.length - 1; i++) {
      expect(podeTransicionar(fluxo[i]!, fluxo[i + 1]!, "retirada")).toBe(true);
    }
  });

  it("não mistura etapas de entrega e retirada", () => {
    expect(podeTransicionar("em_preparo", "pronto_para_retirada", "entrega")).toBe(false);
    expect(podeTransicionar("em_preparo", "saiu_para_entrega", "retirada")).toBe(false);
  });

  it("não pula etapas nem volta", () => {
    expect(podeTransicionar("novo", "saiu_para_entrega", "entrega")).toBe(false);
    expect(podeTransicionar("aguardando_pagamento", "em_preparo", "entrega")).toBe(false);
    expect(podeTransicionar("em_preparo", "novo", "entrega")).toBe(false);
    expect(podeTransicionar("novo", "novo", "entrega")).toBe(false);
  });

  it("permite cancelar de qualquer status não final", () => {
    for (const status of STATUS_PEDIDO.filter((s) => !statusFinal(s))) {
      expect(podeTransicionar(status, "cancelado", "entrega")).toBe(true);
    }
  });

  it("status finais não têm saída", () => {
    expect(proximosStatus("concluido", "entrega")).toEqual([]);
    expect(proximosStatus("cancelado", "retirada")).toEqual([]);
  });
});
