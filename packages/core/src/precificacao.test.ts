import { describe, expect, it } from "vitest";
import type { ItemPedidoArgs } from "@pizzaria/shared";
import { cotarPedido, idsDeVariacao, precificarItens } from "./precificacao";
import { BAIRROS, ID, sabor, variacoesDeTeste } from "./testes/fixtures";

const item = (parcial: Partial<ItemPedidoArgs> & Pick<ItemPedidoArgs, "sabores">): ItemPedidoArgs => ({
  adicionais: [],
  quantidade: 1,
  observacao: null,
  ...parcial,
});

const calabresaGrande = sabor(ID.calabresa, ID.calabresaGrande);
const margheritaGrande = sabor(ID.margherita, ID.margheritaGrande);

describe("precificarItens", () => {
  it("usa o preço do banco e multiplica pela quantidade", () => {
    const r = precificarItens([item({ sabores: [calabresaGrande], quantidade: 2 })], variacoesDeTeste());
    expect(r).toMatchObject({ ok: true, subtotalCentavos: 11000 });
    if (!r.ok) return;
    expect(r.itens[0]).toMatchObject({
      precoUnitarioCentavos: 5500,
      subtotalCentavos: 11000,
      descricao: "Calabresa (Grande)",
    });
  });

  it("reflete mudança de preço no banco (o valor do LLM nunca é usado)", () => {
    const variacoes = variacoesDeTeste({ [ID.calabresaGrande]: { precoCentavos: 6290 } });
    const r = precificarItens([item({ sabores: [calabresaGrande] })], variacoes);
    expect(r).toMatchObject({ ok: true, subtotalCentavos: 6290 });
  });

  it("meio a meio cobra o sabor mais caro", () => {
    const r = precificarItens([item({ sabores: [calabresaGrande, margheritaGrande] })], variacoesDeTeste());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens[0]?.precoUnitarioCentavos).toBe(5900);
    expect(r.itens[0]?.descricao).toBe("Meio a meio Calabresa / Margherita (Grande)");
    expect(r.itens[0]?.componentes.filter((c) => c.tipo === "sabor")).toHaveLength(2);
  });

  it("soma borda ao preço base", () => {
    const r = precificarItens(
      [item({ sabores: [calabresaGrande], adicionais: [ID.calabresaBorda], quantidade: 2 })],
      variacoesDeTeste()
    );
    expect(r).toMatchObject({ ok: true, subtotalCentavos: (5500 + 800) * 2 });
    if (r.ok) expect(r.itens[0]?.descricao).toBe("Calabresa (Grande) + Borda Catupiry");
  });

  it("aceita borda de qualquer um dos sabores no meio a meio", () => {
    const r = precificarItens(
      [item({ sabores: [calabresaGrande, margheritaGrande], adicionais: [ID.margheritaBorda] })],
      variacoesDeTeste()
    );
    expect(r).toMatchObject({ ok: true, subtotalCentavos: 5900 + 800 });
  });

  it("bebida de variação única usa só o nome do produto", () => {
    const r = precificarItens([item({ sabores: [sabor(ID.coca, ID.cocaUnica)], quantidade: 3 })], variacoesDeTeste());
    expect(r).toMatchObject({ ok: true, subtotalCentavos: 1800 });
    if (r.ok) expect(r.itens[0]?.descricao).toBe("Coca-Cola Lata");
  });

  describe("rejeita", () => {
    const casos: Array<[string, ItemPedidoArgs, RegExp]> = [
      ["variação inexistente", item({ sabores: [sabor(ID.calabresa, ID.inexistente)] }), /não existe/],
      ["borda como sabor", item({ sabores: [sabor(ID.calabresa, ID.calabresaBorda)] }), /adicionais/],
      [
        "meio a meio com tamanhos diferentes",
        item({ sabores: [calabresaGrande, sabor(ID.margherita, ID.margheritaMedia)] }),
        /mesmo tamanho/,
      ],
      ["meio a meio com o mesmo sabor", item({ sabores: [calabresaGrande, calabresaGrande] }), /diferentes/],
      [
        "meio a meio com bebida",
        item({ sabores: [calabresaGrande, sabor(ID.coca, ID.cocaUnica)] }),
        /só é possível em pizzas/,
      ],
      [
        "adicional de produto que não está no item",
        item({ sabores: [calabresaGrande], adicionais: [ID.margheritaBorda] }),
        /não é oferecido/,
      ],
      [
        "tamanho usado como adicional",
        item({ sabores: [calabresaGrande], adicionais: [ID.calabresaMedia] }),
        /não é borda nem adicional/,
      ],
      [
        "duas bordas",
        item({ sabores: [calabresaGrande], adicionais: [ID.calabresaBorda, ID.calabresaBordaCheddar] }),
        /uma borda/,
      ],
      [
        "adicional repetido",
        item({ sabores: [calabresaGrande], adicionais: [ID.calabresaBorda, ID.calabresaBorda] }),
        /mais de uma vez/,
      ],
    ];

    it.each(casos)("%s", (_nome, entrada, erroEsperado) => {
      const r = precificarItens([entrada], variacoesDeTeste());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erros.join(" ")).toMatch(erroEsperado);
    });

    it("variação inativa", () => {
      const r = precificarItens(
        [item({ sabores: [calabresaGrande] })],
        variacoesDeTeste({ [ID.calabresaGrande]: { ativa: false } })
      );
      expect(r).toMatchObject({ ok: false, erros: [expect.stringMatching(/não está disponível/)] });
    });

    it("produto inativo", () => {
      const r = precificarItens(
        [item({ sabores: [calabresaGrande] })],
        variacoesDeTeste({ [ID.calabresaGrande]: { produtoAtivo: false } })
      );
      expect(r.ok).toBe(false);
    });

    it("borda inativa", () => {
      const r = precificarItens(
        [item({ sabores: [calabresaGrande], adicionais: [ID.calabresaBorda] })],
        variacoesDeTeste({ [ID.calabresaBorda]: { ativa: false } })
      );
      expect(r.ok).toBe(false);
    });
  });

  it("produto_id corrompido pelo modelo: vale o produto da variação (preço e nome do servidor)", () => {
    const r = precificarItens([item({ sabores: [sabor("c019ccf7-0000-0000-0000-000000000000", ID.calabresaGrande)] })], variacoesDeTeste());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itens[0]?.descricao).toContain("Calabresa");
      expect(r.itens[0]?.componentes[0]).toMatchObject({ produtoId: ID.calabresa, variacaoId: ID.calabresaGrande });
    }
  });

  it("indica qual item tem problema e junta erros de vários itens", () => {
    const r = precificarItens(
      [
        item({ sabores: [calabresaGrande] }),
        item({ sabores: [sabor(ID.calabresa, ID.inexistente)] }),
        item({ sabores: [sabor(ID.calabresa, ID.calabresaBorda)] }),
      ],
      variacoesDeTeste()
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros).toHaveLength(2);
      expect(r.erros[0]).toMatch(/^Item 2:/);
      expect(r.erros[1]).toMatch(/^Item 3:/);
    }
  });
});

