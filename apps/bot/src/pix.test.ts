import Fastify from "fastify";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { assinarWebhookPixSimulado, type ServicoPix } from "@pizzaria/core";
import type { Db } from "@pizzaria/db";
import { registrarPix, ROTA_WEBHOOK_PIX } from "./pix";
import { criarEmissorWebhookPix, registrarBancoPixSimulado } from "./pix-simulado";

const SEGREDO = "segredo-de-teste-123456";
const silencioso = pino({ level: "silent" });

/** Banco falso: só o registro de eventos (unicidade por chave). */
function dbFalso() {
  const chaves = new Set<string>();
  return {
    from: () => ({
      insert: async (linha: { chave: string }) => {
        if (chaves.has(linha.chave)) return { error: { code: "23505", message: "duplicado" } };
        chaves.add(linha.chave);
        return { error: null };
      },
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  } as unknown as Db;
}

async function montar() {
  const processados: string[] = [];
  const pix = {
    processarAtualizacao: async (id: string) => {
      processados.push(id);
      return "confirmado" as const;
    },
    conferirPendentes: async () => {},
  } as unknown as ServicoPix;
  const servidor = Fastify();
  registrarPix({ servidor, db: dbFalso(), pix, logger: silencioso, segredoWebhook: SEGREDO, conferenciaMs: 999_999 });
  await servidor.ready();
  const enviar = (corpo: string, cabecalhos: Record<string, string> = {}) =>
    servidor.inject({
      method: "POST",
      url: ROTA_WEBHOOK_PIX,
      payload: corpo,
      headers: { "content-type": "application/json", "x-pix-assinatura": assinarWebhookPixSimulado(corpo, SEGREDO), ...cabecalhos },
    });
  return { enviar, processados };
}

const evento = (id = "evt-1", tipo = "cobranca.paga") => JSON.stringify({ id, tipo, referencia: "pedido-1", txid: "T1", criadoEm: "2026-10-28T20:00:00Z" });
const tick = () => new Promise((ok) => setTimeout(ok, 10));

describe("webhook do Pix", () => {
  it("processa cobrança paga com assinatura válida", async () => {
    const { enviar, processados } = await montar();
    expect((await enviar(evento())).statusCode).toBe(200);
    await tick();
    expect(processados).toEqual(["pedido-1"]);
  });

  it("rejeita assinatura inválida ou corpo adulterado", async () => {
    const { enviar, processados } = await montar();
    expect((await enviar(evento(), { "x-pix-assinatura": "sha256=lixo" })).statusCode).toBe(401);
    expect((await enviar(evento().replace("pedido-1", "pedido-2"), { "x-pix-assinatura": assinarWebhookPixSimulado(evento(), SEGREDO) })).statusCode).toBe(401);
    expect((await enviar(evento(), { "x-pix-assinatura": assinarWebhookPixSimulado(evento(), "outro-segredo-qualquer") })).statusCode).toBe(401);
    expect(processados).toEqual([]);
  });

  it("ignora reentrega do mesmo evento e eventos desconhecidos", async () => {
    const { enviar, processados } = await montar();
    await enviar(evento("evt-1"));
    expect((await enviar(evento("evt-1"))).json()).toMatchObject({ duplicado: true });
    expect((await enviar(evento("evt-2", "conta.criada"))).json()).toMatchObject({ ignorado: true });
    await tick();
    expect(processados).toEqual(["pedido-1"]);
  });
});

describe("emissor de webhooks do Pix simulado", () => {
  const ev = { id: "e1", tipo: "cobranca.paga" as const, referencia: "p1", txid: "T", criadoEm: "x" };

  it("assina, reenvia quando falha e para de tentar ao receber 2xx", async () => {
    const chamadas: Array<{ assinatura: string | null; corpo: string }> = [];
    const respostas = [500, 0, 200];
    const falso = (async (_url: string, init: RequestInit) => {
      chamadas.push({ assinatura: new Headers(init.headers).get("x-pix-assinatura"), corpo: String(init.body) });
      const status = respostas.shift()!;
      if (status === 0) throw new Error("conexão recusada");
      return new Response("{}", { status });
    }) as typeof fetch;
    const emissor = criarEmissorWebhookPix({ url: "http://bot/webhooks/pix", segredo: SEGREDO, logger: silencioso, atrasoMs: [0, 0], reenviosMs: [1, 1, 1], fetch: falso });
    emissor.emitir(ev);
    await new Promise((ok) => setTimeout(ok, 60));
    expect(chamadas).toHaveLength(3);
    expect(chamadas[0]!.assinatura).toBe(assinarWebhookPixSimulado(chamadas[0]!.corpo, SEGREDO));
    expect(JSON.parse(chamadas[0]!.corpo)).toEqual(ev);
  });

  it("perda simulada descarta o webhook", async () => {
    let chamadas = 0;
    const falso = (async () => {
      chamadas++;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const emissor = criarEmissorWebhookPix({ url: "http://bot", segredo: SEGREDO, logger: silencioso, atrasoMs: [0, 0], perda: 1, fetch: falso, sortear: () => 0.5 });
    emissor.emitir(ev);
    await tick();
    expect(chamadas).toBe(0);
  });
});

describe("rotas do Banco simulado", () => {
  async function servidorCom(banco: Parameters<typeof registrarBancoPixSimulado>[0]["banco"]) {
    const servidor = Fastify();
    registrarBancoPixSimulado({ servidor, banco, validarAdmin: async (t) => t === "admin", logger: silencioso });
    await servidor.ready();
    return servidor;
  }

  it("exige admin e repassa ao banco", async () => {
    const pagos: string[] = [];
    const banco = {
      ler: async () => ({ ok: false as const, erro: "x" }),
      pagar: async (codigo: string, pagador: string) => {
        pagos.push(`${codigo}|${pagador}`);
        return { ok: true as const, dados: { endToEndId: "E1", txid: "T", valorCentavos: 100, recebedor: "Loja", pagador, pagoEm: "agora" } };
      },
      recentes: async () => [],
    };
    const servidor = await servidorCom(banco);
    expect((await servidor.inject({ method: "POST", url: "/admin/pix-simulado/pagar", payload: { codigo: "000201" } })).statusCode).toBe(401);
    const r = await servidor.inject({ method: "POST", url: "/admin/pix-simulado/pagar", headers: { authorization: "Bearer admin" }, payload: { codigo: "000201", pagador: "Maria" } });
    expect(r.json()).toMatchObject({ ok: true, dados: { endToEndId: "E1" } });
    expect(pagos).toEqual(["000201|Maria"]);
  });

  it("com o Pix desligado avisa no extrato e recusa pagar", async () => {
    const servidor = await servidorCom(null);
    const auth = { authorization: "Bearer admin" };
    expect((await servidor.inject({ method: "GET", url: "/admin/pix-simulado", headers: auth })).json()).toEqual({ habilitado: false, cobrancas: [] });
    expect((await servidor.inject({ method: "POST", url: "/admin/pix-simulado/pagar", headers: auth, payload: {} })).statusCode).toBe(409);
  });
});
