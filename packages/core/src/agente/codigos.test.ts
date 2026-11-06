import { describe, expect, it } from "vitest";
import type { CategoriaCardapio } from "@pizzaria/shared";
import { abreviar, expandirArgumentos, expandirId, montarCodigos } from "./codigos";

const P1 = "95d34c12-6b4b-4553-bc7b-d1d3461e92e8";
const P2 = "c019ccf7-1111-4553-bc7b-d1d3461e92e8";
const V1 = "da3d4d7e-9d5d-4bfe-82b4-841a6ff854b9";
const V2 = "98a6abc2-0636-42a9-a1fc-c4482f532e2c";
const BORDA = "4b6de65a-19b5-4edc-bd18-f7517bcd0f51";
const BAIRRO = "1518bb1d-7bd8-4401-81d2-a6b85dd34adc";

const variacao = (id: string, nome: string, tipo: "tamanho" | "borda") => ({ id, nome, tipo, precoCentavos: 6000 });
const categorias = [
  {
    nome: "Salgadas",
    produtos: [
      { id: P1, nome: "Calabresa", descricao: null, variacoes: [variacao(V1, "Grande", "tamanho"), variacao(BORDA, "Borda Cheddar", "borda")] },
      { id: P2, nome: "Frango c/ Catupiry", descricao: null, variacoes: [variacao(V2, "Grande", "tamanho")] },
    ],
  },
] as unknown as CategoriaCardapio[];
const codigos = montarCodigos(categorias, [{ id: BAIRRO, nome: "Centro", taxaCentavos: 700 }]);

describe("códigos curtos", () => {
  it("usa 8 caracteres e alonga só quando há colisão", () => {
    const a = "abcdef12-0000-4000-8000-000000000001";
    const b = "abcdef12-9999-4000-8000-000000000002";
    expect(abreviar([V1, V2]).get(V1)).toBe("da3d4d7e");
    const curtos = abreviar([a, b]);
    expect(curtos.get(a)).toBe("abcdef12-0");
    expect(curtos.get(b)).toBe("abcdef12-9");
  });

  it("expande código curto, aceita UUID completo e recupera UUID com o fim inventado", () => {
    const ids = [V1, V2];
    expect(expandirId("da3d4d7e", ids)).toBe(V1);
    expect(expandirId(V2, ids)).toBe(V2);
    expect(expandirId("98a6abc2-0636-42a9-a1fc-000000000000", ids)).toBe(V2);
    expect(expandirId("ffffffff", ids)).toBe("ffffffff"); // desconhecido: a validação recusa
    expect(expandirId("da3", ids)).toBe("da3"); // curto demais para adivinhar
  });

  it("expande os argumentos e troca o produto_id pelo da variação", () => {
    const args = {
      itens: [{ sabores: [{ produto_id: "95d34c12", variacao_id: "da3d4d7e" }, { produto_id: "c019ccf7-b4..", variacao_id: "98a6abc2" }], adicionais: ["4b6de65a"], quantidade: 1 }],
      tipo_entrega: "entrega",
      bairro_id: "1518bb1d",
      endereco: { rua: "Rua A", numero: "1", bairro_id: "1518bb1d" },
    };
    expect(expandirArgumentos(args, codigos)).toEqual({
      itens: [{ sabores: [{ produto_id: P1, variacao_id: V1 }, { produto_id: P2, variacao_id: V2 }], adicionais: [BORDA], quantidade: 1 }],
      tipo_entrega: "entrega",
      bairro_id: BAIRRO,
      endereco: { rua: "Rua A", numero: "1", bairro_id: BAIRRO },
    });
  });
});
