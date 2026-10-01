import { describe, expect, it } from "vitest";
import { centavosParaCampo, formatarReais, formatarTelefone, lerReais, paraCentavos } from "./dinheiro";

describe("dinheiro", () => {
  it.each([
    ["35", 3500],
    ["35,9", 3590],
    ["35,90", 3590],
    ["35.90", 3590],
    ["R$ 1.234,56", 123456],
    ["1.234", 123400],
    ["0", 0],
  ])("lerReais(%s) = %i", (entrada, esperado) => {
    expect(lerReais(entrada)).toBe(esperado);
  });

  it.each(["", "abc", "-5", "1,234,5", "3,999"])("rejeita %s", (entrada) => {
    expect(lerReais(entrada)).toBeNull();
  });

  it("converte sem erro de ponto flutuante", () => {
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
    expect(paraCentavos("19.99")).toBe(1999);
  });

  it("formata", () => {
    expect(formatarReais(123456)).toBe("R$ 1.234,56");
    expect(centavosParaCampo(3590)).toBe("35,90");
    expect(formatarTelefone("5511987654321")).toBe("(11) 98765-4321");
    expect(formatarTelefone("1133334444")).toBe("(11) 3333-4444");
  });
});
