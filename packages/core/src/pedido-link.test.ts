import { describe, expect, it } from "vitest";
import { loggerSilencioso } from "./logger";
import { criarServicoPix } from "./pagamentos/pix";
import { finalizarPedidoLink, telefoneComDdi } from "./pedido-link";
import { BAIRROS, configDeTeste, ID, ingredientesDeTeste, sabor, TAMANHOS, variacoesDeTeste } from "./testes/fixtures";
import { gatewayPixFalso, repositoriosEmMemoria } from "./testes/memoria";
import type { ConfiguracaoLoja } from "@pizzaria/shared";

const ABERTO = new Date("2026-10-02T20:00:00-03:00");
const FECHADO = new Date("2026-10-02T15:00:00-03:00");
const CHAVE = "11111111-1111-4111-8111-111111111111";

function montar(opcoes: { config?: Partial<ConfiguracaoLoja>; comPix?: boolean; pixFalha?: boolean } = {}) {
  const memoria = repositoriosEmMemoria({
    variacoes: variacoesDeTeste(),
    ingredientes: ingredientesDeTeste(),
    config: configDeTeste({ tamanhos: TAMANHOS, bairros: BAIRROS, ...opcoes.config }),
  });
  const falso = gatewayPixFalso();
  if (opcoes.pixFalha) falso.gateway.criarCobranca = async () => Promise.reject(new Error("fora do ar"));
  const pix = opcoes.comPix ? criarServicoPix({ gateway: falso.gateway, repos: memoria.repos, agora: () => ABERTO }) : null;
  const finalizar = (entrada: unknown, agora = ABERTO) =>
    finalizarPedidoLink({ repos: memoria.repos, pix, logger: loggerSilencioso, agora }, entrada);
  return { ...memoria, finalizar };
}

function pedido(extra: Record<string, unknown> = {}) {
  return {
    itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], quantidade: 1 }],
    tipo_entrega: "retirada",
    forma_pagamento: "dinheiro",
    cliente_nome: "Maria",
    cliente_telefone: "(11) 98765-4321",
    chave_idempotencia: CHAVE,
    ...extra,
  };
}

const entrega = { rua: "Rua A", numero: "10", bairro_id: ID.bairroCentro };

