import { describe, expect, it } from "vitest";
import { criarLimiteTaxa } from "./limite-taxa";

describe("limite de taxa", () => {
  it("bloqueia acima do máximo e libera quando a janela passa", () => {
    let agora = 0;
    const limite = criarLimiteTaxa({ maximo: 2, janelaMs: 1000, agora: () => agora });
    expect(limite.consumir("a")).toBe(true);
    expect(limite.consumir("a")).toBe(true);
    expect(limite.consumir("a")).toBe(false);
    expect(limite.consumir("b")).toBe(true);
    agora = 1001;
    expect(limite.consumir("a")).toBe(true);
  });

  it("permite não registra", () => {
    const limite = criarLimiteTaxa({ maximo: 1, janelaMs: 1000 });
    expect(limite.permite("a")).toBe(true);
    expect(limite.permite("a")).toBe(true);
    limite.registrar("a");
    expect(limite.permite("a")).toBe(false);
  });
});
