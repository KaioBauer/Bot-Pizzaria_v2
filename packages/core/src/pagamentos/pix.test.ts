import { describe, expect, it } from "vitest";
import { criarAgente } from "../agente/agente";
import { configDeTeste, ID, sabor, variacoesDeTeste } from "../testes/fixtures";
import { chamar, gatewayPixFalso, llmRoteirizado, repositoriosEmMemoria, semearResumo, texto } from "../testes/memoria";
import { criarServicoPix, MOTIVO_PIX_EXPIRADO, MOTIVO_PIX_RECUSADO } from "./pix";

const ABERTO = new Date("2026-10-02T20:00:00-03:00");

const argsPix = {
  itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], quantidade: 1 }],
  tipo_entrega: "retirada",
  forma_pagamento: "pix",
  cliente_nome: "Maria",
  cliente_telefone: "11987654321",
};

function montar(roteiro: Parameters<typeof llmRoteirizado>[0], agoraRef = { valor: ABERTO }) {
  const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste({ pixExpiracaoMinutos: 30 }) });
  const falso = gatewayPixFalso();
  const pix = criarServicoPix({ gateway: falso.gateway, repos: memoria.repos, agora: () => agoraRef.valor });
  const { llm, requisicoes } = llmRoteirizado(roteiro);
  const agente = criarAgente({ repos: memoria.repos, llm, pix, agora: () => agoraRef.valor });
  return { ...memoria, ...falso, pix, agente, requisicoes, agoraRef };
}

async function pedidoPixPendente() {
  const ctx = montar([chamar(["finalizar_pedido", argsPix])]);
  await semearResumo(ctx.repos, { canal: "whatsapp", chatId: "1" }, argsPix);
  const r = await ctx.agente.processarMensagem({ canal: "whatsapp", chatId: "1", texto: "sim" });
  return { ...ctx, resposta: r, provedorId: ctx.pagamentos[0]!.provedorId };
}

describe("Pix no agente", () => {
  it("cria pedido aguardando pagamento e envia QR + copia e cola", async () => {
    const { resposta, pedidos, pagamentos } = await pedidoPixPendente();
    expect(pedidos[0]).toMatchObject({ status: "aguardando_pagamento", totalCentavos: 5500 });
    expect(pagamentos[0]).toMatchObject({ status: "pendente", valorCentavos: 5500 });
    expect(resposta.texto).toContain("pague *R$ 55,00* no Pix até as *20:30*");
    expect(resposta.anexos).toEqual([
      expect.objectContaining({ tipo: "imagem", mime: "image/png", base64: "iVBORw0KGgo=" }),
      { tipo: "texto", texto: "00020126-PIX-COPIA-E-COLA" },
    ]);
  });

  it("oferece Pix no prompt só quando o gateway está configurado", async () => {
    const comPix = montar([texto("oi")]);
    await comPix.agente.processarMensagem({ canal: "whatsapp", chatId: "1", texto: "oi" });
    expect(comPix.requisicoes[0]?.sistema).toContain("Pix (pagamento online");

    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    const semPix = llmRoteirizado([texto("oi")]);
    await criarAgente({ repos: memoria.repos, llm: semPix.llm, agora: () => ABERTO }).processarMensagem({ canal: "whatsapp", chatId: "1", texto: "oi" });
    expect(semPix.requisicoes[0]?.sistema).not.toContain("Pix (pagamento online");
  });

  it("se o gateway falhar, descarta o pedido e devolve o erro ao modelo", async () => {
    const ctx = montar([chamar(["finalizar_pedido", argsPix]), texto("O Pix falhou, quer pagar no cartão?")]);
    ctx.falharAoCriar(true);
    await semearResumo(ctx.repos, { canal: "whatsapp", chatId: "1" }, argsPix);
    const r = await ctx.agente.processarMensagem({ canal: "whatsapp", chatId: "1", texto: "sim" });
    expect(ctx.pedidos).toHaveLength(0);
    expect(r.pedido).toBeUndefined();
    expect(r.texto).toBe("O Pix falhou, quer pagar no cartão?");
    expect(ctx.requisicoes[1]?.mensagens.at(-1)).toMatchObject({ conteudo: expect.stringContaining("NÃO foi registrado") });
  });
});

