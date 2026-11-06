import { describe, expect, it } from "vitest";
import { calcularPedidoArgsSchema, finalizarPedidoArgsSchema, type CategoriaCardapio, type MensagemConversa } from "@pizzaria/shared";
import { configDeTeste, ID, sabor, variacoesDeTeste } from "../testes/fixtures";
import { chamar, llmRoteirizado, repositoriosEmMemoria, semearResumo, texto } from "../testes/memoria";
import { criarAgente } from "./agente";
import {
  confirmaResumo,
  conferirDadosCliente,
  itensQueSairam,
  linksCitados,
  pedeTelefoneConhecido,
  removerNaoAutorizados,
  resumoSemCotacao,
  telefonesCitados,
  ultimaCotacao,
  valoresCitados,
  verificarResposta,
} from "./verificacao";

const ABERTO = new Date("2026-10-02T20:00:00-03:00");

const CARDAPIO: CategoriaCardapio[] = [
  {
    id: "c1",
    nome: "Pizzas",
    ordem: 1,
    produtos: [
      {
        id: ID.calabresa,
        nome: "Calabresa",
        descricao: "Calabresa e cebola",
        imagemUrl: null,
        variacoes: [
          { id: ID.calabresaMedia, nome: "Média", tipo: "tamanho", precoCentavos: 4500 },
          { id: ID.calabresaGrande, nome: "Grande", tipo: "tamanho", precoCentavos: 5500 },
          { id: ID.calabresaBorda, nome: "Borda Catupiry", tipo: "borda", precoCentavos: 800 },
        ],
      },
    ],
  },
];

const fontes = (mensagens: MensagemConversa[] = [], extra: Partial<Parameters<typeof verificarResposta>[1]> = {}) => ({
  categorias: CARDAPIO,
  config: configDeTeste({ telefone: "(47) 3333-4444" }),
  mensagens,
  urlCardapio: "https://painel.exemplo/cardapio",
  telefoneCanal: null,
  cliente: null,
  ...extra,
});

describe("valores, links e telefones citados", () => {
  it("lê valores em reais", () => {
    expect(valoresCitados("Grande R$ 55,00, borda R$8 e total R$ 1.234,56; ou 40 reais")).toEqual([5500, 800, 123456, 4000]);
  });

  it("acha links e telefones", () => {
    expect(linksCitados("Veja https://x.com/promo, ou www.vianna.com.br. Ou pizzaria.app")).toEqual(["https://x.com/promo", "www.vianna.com.br", "pizzaria.app"]);
    expect(telefonesCitados("Ligue (11) 98765-4321 ou +55 47 3333-4444. Pedido #12, total R$ 131,00")).toEqual(["11987654321", "554733334444"]);
  });
});

describe("verificarResposta", () => {
  it("aceita preços do cardápio, da configuração e de ferramentas", () => {
    const tool: MensagemConversa = { papel: "tool", toolCallId: "x", conteudo: JSON.stringify({ total: "R$ 131,00" }) };
    expect(verificarResposta("Calabresa a partir de R$ 45,00, borda R$ 8,00, entrega R$ 5,00. Total R$ 131,00", fontes([tool]))).toEqual([]);
  });

  it("aceita valores ditos pelo cliente (troco)", () => {
    expect(verificarResposta("Troco para R$ 200,00, certo?", fontes([{ papel: "user", conteudo: "troco pra 200" }]))).toEqual([]);
    expect(verificarResposta("Troco para R$ 100,00, certo?", fontes([{ papel: "user", conteudo: "troco pra cem" }]))).toEqual([]);
  });

  it("aponta valores sem fonte (conta de cabeça, preço inventado)", () => {
    expect(verificarResposta("Duas grandes ficam R$ 110,00", fontes())).toEqual([{ tipo: "valor", valores: [11000] }]);
  });

  it("aponta links que não são do cardápio e aceita o do cardápio", () => {
    expect(verificarResposta("Cardápio: https://painel.exemplo/cardapio", fontes())).toEqual([]);
    expect(verificarResposta("Peça em https://ifood.com.br/vianna", fontes())).toEqual([{ tipo: "link", links: ["https://ifood.com.br/vianna"] }]);
  });

  it("aceita o link do pedido pelo link só quando ele é fonte oficial", () => {
    const texto = "Monte a sua pizza em https://painel.exemplo/pedir";
    expect(verificarResposta(texto, fontes([], { urlPedir: "https://painel.exemplo/pedir" }))).toEqual([]);
    expect(verificarResposta(texto, fontes())).toEqual([{ tipo: "link", links: ["https://painel.exemplo/pedir"] }]);
  });

  it("aponta telefone inventado e aceita o da loja e o do cliente", () => {
    const cliente: MensagemConversa = { papel: "user", conteudo: "meu número é 11 98765-4321" };
    expect(verificarResposta("Ligue (47) 3333-4444. Seu telefone: (11) 98765-4321", fontes([cliente]))).toEqual([]);
    expect(verificarResposta("Ligue (47) 99999-0000", fontes())).toEqual([{ tipo: "telefone", telefones: ["47999990000"] }]);
  });

  it("remove link e telefone não autorizados no último recurso", () => {
    const t = "Ligue (47) 99999-0000 ou veja https://x.com agora";
    expect(removerNaoAutorizados(t, verificarResposta(t, fontes()))).toBe("Ligue ou veja agora");
  });
});

