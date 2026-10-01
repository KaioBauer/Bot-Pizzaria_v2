import Fastify from "fastify";
import pino from "pino";
import { describe, expect, it } from "vitest";
import type { MensagemEntrada } from "@pizzaria/core";
import { criarAdaptadorWhatsapp, eventoDeMensagem, extrairMensagem } from "./whatsapp";

const agora = 1_790_870_400_000;
const msg = (extra: Record<string, unknown> = {}, key: Record<string, unknown> = {}) => ({
  key: { id: "ABC", remoteJid: "5511987654321@s.whatsapp.net", fromMe: false, ...key },
  pushName: "Maria",
  messageTimestamp: agora / 1000,
  message: { conversation: "oi, quero uma pizza" },
  ...extra,
});

describe("extrairMensagem", () => {
  it("lê texto, nome e telefone", () => {
    expect(extrairMensagem(msg(), agora)).toEqual({
      tipo: "mensagem",
      id: "ABC",
      chatId: "5511987654321",
      telefone: "5511987654321",
      nome: "Maria",
      texto: "oi, quero uma pizza",
    });
  });

  it("lê texto estendido (resposta/link)", () => {
    expect(extrairMensagem(msg({ message: { extendedTextMessage: { text: "quero" } } }), agora)).toMatchObject({ texto: "quero" });
  });

  it.each([
    ["do próprio número", msg({}, { fromMe: true })],
    ["de grupo", msg({}, { remoteJid: "120363@g.us" })],
    ["de status", msg({}, { remoteJid: "status@broadcast" })],
    ["de canal", msg({}, { remoteJid: "123@newsletter" })],
    ["antiga (reentrega)", msg({ messageTimestamp: agora / 1000 - 600 })],
  ])("ignora mensagem %s", (_nome, dados) => {
    expect(extrairMensagem(dados, agora).tipo).toBe("ignorar");
  });

  it("mídia sem legenda vira sem_texto", () => {
    expect(extrairMensagem(msg({ message: { audioMessage: {} } }), agora)).toEqual({ tipo: "sem_texto", chatId: "5511987654321" });
  });

  it("conta com LID usa o número alternativo quando existe", () => {
    const r = extrairMensagem(msg({}, { remoteJid: "999@lid", senderPn: "5511912345678@s.whatsapp.net" }), agora);
    expect(r).toMatchObject({ chatId: "5511912345678", telefone: "5511912345678" });
    expect(extrairMensagem(msg({}, { remoteJid: "999@lid" }), agora)).toMatchObject({ chatId: "999@lid", telefone: null });
  });

  it("aceita o nome do evento nos dois formatos", () => {
    expect(eventoDeMensagem({ event: "messages.upsert", data: msg() })).toHaveLength(1);
    expect(eventoDeMensagem({ event: "MESSAGES_UPSERT", data: [msg(), msg()] })).toHaveLength(2);
    expect(eventoDeMensagem({ event: "connection.update", data: msg() })).toHaveLength(0);
  });
});

describe("adaptador WhatsApp", () => {
  async function montar() {
    const enviadas: Array<{ url: string; corpo: unknown }> = [];
    const adaptador = criarAdaptadorWhatsapp({
      urlApi: "https://evo.exemplo/",
      apiKey: "chave",
      instancia: "vianna",
      tokenWebhook: "segredo-123",
      logger: pino({ level: "silent" }),
      fetch: (async (url: string, init: RequestInit) => {
        enviadas.push({ url, corpo: JSON.parse(String(init.body)) });
        return new Response("{}", { status: 201 });
      }) as unknown as typeof fetch,
    });
    const recebidas: MensagemEntrada[] = [];
    adaptador.onMessage((m) => recebidas.push(m));
    const servidor = Fastify();
    await adaptador.iniciar(servidor);
    return { adaptador, servidor, enviadas, recebidas };
  }

  it("rejeita webhook com token errado", async () => {
    const { servidor, recebidas } = await montar();
    const r = await servidor.inject({ method: "POST", url: "/webhooks/whatsapp/errado", payload: { event: "messages.upsert", data: msg({ messageTimestamp: Date.now() / 1000 }) } });
    expect(r.statusCode).toBe(401);
    expect(recebidas).toHaveLength(0);
  });

  it("entrega a mensagem ao manipulador uma única vez (reentrega ignorada)", async () => {
    const { servidor, recebidas } = await montar();
    const payload = { event: "messages.upsert", data: msg({ messageTimestamp: Date.now() / 1000 }) };
    await servidor.inject({ method: "POST", url: "/webhooks/whatsapp/segredo-123", payload });
    await servidor.inject({ method: "POST", url: "/webhooks/whatsapp/segredo-123", payload });
    expect(recebidas).toEqual([
      { canal: "whatsapp", chatId: "5511987654321", clienteNome: "Maria", telefone: "5511987654321", texto: "oi, quero uma pizza" },
    ]);
  });

  it("envia texto e imagem pela API da instância", async () => {
    const { adaptador, enviadas } = await montar();
    await adaptador.sendMessage("5511987654321", "Olá!");
    await adaptador.sendImage!("5511987654321", { conteudo: Buffer.from("png"), tipoMime: "image/png", legenda: "QR" });
    expect(enviadas[0]).toEqual({ url: "https://evo.exemplo/message/sendText/vianna", corpo: { number: "5511987654321", text: "Olá!" } });
    expect(enviadas[1]).toMatchObject({
      url: "https://evo.exemplo/message/sendMedia/vianna",
      corpo: { mediatype: "image", mimetype: "image/png", media: Buffer.from("png").toString("base64"), caption: "QR" },
    });
  });
});