describe("cotarPedido", () => {
  const base = {
    itens: [item({ sabores: [calabresaGrande] })],
    variacoes: variacoesDeTeste(),
    bairros: BAIRROS,
    pedidoMinimoCentavos: 0,
  };

  it("retirada não tem taxa", () => {
    const r = cotarPedido({ ...base, tipoEntrega: "retirada", bairroId: null });
    expect(r).toMatchObject({ ok: true, cotacao: { taxaEntregaCentavos: 0, totalCentavos: 5500 } });
  });

  it("entrega soma a taxa do bairro", () => {
    const r = cotarPedido({ ...base, tipoEntrega: "entrega", bairroId: ID.bairroCentro });
    expect(r).toMatchObject({
      ok: true,
      cotacao: { subtotalCentavos: 5500, taxaEntregaCentavos: 500, totalCentavos: 6000, bairro: { nome: "Centro" } },
    });
  });

  it("rejeita bairro não atendido listando os atendidos", () => {
    const r = cotarPedido({ ...base, tipoEntrega: "entrega", bairroId: ID.inexistente });
    expect(r).toMatchObject({ ok: false, erros: [expect.stringMatching(/Bairros atendidos: Centro/)] });
  });

  it("sem bairros cadastrados, informa que só há retirada", () => {
    const r = cotarPedido({ ...base, bairros: [], tipoEntrega: "entrega", bairroId: ID.bairroCentro });
    expect(r).toMatchObject({ ok: false, erros: [expect.stringMatching(/apenas retirada/)] });
  });

  it("aplica pedido mínimo sobre o subtotal (sem a taxa)", () => {
    const r = cotarPedido({ ...base, pedidoMinimoCentavos: 5600, tipoEntrega: "entrega", bairroId: ID.bairroCentro });
    expect(r).toMatchObject({ ok: false, erros: [expect.stringMatching(/pedido mínimo é R\$ 56,00/)] });
  });
});