const itens = [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], adicionais: [ID.calabresaBorda], quantidade: 2, observacao: "sem cebola" }];

function resumo(args: object, sucesso = true): MensagemConversa[] {
  return [
    { papel: "assistant", conteudo: null, toolCalls: [{ id: "r", nome: "calcular_pedido", argumentos: JSON.stringify(args) }] },
    { papel: "tool", toolCallId: "r", conteudo: JSON.stringify({ sucesso }) },
  ];
}

describe("ultimaCotacao", () => {
  it("acha o último resumo bem-sucedido e sabe se o cliente respondeu", () => {
    const msgs = [{ papel: "user" as const, conteudo: "oi" }, ...resumo({ itens, tipo_entrega: "entrega", bairro_id: ID.bairroCentro })];
    expect(ultimaCotacao(msgs)).toMatchObject({ respostas: [], antes: expect.arrayContaining([{ papel: "user", conteudo: "oi" }]), args: { tipo_entrega: "entrega", bairro_id: ID.bairroCentro } });
    expect(ultimaCotacao([...msgs, { papel: "user", conteudo: "sim" }])).toMatchObject({ respostas: ["sim"] });
    expect(ultimaCotacao(resumo({ itens, tipo_entrega: "retirada" }, false))).toBeNull();
  });

  it("um resumo novo depois da resposta volta a exigir resposta", () => {
    const msgs = [...resumo({ itens, tipo_entrega: "retirada" }), { papel: "user" as const, conteudo: "e uma coca" }, ...resumo({ itens, tipo_entrega: "retirada" })];
    expect(ultimaCotacao(msgs)?.respostas).toEqual([]);
  });

  it("aponta itens da cotação anterior que sumiram na nova", () => {
    const coca = { sabores: [sabor(ID.coca, ID.cocaUnica)], adicionais: [], quantidade: 1, observacao: null };
    const anterior = ultimaCotacao([
      { papel: "assistant", conteudo: null, toolCalls: [{ id: "r", nome: "calcular_pedido", argumentos: JSON.stringify({ itens: [...itens, coca], tipo_entrega: "retirada" }) }] },
      { papel: "tool", toolCallId: "r", conteudo: JSON.stringify({ sucesso: true, itens: [{ descricao: "Calabresa (Grande) + Borda Catupiry", quantidade: 2 }, { descricao: "Coca-Cola Lata", quantidade: 1 }] }) },
    ]);
    expect(itensQueSairam(anterior, [coca])).toEqual(["2x Calabresa (Grande) + Borda Catupiry"]);
    expect(itensQueSairam(anterior, [{ ...itens[0]!, quantidade: 1 }, coca])).toEqual([]);
  });
});