describe("pedido por link", () => {
  it("grava com canal link, chat = telefone com DDI e preço do servidor", async () => {
    const { finalizar, pedidos } = montar();
    const r = await finalizar(pedido());
    expect(r).toMatchObject({ ok: true, numero: 1, totalCentavos: 5500, existente: false });
    expect(pedidos[0]).toMatchObject({ canal: "link", chatId: "5511987654321", status: "novo", chaveIdempotencia: CHAVE });
  });

  it("ignora qualquer preço enviado pelo navegador", async () => {
    const { finalizar, pedidos } = montar();
    const r = await finalizar({
      ...pedido({ total: 1, subtotal: 1 }),
      itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], quantidade: 2, preco: 1, preco_unitario: 1 }],
    });
    expect(r).toMatchObject({ ok: true, totalCentavos: 11000 });
    expect(pedidos[0]!.itens[0]).toMatchObject({ precoUnitarioCentavos: 5500, subtotalCentavos: 11000 });
  });

  it("sabor especial soma o seu adicional sobre a base do tamanho", async () => {
    const { finalizar } = montar();
    // Grande: base 55; Margherita 59 (+4). Meio a meio Calabresa/Margherita = 59.
    const r = await finalizar(
      pedido({ itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande), sabor(ID.margherita, ID.margheritaGrande)], quantidade: 1 }] })
    );
    expect(r).toMatchObject({ ok: true, totalCentavos: 5900 });
  });

  it("respeita o limite de sabores do tamanho", async () => {
    const { finalizar, pedidos } = montar({
      config: { tamanhos: TAMANHOS.map((t) => ({ ...t, maxSabores: 1 })) },
    });
    const r = await finalizar(
      pedido({ itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande), sabor(ID.margherita, ID.margheritaGrande)], quantidade: 1 }] })
    );
    expect(r).toEqual({ ok: false, erros: ["Item 1: a Grande aceita até 1 sabores"] });
    expect(pedidos).toHaveLength(0);
  });

  it("aceita no máximo uma borda", async () => {
    const { finalizar } = montar();
    const r = await finalizar(
      pedido({
        itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], adicionais: [ID.calabresaBorda, ID.calabresaBordaCheddar], quantidade: 1 }],
      })
    );
    expect(r).toMatchObject({ ok: false, erros: ["Item 1: só é possível uma borda por pizza"] });
  });

  it("recusa item inexistente ou inativo", async () => {
    const { finalizar } = montar();
    const inexistente = await finalizar(pedido({ itens: [{ sabores: [sabor(ID.calabresa, ID.inexistente)], quantidade: 1 }] }));
    expect(inexistente).toMatchObject({ ok: false });
    const memoria = montar();
    memoria.repos.cardapio.variacoesPorIds = async (ids) =>
      [...variacoesDeTeste({ [ID.calabresaGrande]: { ativa: false } }).values()].filter((v) => ids.includes(v.id));
    const inativo = await memoria.finalizar(pedido());
    expect(inativo).toMatchObject({ ok: false, erros: ['Item 1: "Calabresa (Grande)" não está disponível no momento'] });
  });

  it("loja fechada: recusa a finalização", async () => {
    const { finalizar, pedidos } = montar();
    const r = await finalizar(pedido(), FECHADO);
    expect(r).toMatchObject({ ok: false });
    expect((r as { erros: string[] }).erros[0]).toContain("fechada");
    expect(pedidos).toHaveLength(0);
  });

  it("link desativado nas configurações: recusa", async () => {
    const { finalizar } = montar({ config: { pedidoLinkAtivo: false } });
    expect(await finalizar(pedido())).toMatchObject({ ok: false, erros: ["Os pedidos pelo link estão desativados no momento."] });
  });

  it("idempotência: a mesma chave devolve o mesmo pedido, sem duplicar", async () => {
    const { finalizar, pedidos } = montar();
    const [a, b] = await Promise.all([finalizar(pedido()), finalizar(pedido())]);
    const c = await finalizar(pedido());
    expect(pedidos).toHaveLength(1);
    expect(a).toMatchObject({ ok: true, numero: 1 });
    expect(b).toMatchObject({ ok: true, numero: 1 });
    expect(c).toMatchObject({ ok: true, numero: 1, existente: true });
    const outro = await finalizar(pedido({ chave_idempotencia: "22222222-2222-4222-8222-222222222222" }));
    expect(outro).toMatchObject({ ok: true, numero: 2 });
  });

  it("idempotência com Pix: não gera uma segunda cobrança", async () => {
    const { finalizar, pagamentos } = montar({ comPix: true });
    const a = await finalizar(pedido({ forma_pagamento: "pix" }));
    const b = await finalizar(pedido({ forma_pagamento: "pix" }));
    expect(a).toMatchObject({ ok: true, existente: false, pix: { qrCode: expect.any(String) } });
    expect(b).toMatchObject({ ok: true, existente: true });
    expect(pagamentos).toHaveLength(1);
  });

  it("aplica a taxa de entrega do bairro", async () => {
    const { finalizar, pedidos } = montar();
    const r = await finalizar(pedido({ tipo_entrega: "entrega", endereco: entrega }));
    expect(r).toMatchObject({ ok: true, totalCentavos: 6000 });
    expect(pedidos[0]).toMatchObject({ taxaEntregaCentavos: 500, endereco: { bairro: "Centro" } });
  });

  it("recusa bairro não atendido e entrega sem endereço", async () => {
    const { finalizar } = montar();
    const foraDaArea = await finalizar(pedido({ tipo_entrega: "entrega", endereco: { ...entrega, bairro_id: ID.inexistente } }));
    expect((foraDaArea as { erros: string[] }).erros[0]).toContain("Bairro não atendido");
    const semEndereco = await finalizar(pedido({ tipo_entrega: "entrega" }));
    expect(semEndereco).toMatchObject({ ok: false });
  });

  it("Pix indisponível sem gateway; com falha na cobrança o pedido é descartado", async () => {
    expect(await montar().finalizar(pedido({ forma_pagamento: "pix" }))).toMatchObject({ ok: false });
    const { finalizar, pedidos } = montar({ comPix: true, pixFalha: true });
    expect(await finalizar(pedido({ forma_pagamento: "pix" }))).toMatchObject({ ok: false });
    expect(pedidos).toHaveLength(0);
  });

  it("troco menor que o total é recusado", async () => {
    const { finalizar } = montar();
    const r = await finalizar(pedido({ troco_para: 50 }));
    expect((r as { erros: string[] }).erros[0]).toContain("troco");
  });

  it("honeypot não faz parte do contrato: campos extras não alteram o pedido", async () => {
    const { finalizar } = montar();
    expect(await finalizar({ ...pedido(), site: "spam" })).toMatchObject({ ok: true });
  });
});

