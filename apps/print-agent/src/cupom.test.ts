import { describe, expect, it } from "vitest";
import { cupomComoTexto, emColunas, montarCupom, quebrar, type PedidoParaCupom } from "./cupom";

const pedido: PedidoParaCupom = {
  numero: 12,
  criadoEm: new Date("2026-10-01T23:41:00Z"),
  canal: "telegram",
  clienteNome: "Maria Souza",
  clienteTelefone: "11987654321",
  tipoEntrega: "entrega",
  enderecoTexto: "Rua das Palmeiras, 120 (apto 31) - Centro. Ref.: portão azul",
  formaPagamento: "dinheiro",
  trocoParaCentavos: 10000,
  subtotalCentavos: 7500,
  taxaEntregaCentavos: 700,
  totalCentavos: 8200,
  observacoes: null,
  itens: [
    {
      quantidade: 1,
      descricao: "Meio a meio Calabresa / Margherita (Grande) + Borda Catupiry",
      observacao: "sem cebola",
      subtotalCentavos: 6300,
    },
    { quantidade: 2, descricao: "Coca-Cola Lata", observacao: null, subtotalCentavos: 1200 },
  ],
};

const opcoes = { colunas: 32, nomePizzaria: "Vianna Pizzaria", fusoHorario: "America/Sao_Paulo" };

describe("montarCupom", () => {
  const texto = cupomComoTexto(montarCupom(pedido, opcoes), 32);

  it("nenhuma linha passa da largura do papel", () => {
    const comandos = montarCupom(pedido, opcoes);
    for (const c of comandos) {
      if (c.tipo !== "texto") continue;
      expect(c.texto.length, c.texto).toBeLessThanOrEqual(c.grande ? 16 : 32);
    }
  });

  it("tem os dados essenciais", () => {
    expect(texto).toContain("PEDIDO #12");
    expect(texto).toContain("01/10/2026 20:41"); // horário de São Paulo
    expect(texto).toContain("Tel: (11) 98765-4321");
    expect(texto).toContain("ENTREGA");
    expect(texto).toMatch(/\n {3}\+ Borda Catupiry\s+63,00/);
    expect(texto).toContain("\n   OBS: sem cebola");
    expect(texto).toMatch(/2x Coca-Cola Lata\s+12,00/);
    expect(texto).toMatch(/Taxa de entrega\s+7,00/);
    expect(texto).toMatch(/TOTAL\s+R\$ 82,00/);
    expect(texto).toContain("PAGAMENTO: DINHEIRO");
  });

  it("calcula o troco que o entregador deve levar", () => {
    expect(texto).toContain("Troco para R$ 100,00");
    expect(texto).toContain("LEVAR TROCO: R$ 18,00");
  });

  it("retirada sem taxa não mostra subtotal nem taxa", () => {
    const retirada = cupomComoTexto(
      montarCupom(
        { ...pedido, tipoEntrega: "retirada", enderecoTexto: null, taxaEntregaCentavos: 0, totalCentavos: 7500, formaPagamento: "cartao", trocoParaCentavos: null },
        opcoes
      ),
      32
    );
    expect(retirada).toContain("RETIRADA NO BALCAO");
    expect(retirada).not.toContain("Taxa de entrega");
    expect(retirada).toContain("PAGAMENTO: CARTAO (MAQUININHA)");
    expect(retirada).not.toContain("TROCO");
  });

  it("marca reimpressão", () => {
    expect(cupomComoTexto(montarCupom(pedido, { ...opcoes, reimpressao: true }), 32)).toContain("REIMPRESSAO");
  });

  it("termina com corte", () => {
    expect(montarCupom(pedido, opcoes).at(-1)).toEqual({ tipo: "corte" });
  });
});

describe("quebrar / emColunas", () => {
  it("quebra por palavras com recuo", () => {
    expect(quebrar("1x Meio a meio Calabresa / Margherita", 16, "   ")).toEqual([
      "1x Meio a meio",
      "   Calabresa /",
      "   Margherita",
    ]);
  });

  it("preserva o recuo inicial", () => {
    expect(quebrar("   + Borda Catupiry", 32)).toEqual(["   + Borda Catupiry"]);
    expect(emColunas("   + Borda", "8,00", 16)).toEqual(["   + Borda  8,00"]);
  });

  it("corta palavras maiores que a linha", () => {
    expect(quebrar("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("alinha o valor à direita", () => {
    expect(emColunas("Total", "10,00", 16)).toEqual(["Total      10,00"]);
    expect(emColunas("Pizza muito comprida", "10,00", 16)).toEqual(["Pizza muito", "comprida   10,00"]);
  });
});
