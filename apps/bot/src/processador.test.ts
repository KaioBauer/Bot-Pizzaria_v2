import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("espera o cliente terminar de digitar", () => {
  afterEach(() => vi.useRealTimers());

  it("junta mensagens mandadas em sequência numa resposta só", async () => {
    vi.useFakeTimers();
    const processadas: string[] = [];
    const p = criarProcessadorPorChat(async (m) => void processadas.push(m.texto), undefined, { esperaMs: 5000, esperaMaximaMs: 20000 });
    p.receber(msg("1", "oi"));
    await vi.advanceTimersByTimeAsync(3000);
    p.receber(msg("1", "quero uma calabresa"));
    await vi.advanceTimersByTimeAsync(4000); // 7 s desde a primeira, só 4 s de silêncio
    expect(processadas).toEqual([]);
    p.receber(msg("1", "grande"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(processadas).toEqual(["oi\nquero uma calabresa\ngrande"]);
  });

  it("não espera mais que o teto, mesmo com o cliente mandando sem parar", async () => {
    vi.useFakeTimers();
    const processadas: string[] = [];
    const p = criarProcessadorPorChat(async (m) => void processadas.push(m.texto), undefined, { esperaMs: 5000, esperaMaximaMs: 12000 });
    for (let i = 0; i < 4; i++) {
      p.receber(msg("1", `m${i}`));
      await vi.advanceTimersByTimeAsync(3000);
    }
    expect(processadas).toEqual(["m0\nm1\nm2\nm3"]); // respondeu aos 12 s
  });

  it("chats diferentes esperam cada um o seu silêncio", async () => {
    vi.useFakeTimers();
    const processadas: string[] = [];
    const p = criarProcessadorPorChat(async (m) => void processadas.push(`${m.chatId}:${m.texto}`), undefined, { esperaMs: 5000 });
    p.receber(msg("1", "a"));
    await vi.advanceTimersByTimeAsync(3000);
    p.receber(msg("2", "b"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(processadas).toEqual(["1:a"]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(processadas).toEqual(["1:a", "2:b"]);
  });
});
