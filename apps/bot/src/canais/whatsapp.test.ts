import Fastify from "fastify";
import pino from "pino";
import { describe, expect, it } from "vitest";
import type { MensagemCanal } from "./tipos";
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
    expect(extrairMensagem(msg({ message: { imageMessage: {} } }), agora)).toEqual({ tipo: "sem_texto", chatId: "5511987654321" });
  });

  it("lê mensagem de voz com duração e formato", () => {
    const r = extrairMensagem(msg({ message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 7, ptt: true } } }), agora);
    expect(r).toEqual({ tipo: "audio", id: "ABC", chatId: "5511987654321", telefone: "5511987654321", nome: "Maria", duracaoSegundos: 7, mime: "audio/ogg; codecs=opus" });
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
        const corpo = url.includes("getBase64FromMediaMessage") ? { base64: Buffer.from("ogg").toString("base64"), mimetype: "audio/ogg" } : {};
        return new Response(JSON.stringify(corpo), { status: 201 });
      }) as unknown as typeof fetch,
    });
    const recebidas: MensagemCanal[] = [];
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

  it("aceita o webhook com o evento no caminho (Evolution 2.3)", async () => {
    const { servidor, recebidas } = await montar();
    const payload = { event: "messages.upsert", data: msg({ messageTimestamp: Date.now() / 1000 }) };
    const r = await servidor.inject({ method: "POST", url: "/webhooks/whatsapp/segredo-123/messages-upsert", payload });
    expect(r.statusCode).toBe(200);
    expect(recebidas).toHaveLength(1);
  });

  it("link do cardápio vai com prévia", async () => {
    const { adaptador, enviadas } = await montar();
    const url = "https://vianna.exemplo/cardapio";
    await adaptador.sendMessage("5511987654321", `Cardápio: ${url}`, { botao: { texto: "Ver cardápio", url } });
    expect(enviadas[0]?.corpo).toMatchObject({ linkPreview: true });
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

  it("áudio chega ao manipulador e é baixado pela Evolution só quando pedido", async () => {
    const { servidor, recebidas, enviadas } = await montar();
    const dados = msg({ messageTimestamp: Date.now() / 1000, message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 5 } } });
    await servidor.inject({ method: "POST", url: "/webhooks/whatsapp/segredo-123", payload: { event: "messages.upsert", data: dados } });
    expect(recebidas).toHaveLength(1);
    const audio = recebidas[0]!.audio!;
    expect(audio.duracaoSegundos).toBe(5);
    expect(enviadas).toHaveLength(0);
    const baixado = await audio.baixar();
    expect(baixado).toEqual({ conteudo: Buffer.from("ogg"), mime: "audio/ogg" });
    expect(enviadas[0]).toMatchObject({
      url: "https://evo.exemplo/chat/getBase64FromMediaMessage/vianna",
      corpo: { message: { key: { id: "ABC" } }, convertToMp4: false },
    });
  });

  it("envia texto e imagem pela API da instância", async () => {
    const { adaptador, enviadas } = await montar();
    await adaptador.sendMessage("5511987654321", "Olá!");
    await adaptador.sendImage!("5511987654321", { conteudo: Buffer.from("png"), tipoMime: "image/png", legenda: "QR" });
    expect(enviadas[0]).toEqual({ url: "https://evo.exemplo/message/sendText/vianna", corpo: { number: "5511987654321", text: "Olá!", linkPreview: false } });
    expect(enviadas[1]).toMatchObject({
      url: "https://evo.exemplo/message/sendMedia/vianna",
      corpo: { mediatype: "image", mimetype: "image/png", media: Buffer.from("png").toString("base64"), caption: "QR" },
    });
  });
});