describe("confirmaResumo", () => {
  it.each([
    ["sim", true],
    ["pode fechar", true],
    ["Isso, confirmo!", true],
    ["👍🏻", true],
    ["[áudio transcrito] sim, pode mandar", true],
    ["tá bom", true],
    ["dinheiro, troco pra 300", false],
    ["e uma coca também", false],
    ["pode tirar a cebola?", false],
    ["não, espera", false],
    ["", false],
  ])("%s -> %s", (resposta, esperado) => {
    expect(confirmaResumo(resposta ? [resposta] : [])).toBe(esperado);
  });
});

describe("conferirDadosCliente", () => {
  const base = {
    itens,
    tipo_entrega: "entrega",
    endereco: { rua: "Rua das Flores", numero: "42", bairro_id: ID.bairroCentro },
    forma_pagamento: "dinheiro",
    troco_para: 200,
    cliente_nome: "Maria Souza",
    cliente_telefone: "11987654321",
  };
  /** Dados do finalizar_pedido + itens/entrega do resumo, como a tool monta. */
  const confirmado = (dados: typeof base) => ({
    ...finalizarPedidoArgsSchema.parse(dados),
    ...calcularPedidoArgsSchema.pick({ itens: true, tipo_entrega: true }).parse(dados),
  });
  const contexto = (falas: string[], extra = {}) => ({
    config: configDeTeste(),
    mensagens: falas.map((conteudo) => ({ papel: "user" as const, conteudo })),
    telefoneCanal: null,
    cliente: null,
    nomePerfil: null,
    ...extra,
  });

  it("aceita dados que o cliente informou", () => {
    const falas = ["sou a maria, fone 11 98765-4321", "rua das flores, 42", "dinheiro, troco pra 200"];
    expect(conferirDadosCliente(confirmado(base), contexto(falas))).toEqual([]);
  });

  it("recusa nome, telefone, endereço e troco inventados", () => {
    const problemas = conferirDadosCliente(confirmado(base), contexto(["quero uma calabresa"]));
    expect(problemas.map((p) => p.split(":")[0])).toEqual(["cliente_nome", "cliente_telefone", "endereco.numero", "endereco.rua", "forma_pagamento", "troco_para"]);
  });

  it("aceita dados do canal e do cadastro", () => {
    const args = confirmado({ ...base, troco_para: null as unknown as number });
    const extra = {
      telefoneCanal: "5511987654321",
      nomePerfil: "Maria",
      cliente: { nome: null, telefone: null, ultimoEndereco: { rua: "Rua das Flores", numero: "42", bairro: "Centro", bairroId: ID.bairroCentro, complemento: null, referencia: null } },
    };
    expect(conferirDadosCliente(args, contexto(["pode ser o mesmo endereço, pago em dinheiro"], extra))).toEqual([]);
  });

  it("forma de pagamento precisa ter sido escolhida pelo cliente", () => {
    const args = confirmado({ ...base, forma_pagamento: "cartao", troco_para: null as unknown as number });
    const falas = ["sou a maria, fone 11 98765-4321", "rua das flores, 42"];
    expect(conferirDadosCliente(args, contexto(falas))).toEqual([expect.stringMatching(/^forma_pagamento/)]);
    expect(conferirDadosCliente(args, contexto([...falas, "vai ser no crédito"]))).toEqual([]);
  });
});

