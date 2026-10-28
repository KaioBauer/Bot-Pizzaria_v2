import { describe, expect, it } from "vitest";
import { STATUS_PEDIDO } from "@pizzaria/shared";
import { acaoPrincipal, colunaDoStatus, impressaoPendente, minutosDesde, nivelAtraso, rotuloCanal } from "./quadro";

describe("quadro de pedidos", () => {
  it("rótulo do canal de origem, inclusive o pedido pelo link", () => {
    expect(rotuloCanal("whatsapp")).toBe("WhatsApp");
    expect(rotuloCanal("telegram")).toBe("Telegram");
    expect(rotuloCanal("link")).toBe("Link");
    expect(rotuloCanal("outro")).toBe("outro");
  });

  it("todo status tem coluna", () => {
    for (const s of STATUS_PEDIDO) expect(colunaDoStatus(s)).toBeTruthy();
    expect(colunaDoStatus("saiu_para_entrega")).toBe("saida");
    expect(colunaDoStatus("pronto_para_retirada")).toBe("saida");
  });

  it("ação principal segue o fluxo e depende do tipo de entrega", () => {
    expect(acaoPrincipal("novo", "entrega")).toEqual({ para: "em_preparo", rotulo: "Iniciar preparo" });
    expect(acaoPrincipal("em_preparo", "entrega")?.para).toBe("saiu_para_entrega");
    expect(acaoPrincipal("em_preparo", "retirada")?.para).toBe("pronto_para_retirada");
    expect(acaoPrincipal("saiu_para_entrega", "entrega")?.rotulo).toBe("Concluir");
    expect(acaoPrincipal("aguardando_pagamento", "entrega")?.rotulo).toBe("Confirmar pagamento");
    expect(acaoPrincipal("concluido", "entrega")).toBeNull();
    expect(acaoPrincipal("cancelado", "retirada")).toBeNull();
  });

  it("calcula atraso só para pedidos em andamento", () => {
    const agora = new Date("2026-10-01T20:50:00Z").getTime();
    expect(minutosDesde("2026-10-01T20:00:00Z", agora)).toBe(50);
    expect(nivelAtraso("em_preparo", 29)).toBe("ok");
    expect(nivelAtraso("em_preparo", 30)).toBe("atencao");
    expect(nivelAtraso("novo", 45)).toBe("atrasado");
    expect(nivelAtraso("concluido", 90)).toBe("ok");
  });

  it("aponta impressão pendente depois de 90s", () => {
    const criadoEm = "2026-10-01T20:00:00Z";
    const t = (s: number) => new Date(criadoEm).getTime() + s * 1000;
    const base = { status: "novo" as const, impressoEm: null, criadoEm, reimpressaoSolicitadaEm: null };
    expect(impressaoPendente(base, t(60))).toBe(false);
    expect(impressaoPendente(base, t(120))).toBe(true);
    expect(impressaoPendente({ ...base, impressoEm: criadoEm }, t(120))).toBe(false);
    expect(impressaoPendente({ ...base, status: "aguardando_pagamento" }, t(600))).toBe(false);
    expect(impressaoPendente({ ...base, impressoEm: criadoEm, reimpressaoSolicitadaEm: criadoEm }, t(120))).toBe(true);
  });
});
