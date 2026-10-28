import pino from "pino";
import { describe, expect, it } from "vitest";
import { PREFIXO_AUDIO, type Transcritor } from "@pizzaria/core";
import { criarPreparadorMensagens, MENSAGEM_AUDIO_DESLIGADO, MENSAGEM_AUDIO_FALHOU, MENSAGEM_AUDIO_LONGO } from "./audio";
import type { ChannelAdapter, MensagemCanal } from "./canais/tipos";
import { criarProcessadorPorChat } from "./processador";

function montar(opcoes: { transcritor?: Transcritor | null; pausada?: boolean } = {}) {
  const enviadas: string[] = [];
  const dicas: Array<string | undefined> = [];
  const canal = { canal: "whatsapp", sendMessage: async (_chat: string, texto: string) => void enviadas.push(texto) } as unknown as ChannelAdapter;
  const transcritor: Transcritor = {
    async transcrever(audio, dica) {
      dicas.push(dica);
      return `  quero uma ${audio.conteudo.toString()}  grande `;
    },
  };
  const preparar = criarPreparadorMensagens({
    transcritor: opcoes.transcritor === undefined ? transcritor : opcoes.transcritor,
    canais: new Map([["whatsapp", canal]]),
    repos: {
      loja: { configuracao: async () => ({ nomePizzaria: "Vianna Pizzaria" }) },
      cardapio: { ativo: async () => [{ id: "c", nome: "Pizzas", ordem: 1, produtos: [{ id: "p", nome: "Calabresa", descricao: null, imagemUrl: null, variacoes: [{ id: "v", nome: "Grande", tipo: "tamanho", precoCentavos: 5500 }] }] }] },
      atendimento: { iaPausada: async () => opcoes.pausada ?? false },
    } as never,
    duracaoMaximaSegundos: 60,
    logger: pino({ level: "silent" }),
  });
  return { preparar, enviadas, dicas };
}

const audio = (conteudo = "calabresa", duracaoSegundos: number | null = 5): MensagemCanal => ({
  canal: "whatsapp",
  chatId: "5547999990000",
  audio: { duracaoSegundos, baixar: async () => ({ conteudo: Buffer.from(conteudo), mime: "audio/ogg" }) },
});

describe("preparar mensagens (áudio)", () => {
  it("texto passa direto", async () => {
    const { preparar } = montar();
    expect(await preparar({ canal: "whatsapp", chatId: "1", texto: "oi" })).toBe("oi");
  });

  it("transcreve com dica do cardápio e marca como áudio", async () => {
    const { preparar, dicas } = montar();
    expect(await preparar(audio())).toBe(`${PREFIXO_AUDIO} quero uma calabresa grande`);
    expect(dicas[0]).toContain("Vianna Pizzaria");
    expect(dicas[0]).toContain("Calabresa");
  });

  it("transcrição desligada, áudio longo ou falha: avisa o cliente e descarta", async () => {
    const desligado = montar({ transcritor: null });
    expect(await desligado.preparar(audio())).toBeNull();
    expect(desligado.enviadas).toEqual([MENSAGEM_AUDIO_DESLIGADO]);

    const longo = montar();
    expect(await longo.preparar(audio("x", 600))).toBeNull();
    expect(longo.enviadas).toEqual([MENSAGEM_AUDIO_LONGO]);

    const falha = montar({ transcritor: { transcrever: async () => Promise.reject(new Error("api")) } });
    expect(await falha.preparar(audio())).toBeNull();
    expect(falha.enviadas).toEqual([MENSAGEM_AUDIO_FALHOU]);
  });

  it("com atendente humano, não responde: o painel recebe o aviso do áudio", async () => {
    const { preparar, enviadas } = montar({ transcritor: null, pausada: true });
    expect(await preparar(audio())).toMatch(/áudio recebido/);
    expect(enviadas).toEqual([]);
  });

  it("no processador, áudio e texto do mesmo chat seguem a ordem de chegada", async () => {
    const { preparar } = montar();
    const processadas: string[] = [];
    let liberar!: () => void;
    const primeira = new Promise<void>((r) => (liberar = r));
    const processador = criarProcessadorPorChat(async (m) => {
      processadas.push(m.texto);
      if (processadas.length === 1) await primeira;
    }, preparar);
    processador.receber({ canal: "whatsapp", chatId: "1", texto: "oi" });
    processador.receber({ ...audio("portuguesa"), chatId: "1" });
    processador.receber({ canal: "whatsapp", chatId: "1", texto: "para entrega" });
    liberar();
    await processador.ocioso();
    expect(processadas).toEqual(["oi", `${PREFIXO_AUDIO} quero uma portuguesa grande\npara entrega`]);
  });
});