describe("travas no agente", () => {
  function montar(roteiro: Parameters<typeof llmRoteirizado>[0]) {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste(), cardapio: CARDAPIO });
    const { llm, requisicoes } = llmRoteirizado(roteiro);
    const agente = criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO });
    return { agente, requisicoes, ...memoria };
  }
  const entrada = (t: string) => ({ canal: "whatsapp" as const, chatId: "9", clienteNome: "Maria", texto: t });
  const args = {
    itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], quantidade: 1 }],
    tipo_entrega: "retirada",
    forma_pagamento: "cartao",
    cliente_nome: "Maria",
    cliente_telefone: "11987654321",
  };
  const erroDaTool = (requisicao: { mensagens: MensagemConversa[] } | undefined) =>
    JSON.parse((requisicao?.mensagens.at(-1) as { conteudo: string }).conteudo) as { erro?: string; refazer_calculo?: unknown };

  it("finalizar sem resumo mostrado não registra pedido", async () => {
    const { agente, pedidos, requisicoes } = montar([chamar(["finalizar_pedido", args]), texto("Vou te mostrar o resumo.")]);
    await agente.processarMensagem(entrada("fecha aí, telefone 11987654321"));
    expect(pedidos).toHaveLength(0);
    expect(erroDaTool(requisicoes[1]).erro).toMatch(/chame calcular_pedido/);
  });

  it("calcular e finalizar na mesma resposta (sem o cliente ver) não registra", async () => {
    const { agente, pedidos, requisicoes } = montar([
      chamar(["calcular_pedido", { itens: args.itens, tipo_entrega: "retirada" }, "a"], ["finalizar_pedido", args, "b"]),
      texto("Resumo..."),
    ]);
    await agente.processarMensagem(entrada("uma calabresa grande, retirada, cartão, Maria 11987654321"));
    expect(pedidos).toHaveLength(0);
    expect(erroDaTool(requisicoes[1]).erro).toMatch(/ainda não respondeu/);
  });

  it("dado informado depois do resumo exige um resumo novo", async () => {
    const { agente, pedidos, repos, requisicoes } = montar([chamar(["finalizar_pedido", { ...args, forma_pagamento: "dinheiro", troco_para: 300 }]), texto("Resumo atualizado...")]);
    await semearResumo(repos, entrada(""), args, "Quero isso. Meu nome é Maria, telefone 11 98765-4321");
    await agente.processarMensagem(entrada("dinheiro, troco pra 300"));
    expect(pedidos).toHaveLength(0);
    expect(erroDaTool(requisicoes[1]).erro).toMatch(/depois do resumo/);
    expect(erroDaTool(requisicoes[1])).toMatchObject({ refazer_calculo: { tipo_entrega: args.tipo_entrega } });
  });

  it("resposta que não confirma (acréscimo) não finaliza", async () => {
    const { agente, pedidos, repos, requisicoes } = montar([chamar(["finalizar_pedido", args]), texto("Vou incluir a coca.")]);
    await semearResumo(repos, entrada(""), args);
    await agente.processarMensagem(entrada("e uma coca também"));
    expect(pedidos).toHaveLength(0);
    expect(erroDaTool(requisicoes[1]).erro).toMatch(/não confirmou o resumo/);
  });

  it("registra os itens do resumo confirmado, mesmo que o modelo mande outros", async () => {
    const { agente, pedidos, repos } = montar([
      chamar(["finalizar_pedido", { ...args, itens: [{ sabores: [sabor(ID.margherita, ID.margheritaGrande)], quantidade: 9 }] }]),
    ]);
    await semearResumo(repos, entrada(""), args);
    await agente.processarMensagem(entrada("sim"));
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.itens.map((i) => `${i.quantidade}x ${i.descricao}`)).toEqual(["1x Calabresa (Grande)"]);
  });

  it("entrega: exige endereço e o mesmo bairro do resumo", async () => {
    const entrega = { ...args, tipo_entrega: "entrega", endereco: { rua: "Rua das Flores", numero: "42", bairro_id: ID.bairroCentro } };
    const semEndereco = montar([chamar(["finalizar_pedido", { ...entrega, endereco: null }]), texto("Qual o endereço?")]);
    await semearResumo(semEndereco.repos, entrada(""), entrega);
    await semEndereco.agente.processarMensagem(entrada("sim"));
    expect(semEndereco.pedidos).toHaveLength(0);
    expect(erroDaTool(semEndereco.requisicoes[1]).erro).toMatch(/Endereço é obrigatório/);

    const outroBairro = montar([chamar(["finalizar_pedido", { ...entrega, endereco: { ...entrega.endereco, bairro_id: "ffffffff-0000-4000-8000-000000000000" } }]), texto("Vou recalcular.")]);
    await semearResumo(outroBairro.repos, entrada(""), entrega);
    await outroBairro.agente.processarMensagem(entrada("sim"));
    expect(outroBairro.pedidos).toHaveLength(0);
    expect(erroDaTool(outroBairro.requisicoes[1]).erro).toMatch(/bairro do endereço é diferente/);
  });

  it("valor inventado na resposta: pede correção e não envia ao cliente", async () => {
    const { agente, requisicoes } = montar([texto("Duas grandes ficam R$ 110,00!"), texto("Vou calcular certinho: confirma 2 Calabresas Grandes?")]);
    const r = await agente.processarMensagem(entrada("quanto fica 2 calabresas grandes?"));
    expect(r.texto).toBe("Vou calcular certinho: confirma 2 Calabresas Grandes?");
    expect(requisicoes[1]?.sistema).toContain("R$ 110,00");
    expect(requisicoes[1]?.sistema).toContain("Correção obrigatória");
  });

  it("se insistir no valor inventado, responde a mensagem segura", async () => {
    const { agente, conversas } = montar([texto("Fica R$ 110,00"), texto("Fica R$ 110,00 mesmo")]);
    const r = await agente.processarMensagem(entrada("quanto fica?"));
    expect(r.texto).toMatch(/não te passar nenhum valor errado/);
    expect([...conversas.values()][0]?.mensagens.at(-1)).toMatchObject({ conteudo: r.texto });
  });
});

