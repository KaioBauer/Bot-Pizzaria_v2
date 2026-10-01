import { createSign, generateKeyPairSync } from "node:crypto";
import Fastify from "fastify";
import pino from "pino";
import { describe, expect, it } from "vitest";
import type { ServicoPix } from "@pizzaria/core";
import type { Db } from "@pizzaria/db";
import { registrarPix, ROTA_WEBHOOK_PIX } from "./pix";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const assinar = (corpo: string) => createSign("sha256").update(corpo).sign(privateKey, "base64");

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

async function montar(autorizacaoWebhook?: string) {
  const processados: string[] = [];
  const pix = {
    processarAtualizacao: async (id: string) => {
      processados.push(id);
      return "confirmado" as const;
    },
    conferirPendentes: async () => {},
  } as unknown as ServicoPix;
  const servidor = Fastify();
  registrarPix({
    servidor,
    db: dbFalso(),
    pix,
    logger: pino({ level: "silent" }),
    chavesPublicas: async () => [pem],
    ...(autorizacaoWebhook ? { autorizacaoWebhook } : {}),
    conferenciaMs: 999_999,
  });
  await servidor.ready();
  const enviar = (corpo: string, cabecalhos: Record<string, string> = {}) =>
    servidor.inject({
      method: "POST",
      url: ROTA_WEBHOOK_PIX,
      payload: corpo,
      headers: { "content-type": "application/json", "x-webhook-signature": assinar(corpo), ...cabecalhos },
    });
  return { enviar, processados };
}

const pago = JSON.stringify({ event: "OPENPIX:CHARGE_COMPLETED", charge: { correlationID: "pedido-1", status: "COMPLETED" } });

describe("webhook OpenPix", () => {
  it("processa cobrança paga com assinatura válida", async () => {
    const { enviar, processados } = await montar();
    const r = await enviar(pago);
    expect(r.statusCode).toBe(200);
    await new Promise((ok) => setTimeout(ok, 10));
    expect(processados).toEqual(["pedido-1"]);
  });

  it("rejeita assinatura inválida ou corpo adulterado", async () => {
    const { enviar, processados } = await montar();
    expect((await enviar(pago, { "x-webhook-signature": "lixo" })).statusCode).toBe(401);
    expect((await enviar(pago.replace("pedido-1", "pedido-2"), { "x-webhook-signature": assinar(pago) })).statusCode).toBe(401);
    expect(processados).toEqual([]);
  });

  it("confere o Authorization cadastrado no webhook, quando configurado", async () => {
    const { enviar } = await montar("segredo-123");
    expect((await enviar(pago)).statusCode).toBe(401);
    expect((await enviar(pago, { authorization: "segredo-123" })).statusCode).toBe(200);
  });

  it("responde ao teste de webhook da Woovi sem processar", async () => {
    const { enviar, processados } = await montar();
    const r = await enviar(JSON.stringify({ evento: "teste_webhook" }));
    expect(r.json()).toMatchObject({ ok: true, teste: true });
    expect(processados).toEqual([]);
  });

  it("ignora reentrega do mesmo evento", async () => {
    const { enviar, processados } = await montar();
    await enviar(pago, { "x-webhook-event-id": "evt-1" });
    const r = await enviar(pago, { "x-webhook-event-id": "evt-1" });
    expect(r.json()).toMatchObject({ duplicado: true });
    await new Promise((ok) => setTimeout(ok, 10));
    expect(processados).toEqual(["pedido-1"]);
  });

  it("ignora eventos que não são de cobrança", async () => {
    const { enviar, processados } = await montar();
    const r = await enviar(JSON.stringify({ event: "OPENPIX:MOVEMENT_CONFIRMED" }));
    expect(r.json()).toMatchObject({ ignorado: true });
    expect(processados).toEqual([]);
  });
});