describe("idsDeVariacao", () => {
  it("junta sabores e adicionais sem repetir", () => {
    expect(
      idsDeVariacao([
        item({ sabores: [calabresaGrande], adicionais: [ID.calabresaBorda] }),
        item({ sabores: [calabresaGrande, margheritaGrande] }),
      ]).sort()
    ).toEqual([ID.calabresaGrande, ID.calabresaBorda, ID.margheritaGrande].sort());
  });
});

describe("precificarItens com tamanhos do cardápio real", () => {
  // Grande: base R$ 60, até 2 sabores. Big: base R$ 80, até 3 sabores.
  // Calabresa = sabor comum (preço = base); Margherita = especial (+R$ 15).
  const tamanhos = [
    { nome: "Grande", fatias: 8, maxSabores: 2, precoBaseCentavos: 6000 },
    { nome: "Big", fatias: 12, maxSabores: 3, precoBaseCentavos: 8000 },
  ];
  const ids = {
    calabresaBig: "00000000-0000-4000-8000-0000000000c1",
    margheritaBig: "00000000-0000-4000-8000-0000000000c2",
    cocaBig: "00000000-0000-4000-8000-0000000000c3",
  };
  const variacoes = new Map(variacoesDeTeste({
    [ID.calabresaGrande]: { precoCentavos: 6000 },
    [ID.margheritaGrande]: { precoCentavos: 7500 },
  }));
  const extra = (id: string, produtoId: string, produtoNome: string, preco: number) =>
    variacoes.set(id, { id, produtoId, produtoNome, nome: "Big", tipo: "tamanho", precoCentavos: preco, ativa: true, produtoAtivo: true });
  extra(ids.calabresaBig, ID.calabresa, "Calabresa", 8000);
  extra(ids.margheritaBig, ID.margherita, "Margherita", 9500);
  extra(ids.cocaBig, ID.coca, "Terceiro Sabor", 8000);

  it("um sabor especial custa o próprio preço (base + adicional)", () => {
    const r = precificarItens([item({ sabores: [margheritaGrande] })], variacoes, tamanhos);
    expect(r).toMatchObject({ ok: true, subtotalCentavos: 7500 });
  });

  it("meio a meio soma o adicional de cada sabor especial ao preço base", () => {
    const r = precificarItens([item({ sabores: [calabresaGrande, margheritaGrande] })], variacoes, tamanhos);
    expect(r).toMatchObject({ ok: true, subtotalCentavos: 6000 + 1500 });
  });

  it("3 sabores na Big: base + adicionais, com descrição de 3 sabores", () => {
    const r = precificarItens(
      [item({ sabores: [sabor(ID.calabresa, ids.calabresaBig), sabor(ID.margherita, ids.margheritaBig), sabor(ID.coca, ids.cocaBig)] })],
      variacoes,
      tamanhos
    );
    expect(r).toMatchObject({ ok: true, subtotalCentavos: 8000 + 1500 });
    if (r.ok) expect(r.itens[0]?.descricao).toBe("3 sabores Calabresa / Margherita / Terceiro Sabor (Big)");
  });

  it("respeita o limite de sabores do tamanho", () => {
    const r = precificarItens(
      [item({ sabores: [calabresaGrande, margheritaGrande, sabor(ID.coca, ID.cocaUnica)] })],
      variacoes,
      tamanhos
    );
    expect(r.ok).toBe(false);
  });

  it("borda continua somando ao total", () => {
    const r = precificarItens([item({ sabores: [calabresaGrande, margheritaGrande], adicionais: [ID.calabresaBorda] })], variacoes, tamanhos);
    expect(r).toMatchObject({ ok: true, subtotalCentavos: 6000 + 1500 + 800 });
  });

  it("informa o limite quando passa do máximo de sabores", () => {
    const r = precificarItens(
      [item({ sabores: [sabor(ID.calabresa, ids.calabresaBig), sabor(ID.margherita, ids.margheritaBig), sabor(ID.coca, ids.cocaBig)] })],
      variacoes,
      [{ nome: "Big", fatias: 12, maxSabores: 2, precoBaseCentavos: 8000 }]
    );
    expect(r).toMatchObject({ ok: false, erros: [expect.stringMatching(/a Big aceita até 2 sabores/)] });
  });
});
