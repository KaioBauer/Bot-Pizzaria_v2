import { describe, expect, it } from "vitest";
import { calcularPedidoArgsSchema, descreverErrosZod, finalizarPedidoArgsSchema } from "./schemas";

const UUID = "00000000-0000-4000-8000-000000000001";

const item = { sabores: [{ produto_id: UUID, variacao_id: UUID }], quantidade: 1 };
const valido = {
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
    expect(r.observacoes).toBeNull();
  });

  it("não recebe itens nem tipo de entrega (vêm do resumo confirmado)", () => {
    const r = finalizarPedidoArgsSchema.parse({ ...valido, itens: [item], tipo_entrega: "entrega" });
    expect(r).not.toHaveProperty("itens");
    expect(r).not.toHaveProperty("tipo_entrega");
  });

  it("converte observação vazia em null", () => {
    expect(finalizarPedidoArgsSchema.parse({ ...valido, observacoes: "   " }).observacoes).toBeNull();
  });

  it("aceita endereço completo", () => {
    const r = finalizarPedidoArgsSchema.safeParse({ ...valido, endereco: { rua: "Rua A", numero: "10", bairro_id: UUID } });
    expect(r.success).toBe(true);
  });

  it("rejeita endereço sem número ou bairro", () => {
    expect(erros({ ...valido, endereco: { rua: "Rua A", numero: "", bairro_id: "x" } })).toMatch(/endereco\.numero.*endereco\.bairro_id/);
  });

  it("troco só com dinheiro", () => {
    expect(erros({ ...valido, troco_para: 100 })).toMatch(/troco_para: Troco só se aplica/);
    expect(finalizarPedidoArgsSchema.safeParse({ ...valido, forma_pagamento: "dinheiro", troco_para: 100 }).success).toBe(true);
  });

  it.each([
    ["forma de pagamento desconhecida", { ...valido, forma_pagamento: "fiado" }, /forma_pagamento/],
    ["telefone sem DDD", { ...valido, cliente_telefone: "98765-4321" }, /DDD/],
    ["nome vazio", { ...valido, cliente_nome: " " }, /cliente_nome/],
  ])("rejeita %s", (_nome, entrada, esperado) => {
    expect(erros(entrada)).toMatch(esperado);
  });

  it("ignora campos de preço enviados pelo modelo", () => {
    expect(finalizarPedidoArgsSchema.parse({ ...valido, valor_total: 1 })).not.toHaveProperty("valor_total");
  });
});

describe("calcularPedidoArgsSchema (itens)", () => {
  const cotar = (itens: unknown[]) => calcularPedidoArgsSchema.safeParse({ itens, tipo_entrega: "retirada" });
  const errosCotar = (itens: unknown[]) => {
    const r = cotar(itens);
    return r.success ? "" : descreverErrosZod(r.error);
  };

  it("normaliza adicionais e observação", () => {
    const r = calcularPedidoArgsSchema.parse({ itens: [{ ...item, observacao: "  sem cebola  " }], tipo_entrega: "retirada" });
    expect(r.itens[0]?.adicionais).toEqual([]);
    expect(r.itens[0]?.observacao).toBe("sem cebola");
  });

  it.each([
    ["sem itens", [], /itens/],
    ["mais de 6 sabores", [{ sabores: Array(7).fill({ produto_id: UUID, variacao_id: UUID }), quantidade: 1 }], /6 sabores/],
    ["quantidade zero", [{ ...item, quantidade: 0 }], /quantidade/],
    ["quantidade fracionada", [{ ...item, quantidade: 1.5 }], /quantidade/],
    ["ID que não é UUID", [{ sabores: [{ produto_id: "calabresa", variacao_id: UUID }], quantidade: 1 }], /ID inválido/],
  ])("rejeita %s", (_nome, itens, esperado) => {
    expect(errosCotar(itens)).toMatch(esperado);
  });

  it("ignora preço enviado pelo modelo", () => {
    const r = calcularPedidoArgsSchema.parse({ itens: [{ ...item, preco: 0.01 }], tipo_entrega: "retirada" });
    expect(r.itens[0]).not.toHaveProperty("preco");
  });
});
