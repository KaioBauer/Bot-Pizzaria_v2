import { describe, expect, it } from "vitest";
import { descreverErrosZod, finalizarPedidoArgsSchema } from "./schemas";

const UUID = "00000000-0000-4000-8000-000000000001";

const valido = {
  itens: [{ sabores: [{ produto_id: UUID, variacao_id: UUID }], quantidade: 1 }],
  tipo_entrega: "retirada",
  forma_pagamento: "cartao",
  cliente_nome: "Maria",
  cliente_telefone: "(11) 98765-4321",
};

function erros(entrada: unknown): string {
  const r = finalizarPedidoArgsSchema.safeParse(entrada);
  return r.success ? "" : descreverErrosZod(r.error);
}

describe("finalizarPedidoArgsSchema", () => {
  it("aceita o mínimo válido e normaliza campos", () => {
    const r = finalizarPedidoArgsSchema.parse(valido);
    expect(r.cliente_telefone).toBe("11987654321");
    expect(r.itens[0]?.adicionais).toEqual([]);
    expect(r.itens[0]?.observacao).toBeNull();
    expect(r.observacoes).toBeNull();
  });

  it("converte observação vazia em null e corta espaços", () => {
    const r = finalizarPedidoArgsSchema.parse({
      ...valido,
      observacoes: "   ",
      itens: [{ ...valido.itens[0], observacao: "  sem cebola  " }],
    });
    expect(r.observacoes).toBeNull();
    expect(r.itens[0]?.observacao).toBe("sem cebola");
  });

  it("exige endereço na entrega", () => {
    expect(erros({ ...valido, tipo_entrega: "entrega" })).toMatch(/endereco: Endereço é obrigatório/);
  });

  it("aceita entrega com endereço completo", () => {
    const r = finalizarPedidoArgsSchema.safeParse({
      ...valido,
      tipo_entrega: "entrega",
      endereco: { rua: "Rua A", numero: "10", bairro_id: UUID },
    });
    expect(r.success).toBe(true);
  });

  it("rejeita endereço sem número ou bairro", () => {
    expect(
      erros({ ...valido, tipo_entrega: "entrega", endereco: { rua: "Rua A", numero: "", bairro_id: "x" } })
    ).toMatch(/endereco\.numero.*endereco\.bairro_id/);
  });

  it("troco só com dinheiro", () => {
    expect(erros({ ...valido, troco_para: 100 })).toMatch(/troco_para: Troco só se aplica/);
    expect(finalizarPedidoArgsSchema.safeParse({ ...valido, forma_pagamento: "dinheiro", troco_para: 100 }).success).toBe(true);
  });

  it.each([
    ["sem itens", { ...valido, itens: [] }, /itens/],
    ["mais de 6 sabores", { ...valido, itens: [{ sabores: Array(7).fill({ produto_id: UUID, variacao_id: UUID }), quantidade: 1 }] }, /6 sabores/],
    ["quantidade zero", { ...valido, itens: [{ ...valido.itens[0], quantidade: 0 }] }, /quantidade/],
    ["quantidade fracionada", { ...valido, itens: [{ ...valido.itens[0], quantidade: 1.5 }] }, /quantidade/],
    ["ID que não é UUID", { ...valido, itens: [{ sabores: [{ produto_id: "calabresa", variacao_id: UUID }], quantidade: 1 }] }, /ID inválido/],
    ["forma de pagamento desconhecida", { ...valido, forma_pagamento: "fiado" }, /forma_pagamento/],
    ["telefone sem DDD", { ...valido, cliente_telefone: "98765-4321" }, /DDD/],
    ["nome vazio", { ...valido, cliente_nome: " " }, /cliente_nome/],
  ])("rejeita %s", (_nome, entrada, esperado) => {
    expect(erros(entrada)).toMatch(esperado);
  });

  it("ignora campos de preço enviados pelo modelo", () => {
    const r = finalizarPedidoArgsSchema.parse({ ...valido, valor_total: 1, itens: [{ ...valido.itens[0], preco: 0.01 }] });
    expect(r).not.toHaveProperty("valor_total");
    expect(r.itens[0]).not.toHaveProperty("preco");
  });
});
