import { describe, expect, it } from "vitest";
import { cobrancasSimuladasEmMemoria, repositoriosEmMemoria } from "../testes/memoria";
import { configDeTeste, variacoesDeTeste } from "../testes/fixtures";
import { crc16, gerarBrCode, lerBrCode } from "./brcode";
import { criarServicoPix } from "./pix";
import {
  assinarWebhookPixSimulado,
  criarPixSimulado,
  gerarEndToEndId,
  validarAssinaturaPixSimulado,
  type EventoPixSimulado,
} from "./simulado";

const CHAVE = "7d9f0335-8dcc-4054-9bf9-0dbd61d36906";

describe("BR Code", () => {
  it("CRC16 do exemplo do Manual do Pix (Banco Central)", () => {
    const exemplo =
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16(exemplo)).toBe("1D3D");
    expect(lerBrCode(`${exemplo}1D3D`)).toMatchObject({ chave: "123e4567-e12b-12d1-a456-426655440000", nomeRecebedor: "Fulano de Tal", txid: null });
  });

  it("gera e lê de volta: valor, recebedor sem acento e txid", () => {
    const codigo = gerarBrCode({ chave: CHAVE, valorCentavos: 13150, nomeRecebedor: "Vianna Pizzaria Ação", cidade: "São José", txid: "ABC123" });
    expect(codigo.startsWith("000201010212")).toBe(true); // QR de uso único (cobrança)
    expect(codigo).toContain("5406131.50");
    expect(lerBrCode(codigo)).toEqual({
      chave: CHAVE,
      valorCentavos: 13150,
      nomeRecebedor: "Vianna Pizzaria Acao",
      cidade: "Sao Jose",
      txid: "ABC123",
      descricao: null,
    });
  });

  it("recusa código alterado (CRC não bate) ou que não é Pix", () => {
    const codigo = gerarBrCode({ chave: CHAVE, valorCentavos: 5000, nomeRecebedor: "Loja", cidade: "Cidade", txid: "T1" });
    expect(lerBrCode(codigo.replace("50.00", "05.00"))).toBeNull();
    expect(lerBrCode("qualquer coisa")).toBeNull();
    expect(lerBrCode(` ${codigo}\n`)).not.toBeNull(); // espaços de quem colou
  });

  it("identificador fim a fim no formato do SPI", () => {
    expect(gerarEndToEndId(new Date("2026-10-28T23:05:00Z"))).toMatch(/^E99999999202610282305[A-Za-z0-9]{11}$/);
  });
});

function montar(agoraRef = { valor: new Date("2026-10-28T20:00:00Z") }) {
  const cobrancas = cobrancasSimuladasEmMemoria();
  const eventos: EventoPixSimulado[] = [];
  const simulado = criarPixSimulado({
    cobrancas,
    chave: CHAVE,
    recebedor: async () => ({ nome: "Vianna Pizzaria", cidade: "Joinville" }),
    aoMudar: (e) => eventos.push(e),
    agora: () => agoraRef.valor,
  });
  return { ...simulado, cobrancas, eventos, agoraRef };
}

const nova = (pedidoId = "pedido-1", valorCentavos = 6000) => ({
  pedidoId,
  descricao: "Vianna Pizzaria - pedido #7",
  valorCentavos,
  expiraEm: new Date("2026-10-28T20:30:00Z"),
});

describe("Pix simulado: gateway", () => {
  it("cria cobrança com BR Code e QR; repetir para o mesmo pedido devolve a mesma", async () => {
    const { gateway, cobrancas } = montar();
    const a = await gateway.criarCobranca(nova());
    const b = await gateway.criarCobranca(nova());
    expect(a.provedorId).toBe("pedido-1");
    expect(lerBrCode(a.qrCode)).toMatchObject({ chave: CHAVE, valorCentavos: 6000, nomeRecebedor: "Vianna Pizzaria" });
    expect(Buffer.from(a.qrCodeBase64, "base64").subarray(1, 4).toString()).toBe("PNG");
    expect(b.qrCode).toBe(a.qrCode);
    expect(cobrancas.lista).toHaveLength(1);
    expect(await gateway.consultar("pedido-1")).toMatchObject({ status: "pendente", valorCentavos: 6000 });
  });

  it("vence sozinha no prazo e avisa", async () => {
    const ctx = montar();
    await ctx.gateway.criarCobranca(nova());
    ctx.agoraRef.valor = new Date("2026-10-28T20:31:00Z");
    expect((await ctx.gateway.consultar("pedido-1")).status).toBe("cancelado");
    expect(ctx.eventos.map((e) => e.tipo)).toEqual(["cobranca.expirada"]);
  });

  it("cancelar só vale para cobrança ativa; estornar só para paga", async () => {
    const ctx = montar();
    const c = await ctx.gateway.criarCobranca(nova());
    await expect(ctx.gateway.estornar("pedido-1")).rejects.toThrow();
    expect((await ctx.banco.pagar(c.qrCode, "Maria")).ok).toBe(true);
    await ctx.gateway.cancelar("pedido-1");
    expect((await ctx.gateway.consultar("pedido-1")).status).toBe("aprovado");
    await ctx.gateway.estornar("pedido-1");
    await ctx.gateway.estornar("pedido-1"); // idempotente
    expect((await ctx.gateway.consultar("pedido-1")).status).toBe("estornado");
    expect(ctx.eventos.map((e) => e.tipo)).toEqual(["cobranca.paga", "cobranca.estornada"]);
  });
});