describe("resumoSemCotacao", () => {
  const cliente: MensagemConversa = { papel: "user", conteudo: "pra entregar no centro" };
  const comCotacao: MensagemConversa = { papel: "assistant", conteudo: null, toolCalls: [{ id: "c", nome: "calcular_pedido", argumentos: "{}" }] };
  const resumo = "1x Calabresa (Grande) R$ 60,00\n*Total: R$ 60,00*\nEntrega: Rua A, 1 - Centro\nPode confirmar?";

  it("aponta resumo com total e pedido de confirmação sem calcular_pedido na rodada", () => {
    expect(resumoSemCotacao(resumo, [cliente])).toBe(true);
    const ok: MensagemConversa = { papel: "tool", toolCallId: "c", conteudo: '{"sucesso":true}' };
    const falhou: MensagemConversa = { papel: "tool", toolCallId: "c", conteudo: '{"sucesso":false,"erros":["x"]}' };
    expect(resumoSemCotacao(resumo, [cliente, comCotacao, ok])).toBe(false);
    expect(resumoSemCotacao(resumo, [cliente, comCotacao, falhou])).toBe(true);
  });

  it("não implica com respostas que não são resumo", () => {
    expect(resumoSemCotacao("A Calabresa Grande sai R$ 60,00. Quer pedir?", [cliente])).toBe(false);
    expect(resumoSemCotacao("Pode confirmar o endereço?", [cliente])).toBe(false);
    expect(resumoSemCotacao("Qual a forma de pagamento: dinheiro ou cartão?", [cliente])).toBe(false);
  });

  it("confirmação de entrega + pagamento sem valores também é fechamento", () => {
    expect(resumoSemCotacao("Só confirmando: entrega na Rua A, 1 e pagamento em dinheiro. Pode confirmar?", [cliente])).toBe(true);
  });
});

describe("pedeTelefoneConhecido", () => {
  it("só aponta pedido de telefone quando o número do WhatsApp já é conhecido", () => {
    expect(pedeTelefoneConhecido("Perfeito. Só me confirma o telefone com DDD, por favor.", "5547900000002")).toBe(true);
    expect(pedeTelefoneConhecido("Qual o seu telefone?", "5547900000002")).toBe(true);
    expect(pedeTelefoneConhecido("Qual o seu telefone?", null)).toBe(false);
    expect(pedeTelefoneConhecido("Perfeito. Só falta o *telefone com DDD* para eu fechar o pedido.", "5547900000002")).toBe(true);
    expect(pedeTelefoneConhecido("Preciso do telefone com DDD para continuar.", "5547900000002")).toBe(true);
    expect(pedeTelefoneConhecido("O telefone da pizzaria é (47) 99923-3221. Posso ajudar em algo mais?", "5547900000002")).toBe(false);
    expect(pedeTelefoneConhecido("Qual a forma de pagamento?", "5547900000002")).toBe(false);
  });
});