describe("ingredientes", () => {
  const comIngredientes = (ingredientes: string[], variacao: string = ID.calabresaGrande, produto: string = ID.calabresa) =>
    pedido({ itens: [{ sabores: [sabor(produto, variacao)], ingredientes, quantidade: 1 }] });

  it("cobram o preço do tamanho, uma vez para a pizza inteira", async () => {
    const { finalizar, pedidos } = montar();
    expect(await finalizar(comIngredientes([ID.bacon, ID.milho]))).toMatchObject({ ok: true, totalCentavos: 5500 + 800 + 400 });
    const item = pedidos[0]!.itens[0]!;
    expect(item.descricao).toBe("Calabresa (Grande) + Bacon + Milho");
    expect(item.componentes.filter((c) => c.tipo === "ingrediente")).toEqual([
      { tipo: "ingrediente", ingredienteId: ID.bacon, produtoNome: "Bacon", variacaoNome: "Grande", precoCentavos: 800 },
      { tipo: "ingrediente", ingredienteId: ID.milho, produtoNome: "Milho", variacaoNome: "Grande", precoCentavos: 400 },
    ]);
  });

  it("usam o preço do tamanho escolhido", async () => {
    const { finalizar } = montar();
    expect(await finalizar(comIngredientes([ID.bacon], ID.calabresaMedia))).toMatchObject({ ok: true, totalCentavos: 4500 + 600 });
  });

  it("recusa ingrediente fora do tamanho, inativo, repetido ou acima do limite", async () => {
    const { finalizar } = montar({ config: { maxIngredientes: 2 } });
    expect(await finalizar(comIngredientes([ID.rucula], ID.calabresaMedia))).toMatchObject({
      ok: false,
      erros: ['Item 1: "Rúcula" não é oferecido na Média'],
    });
    expect(await finalizar(comIngredientes([ID.bacon, ID.bacon]))).toMatchObject({
      ok: false,
      erros: ["Item 1: o mesmo ingrediente foi informado mais de uma vez"],
    });
    expect(await finalizar(comIngredientes([ID.bacon, ID.milho, ID.rucula]))).toMatchObject({
      ok: false,
      erros: ["Item 1: no máximo 2 ingredientes por pizza"],
    });
    const memoria = montar();
    memoria.repos.cardapio.ingredientesPorIds = async () => [...ingredientesDeTeste({ [ID.bacon]: { ativo: false } }).values()];
    expect(await memoria.finalizar(comIngredientes([ID.bacon]))).toMatchObject({
      ok: false,
      erros: ['Item 1: "Bacon" não está disponível no momento'],
    });
  });

  it("não valem em produto sem tamanho (bebida)", async () => {
    const { finalizar } = montar();
    expect(await finalizar(comIngredientes([ID.bacon], ID.cocaUnica, ID.coca))).toMatchObject({
      ok: false,
      erros: ["Item 1: ingredientes só podem ser adicionados a pizzas"],
    });
  });

  it("montagem livre: base do tamanho + ingredientes, exige ao menos um e não divide", async () => {
    const { finalizar } = montar();
    expect(await finalizar(comIngredientes([ID.bacon, ID.rucula], ID.monteASuaGrande, ID.monteASua))).toMatchObject({
      ok: true,
      totalCentavos: 5500 + 800 + 500,
    });
    expect(await finalizar(comIngredientes([], ID.monteASuaGrande, ID.monteASua))).toMatchObject({
      ok: false,
      erros: ["Item 1: escolha ao menos um ingrediente para montar a sua pizza"],
    });
    const dividida = await finalizar(
      pedido({
        itens: [{ sabores: [sabor(ID.monteASua, ID.monteASuaGrande), sabor(ID.calabresa, ID.calabresaGrande)], ingredientes: [ID.bacon], quantidade: 1 }],
      })
    );
    expect(dividida).toMatchObject({ ok: false, erros: ["Item 1: a pizza montada não pode ser dividida com outros sabores"] });
  });
});

describe("telefoneComDdi", () => {
  it("acrescenta 55 só quando falta", () => {
    expect(telefoneComDdi("11987654321")).toBe("5511987654321");
    expect(telefoneComDdi("1133334444")).toBe("551133334444");
    expect(telefoneComDdi("5511987654321")).toBe("5511987654321");
  });
});