describe("criarServicoPix.processarAtualizacao", () => {
  it("pagamento aprovado libera o pedido para a cozinha, de forma idempotente", async () => {
    const ctx = await pedidoPixPendente();
    ctx.cobrancas.get(ctx.provedorId)!.status = "aprovado";
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("confirmado");
    expect(ctx.pedidos[0]?.status).toBe("novo");
    expect(ctx.pagamentos[0]?.status).toBe("aprovado");
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("sem_mudanca");
  });

  it("não confirma se o valor pago for diferente do pedido", async () => {
    const ctx = await pedidoPixPendente();
    Object.assign(ctx.cobrancas.get(ctx.provedorId)!, { status: "aprovado", valorCentavos: 100 });
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("valor_divergente");
    expect(ctx.pedidos[0]?.status).toBe("aguardando_pagamento");
  });

  it("pendente dentro do prazo não muda nada", async () => {
    const ctx = await pedidoPixPendente();
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("sem_mudanca");
    expect(ctx.chamadas).not.toContain(`cancelar:${ctx.provedorId}`);
  });

  it("vencido: cancela a cobrança e o pedido, com motivo para o cliente", async () => {
    const ctx = await pedidoPixPendente();
    ctx.agoraRef.valor = new Date(ABERTO.getTime() + 31 * 60_000);
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("expirado");
    expect(ctx.chamadas).toContain(`cancelar:${ctx.provedorId}`);
    expect(ctx.pedidos[0]).toMatchObject({ status: "cancelado", motivo: MOTIVO_PIX_EXPIRADO });
    expect(ctx.pagamentos[0]?.status).toBe("expirado");
  });

  it("vencido mas pago no último segundo: confirma em vez de cancelar", async () => {
    const ctx = await pedidoPixPendente();
    ctx.agoraRef.valor = new Date(ABERTO.getTime() + 31 * 60_000);
    ctx.gateway.cancelar = async () => {
      ctx.cobrancas.get(ctx.provedorId)!.status = "aprovado"; // o banco já tinha aprovado
    };
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("confirmado");
    expect(ctx.pedidos[0]?.status).toBe("novo");
  });

  it("pago depois de o pedido ser cancelado: estorna", async () => {
    const ctx = await pedidoPixPendente();
    ctx.pedidos[0]!.status = "cancelado"; // cancelado no painel
    ctx.cobrancas.get(ctx.provedorId)!.status = "aprovado";
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("estornado");
    expect(ctx.chamadas).toContain(`estornar:${ctx.provedorId}`);
    expect(ctx.pagamentos[0]?.status).toBe("estornado");
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("sem_mudanca");
  });

  it("pago e depois cancelado pela pizzaria: a conferência estorna sozinha, uma vez só", async () => {
    const ctx = await pedidoPixPendente();
    ctx.cobrancas.get(ctx.provedorId)!.status = "aprovado";
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("confirmado");
    ctx.pedidos[0]!.status = "cancelado"; // cancelado no painel, com o Pix já pago
    await ctx.pix.conferirPendentes();
    expect(ctx.chamadas.filter((c) => c === `estornar:${ctx.provedorId}`)).toHaveLength(1);
    expect(ctx.pagamentos[0]?.status).toBe("estornado");
    await ctx.pix.conferirPendentes();
    expect(ctx.chamadas.filter((c) => c === `estornar:${ctx.provedorId}`)).toHaveLength(1);
  });

  it("estorno que falha fica para a próxima conferência", async () => {
    const ctx = await pedidoPixPendente();
    ctx.cobrancas.get(ctx.provedorId)!.status = "aprovado";
    await ctx.pix.processarAtualizacao(ctx.provedorId);
    ctx.pedidos[0]!.status = "cancelado";
    const estornarOriginal = ctx.gateway.estornar;
    ctx.gateway.estornar = async () => {
      throw new Error("banco fora do ar");
    };
    await ctx.pix.conferirPendentes();
    expect(ctx.pagamentos[0]?.status).toBe("aprovado");
    ctx.gateway.estornar = estornarOriginal;
    await ctx.pix.conferirPendentes();
    expect(ctx.pagamentos[0]?.status).toBe("estornado");
  });

  it("pedido cancelado no painel com Pix pendente: cancela a cobrança", async () => {
    const ctx = await pedidoPixPendente();
    ctx.pedidos[0]!.status = "cancelado";
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("cancelado");
    expect(ctx.chamadas).toContain(`cancelar:${ctx.provedorId}`);
    expect(ctx.pagamentos[0]?.status).toBe("cancelado");
  });

  it("recusado: cancela o pedido com motivo", async () => {
    const ctx = await pedidoPixPendente();
    ctx.cobrancas.get(ctx.provedorId)!.status = "recusado";
    expect(await ctx.pix.processarAtualizacao(ctx.provedorId)).toBe("cancelado");
    expect(ctx.pedidos[0]).toMatchObject({ status: "cancelado", motivo: MOTIVO_PIX_RECUSADO });
  });

  it("pagamento desconhecido é ignorado", async () => {
    const ctx = await pedidoPixPendente();
    expect(await ctx.pix.processarAtualizacao("nao-existe")).toBe("desconhecido");
  });

  it("conferirPendentes processa todos e uma falha não para os outros", async () => {
    const a = await pedidoPixPendente();
    a.cobrancas.get(a.provedorId)!.status = "aprovado";
    const consultarOriginal = a.gateway.consultar;
    let primeira = true;
    a.gateway.consultar = async (id) => {
      if (primeira) {
        primeira = false;
        throw new Error("timeout");
      }
      return consultarOriginal(id);
    };
    await a.pix.conferirPendentes(); // falha
    expect(a.pedidos[0]?.status).toBe("aguardando_pagamento");
    await a.pix.conferirPendentes(); // próxima rodada
    expect(a.pedidos[0]?.status).toBe("novo");
  });
});
