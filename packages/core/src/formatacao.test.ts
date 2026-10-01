import { describe, expect, it } from "vitest";
import { normalizarFormatacao } from "./formatacao";

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
