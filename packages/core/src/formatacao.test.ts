import { describe, expect, it } from "vitest";
import { corrigirLinkCardapio, normalizarFormatacao } from "./formatacao";

describe("normalizarFormatacao", () => {
  it("converte negrito duplo em simples", () => {
    expect(normalizarFormatacao("**Total:** R$ 82,00")).toBe("*Total:* R$ 82,00");
  });

  it("converte títulos em negrito", () => {
    expect(normalizarFormatacao("## Resumo\nitem")).toBe("*Resumo*\nitem");
  });

  it("remove espaços no fim da linha e excesso de linhas em branco", () => {
    expect(normalizarFormatacao("a  \n\n\n\nb ")).toBe("a\n\nb");
  });

  it("preserva negrito simples e asteriscos isolados", () => {
    expect(normalizarFormatacao("*Total: R$ 10,00* e 2 * 3")).toBe("*Total: R$ 10,00* e 2 * 3");
  });
});

describe("corrigirLinkCardapio", () => {
  const atual = "http://192.168.3.192.nip.io:3000/cardapio";
  it.each([
    ["Cardápio: http://192.168.3.192:3000/cardapio\n\nResumo", `Cardápio: ${atual}\n\nResumo`],
    ["veja em http://localhost:3000/cardapio.", `veja em ${atual}.`],
    [`já certo: ${atual}`, `já certo: ${atual}`],
    ["sem link aqui", "sem link aqui"],
    ["outra página http://exemplo.com/cardapio-antigo", "outra página http://exemplo.com/cardapio-antigo"],
  ])("%s", (entrada, esperado) => {
    expect(corrigirLinkCardapio(entrada, atual)).toBe(esperado);
  });

  it("sem link configurado não mexe", () => {
    expect(corrigirLinkCardapio("http://x/cardapio", null)).toBe("http://x/cardapio");
  });
});
