import Fastify from "fastify";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { configDeTeste, ID, sabor, TAMANHOS, variacoesDeTeste } from "@pizzaria/core/testes/fixtures";
import { repositoriosEmMemoria } from "@pizzaria/core/testes/memoria";
import type { ChannelAdapter } from "./canais/tipos";
import { CABECALHO_IP_CLIENTE, registrarPedidoLink, ROTA_PEDIDO_LINK } from "./pedido-link";

// Sempre aberto: o teste não depende do relógio.
const config = configDeTeste({
  tamanhos: TAMANHOS,
  horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, abre: "00:00", fecha: "00:00" })),
});

function montar(limites = { porIp: 20, porTelefone: 5, janelaMs: 60_000 }) {
  const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config });
  const enviados: Array<{ chatId: string; texto: string }> = [];
  const whatsapp = {
    sendMessage: async (chatId: string, texto: string) => void enviados.push({ chatId, texto }),
  } as unknown as ChannelAdapter;
  const servidor = Fastify();
  const rota = registrarPedidoLink({
    servidor,
    repos: memoria.repos,
    pix: null,
    whatsapp,
    urlPedir: "https://vianna.test/pedir",
    logger: pino({ level: "silent" }),
    limites,
  });
  const enviar = (corpo: Record<string, unknown>, ip = "1.1.1.1") =>
    servidor.inject({ method: "POST", url: ROTA_PEDIDO_LINK, headers: { [CABECALHO_IP_CLIENTE]: ip }, payload: corpo });
  return { ...memoria, enviados, enviar, rota };
}

let sequencia = 0;
function pedido(extra: Record<string, unknown> = {}) {
  sequencia++;
  return {
    itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], quantidade: 1 }],
    tipo_entrega: "retirada",
    forma_pagamento: "dinheiro",
    cliente_nome: "Maria",
    cliente_telefone: "11987654321",
    chave_idempotencia: `00000000-0000-4000-8000-${String(sequencia).padStart(12, "0")}`,
    ...extra,
  };
}

describe("rota do pedido por link", () => {
  it("cria o pedido, devolve o token e avisa no WhatsApp com o link", async () => {
    const { enviar, pedidos, enviados, rota } = montar();
    const r = await enviar(pedido());
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, numero: 1, token: "token-pedido-1", totalCentavos: 5500 });
    expect(pedidos).toHaveLength(1);
    await new Promise((ok) => setImmediate(ok));
    expect(enviados).toEqual([
      expect.objectContaining({ chatId: "5511987654321", texto: expect.stringContaining("https://vianna.test/pedir/acompanhar/token-pedido-1") }),
    ]);
    rota.parar();
  });

  it("duplo clique (mesma chave): um pedido e um aviso só", async () => {
    const { enviar, pedidos, enviados, rota } = montar();
    const corpo = pedido();
    const [a, b] = await Promise.all([enviar(corpo), enviar(corpo)]);
    expect(a.json()).toMatchObject({ ok: true, numero: 1 });
    expect(b.json()).toMatchObject({ ok: true, numero: 1 });
    expect(pedidos).toHaveLength(1);
    await new Promise((ok) => setImmediate(ok));
    expect(enviados).toHaveLength(1);
    rota.parar();
  });

  it("honeypot preenchido: recusa sem gravar", async () => {
    const { enviar, pedidos, rota } = montar();
    const r = await enviar({ ...pedido(), site: "http://spam" });
    expect(r.statusCode).toBe(400);
    expect(pedidos).toHaveLength(0);
    rota.parar();
  });

  it("limite por IP", async () => {
    const { enviar, rota } = montar({ porIp: 2, porTelefone: 10, janelaMs: 60_000 });
    expect((await enviar(pedido())).statusCode).toBe(200);
    expect((await enviar(pedido())).statusCode).toBe(200);
    expect((await enviar(pedido())).statusCode).toBe(429);
    expect((await enviar(pedido(), "2.2.2.2")).statusCode).toBe(200);
    rota.parar();
  });

  it("limite por telefone conta só pedidos criados", async () => {
    const { enviar, pedidos, rota } = montar({ porIp: 50, porTelefone: 2, janelaMs: 60_000 });
    // Inválido (sem itens) não gasta o limite do telefone.
    expect((await enviar(pedido({ itens: [] }))).statusCode).toBe(422);
    expect((await enviar(pedido())).statusCode).toBe(200);
    expect((await enviar(pedido({ cliente_telefone: "(11) 98765-4321" }))).statusCode).toBe(200);
    const bloqueado = await enviar(pedido(), "3.3.3.3");
    expect(bloqueado.statusCode).toBe(429);
    expect(pedidos).toHaveLength(2);
    rota.parar();
  });

  it("config informa se há Pix", async () => {
    const { rota } = montar();
    const servidor = Fastify();
    registrarPedidoLink({ servidor, repos: repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config }).repos, pix: null, whatsapp: null, urlPedir: null, logger: pino({ level: "silent" }) }).parar();
    expect((await servidor.inject({ method: "GET", url: `${ROTA_PEDIDO_LINK}/config` })).json()).toEqual({ pix: false });
    rota.parar();
  });

  it("erro de validação volta 422 com a mensagem", async () => {
    const { enviar, rota } = montar();
    const r = await enviar(pedido({ itens: [{ sabores: [sabor(ID.calabresa, ID.inexistente)], quantidade: 1 }] }));
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ ok: false, erros: [expect.stringContaining("não existe")] });
    rota.parar();
  });
});
