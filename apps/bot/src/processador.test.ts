import { describe, expect, it } from "vitest";
import type { MensagemEntrada } from "@pizzaria/core";
import { dividirTexto } from "./canais/tipos";
import { criarProcessadorPorChat } from "./processador";

const msg = (chatId: string, texto: string): MensagemEntrada => ({ canal: "whatsapp", chatId, texto });

describe("criarProcessadorPorChat", () => {
  it("junta mensagens que chegam durante o processamento e mantém a ordem", async () => {
    const processadas: string[] = [];
    let liberar!: () => void;
    const primeira = new Promise<void>((r) => (liberar = r));

    const processador = criarProcessadorPorChat(async (m) => {
      processadas.push(m.texto);
      if (processadas.length === 1) await primeira;
    });

    processador.receber(msg("1", "oi"));
    processador.receber(msg("1", "quero uma calabresa"));
    processador.receber(msg("1", "grande"));
    liberar();
    await processador.ocioso();

    expect(processadas).toEqual(["oi", "quero uma calabresa\ngrande"]);
  });

  it("processa chats diferentes em paralelo", async () => {
    const ativos = new Set<string>();
    let maximo = 0;
    const processador = criarProcessadorPorChat(async (m) => {
      ativos.add(m.chatId);
      maximo = Math.max(maximo, ativos.size);
      await new Promise((r) => setTimeout(r, 10));
      ativos.delete(m.chatId);
    });
    processador.receber(msg("1", "a"));
    processador.receber(msg("2", "b"));
    await processador.ocioso();
    expect(maximo).toBe(2);
  });

  it("uma falha não trava o chat", async () => {
    const processadas: string[] = [];
    const processador = criarProcessadorPorChat(async (m) => {
      processadas.push(m.texto);
      if (m.texto === "falha") throw new Error("x");
    });
    processador.receber(msg("1", "falha"));
    await processador.ocioso();
    processador.receber(msg("1", "depois"));
    await processador.ocioso();
    expect(processadas).toEqual(["falha", "depois"]);
  });
});

describe("dividirTexto", () => {
  it("não divide textos curtos", () => {
    expect(dividirTexto("abc", 10)).toEqual(["abc"]);
  });

  it("quebra em linhas sem passar do limite", () => {
    const partes = dividirTexto("aaaa\nbbbb\ncccc", 9);
    expect(partes).toEqual(["aaaa\nbbbb", "cccc"]);
    expect(partes.every((p) => p.length <= 9)).toBe(true);
  });

  it("corta linhas maiores que o limite", () => {
    expect(dividirTexto("x".repeat(25), 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
});