describe("Pix simulado: banco", () => {
  it("lê o copia e cola e mostra recebedor, valor e chave mascarada", async () => {
    const ctx = montar();
    const c = await ctx.gateway.criarCobranca(nova());
    const r = await ctx.banco.ler(c.qrCode);
    expect(r).toMatchObject({ ok: true, dados: { recebedor: "Vianna Pizzaria", cidade: "Joinville", valorCentavos: 6000, chave: "7d9f0335…6906", status: "ativa" } });
  });

  it("paga uma vez só e devolve comprovante", async () => {
    const ctx = montar();
    const c = await ctx.gateway.criarCobranca(nova());
    const pago = await ctx.banco.pagar(c.qrCode, "  Maria Souza ");
    expect(pago).toMatchObject({ ok: true, dados: { valorCentavos: 6000, pagador: "Maria Souza", recebedor: "Vianna Pizzaria" } });
    expect(ctx.cobrancas.lista[0]).toMatchObject({ status: "paga", pagadorNome: "Maria Souza" });
    expect(await ctx.banco.pagar(c.qrCode, "Maria")).toEqual({ ok: false, erro: "Esta cobrança já foi paga." });
    expect(ctx.eventos).toHaveLength(1);
  });

  it("recusa código inválido, chave de outro banco, vencida e cancelada", async () => {
    const ctx = montar();
    const c = await ctx.gateway.criarCobranca(nova());
    expect((await ctx.banco.pagar("abc", "Maria")).ok).toBe(false);
    const outraChave = gerarBrCode({ chave: "outra@chave.com", valorCentavos: 6000, nomeRecebedor: "X", cidade: "Y", txid: "Z" });
    expect(await ctx.banco.pagar(outraChave, "Maria")).toEqual({ ok: false, erro: "Chave Pix não encontrada no Banco simulado." });

    ctx.agoraRef.valor = new Date("2026-10-28T20:31:00Z");
    expect(await ctx.banco.pagar(c.qrCode, "Maria")).toMatchObject({ ok: false, erro: expect.stringContaining("expirou") });

    const d = await ctx.gateway.criarCobranca({ ...nova("pedido-2"), expiraEm: new Date("2026-10-28T21:30:00Z") });
    await ctx.gateway.cancelar("pedido-2");
    expect(await ctx.banco.pagar(d.qrCode, "Maria")).toMatchObject({ ok: false, erro: expect.stringContaining("cancelada") });
  });
});

describe("Pix simulado com o serviço de Pix", () => {
  it("pagar no banco + webhook libera o pedido para a cozinha", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    const ctx = montar();
    const servico = criarServicoPix({ gateway: ctx.gateway, repos: memoria.repos, agora: () => ctx.agoraRef.valor });
    memoria.pedidos.push({ id: "pedido-1", numero: 7, status: "aguardando_pagamento" } as (typeof memoria.pedidos)[number]);
    const cobranca = await servico.gerarCobranca({ pedidoId: "pedido-1", numero: 7, totalCentavos: 6000, nomePizzaria: "Vianna", expiracaoMinutos: 30 });

    expect(await servico.processarAtualizacao("pedido-1")).toBe("sem_mudanca");
    await ctx.banco.pagar(cobranca.qrCode, "Maria");
    expect(await servico.processarAtualizacao(ctx.eventos[0]!.referencia)).toBe("confirmado");
    expect(memoria.pedidos[0]?.status).toBe("novo");
  });
});

describe("assinatura do webhook", () => {
  it("HMAC-SHA256 do corpo cru", () => {
    const corpo = JSON.stringify({ tipo: "cobranca.paga", referencia: "p1" });
    const assinatura = assinarWebhookPixSimulado(corpo, "segredo");
    expect(assinatura).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(validarAssinaturaPixSimulado(corpo, assinatura, "segredo")).toBe(true);
    expect(validarAssinaturaPixSimulado(corpo.replace("p1", "p2"), assinatura, "segredo")).toBe(false);
    expect(validarAssinaturaPixSimulado(corpo, assinatura, "outro")).toBe(false);
    expect(validarAssinaturaPixSimulado(corpo, undefined, "segredo")).toBe(false);
  });
});
