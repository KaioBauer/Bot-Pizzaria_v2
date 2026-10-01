import { describe, expect, it } from "vitest";
import type { MensagemConversa } from "@pizzaria/shared";
import { configDeTeste, ID, sabor, variacoesDeTeste } from "../testes/fixtures";
import { chamar, llmRoteirizado, repositoriosEmMemoria, texto } from "../testes/memoria";
import { afirmaPedidoFeito, criarAgente, MENSAGEM_ERRO, recortarHistorico } from "./agente";

// Sexta 2026-10-02, 20:00 em São Paulo: dentro do horário de teste (18:00–23:30).
const ABERTO = new Date("2026-10-02T20:00:00-03:00");
const FECHADO = new Date("2026-10-02T10:00:00-03:00");

const entrada = (textoCliente: string) => ({
  canal: "telegram" as const,
  chatId: "123",
  clienteNome: "Maria",
  texto: textoCliente,
});

const argsFinalizar = {
  itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], adicionais: [ID.calabresaBorda], quantidade: 2, preco: 1 }],
  tipo_entrega: "entrega",
  endereco: { rua: "Rua das Flores", numero: "42", bairro_id: ID.bairroCentro },
  forma_pagamento: "dinheiro",
  troco_para: 200,
  cliente_nome: "Maria",
  cliente_telefone: "11 98765-4321",
  valor_total: 0.01,
};

function montar(roteiro: Parameters<typeof llmRoteirizado>[0], agora = ABERTO) {
  const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
  const { llm, requisicoes } = llmRoteirizado(roteiro);
  const agente = criarAgente({ repos: memoria.repos, llm, agora: () => agora });
  return { agente, requisicoes, ...memoria };
}

describe("agente", () => {
  it("responde em texto e guarda o histórico", async () => {
    const { agente, conversas } = montar([texto("Olá! O que vai ser hoje?")]);
    const r = await agente.processarMensagem(entrada("oi"));
    expect(r.texto).toBe("Olá! O que vai ser hoje?");
    const [conversa] = conversas.values();
    expect(conversa?.mensagens.map((m) => m.papel)).toEqual(["user", "assistant"]);
  });

  it("informa o link do cardápio no prompt quando configurado", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    const { llm, requisicoes } = llmRoteirizado([texto("Aqui está!")]);
    const agente = criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO, opcoes: { urlCardapio: "https://painel.exemplo/cardapio" } });
    await agente.processarMensagem(entrada("quero o cardápio"));
    expect(requisicoes[0]?.sistema).toContain("Cardápio completo com fotos e preços: https://painel.exemplo/cardapio");
    expect(requisicoes[0]?.sistema).toContain("envie o link do cardápio");
  });

  it("finaliza com preços do servidor, ignorando valores do modelo", async () => {
    const { agente, pedidos, conversas } = montar([chamar(["finalizar_pedido", argsFinalizar])]);
    const r = await agente.processarMensagem(entrada("pode fechar"));

    expect(pedidos).toHaveLength(1);
    const pedido = pedidos[0]!;
    // (55,00 + 8,00 de borda) x 2 + 5,00 de taxa do Centro
    expect(pedido).toMatchObject({
      subtotalCentavos: 12600,
      taxaEntregaCentavos: 500,
      totalCentavos: 13100,
      trocoParaCentavos: 20000,
      status: "novo",
      clienteTelefone: "11987654321",
      enderecoTexto: "Rua das Flores, 42 - Centro",
    });
    expect(r.pedido?.numero).toBe(1);
    expect(r.texto).toContain("Pedido *#1* confirmado");
    expect(r.texto).toContain("2x Calabresa (Grande) + Borda Catupiry — R$ 126,00");
    expect(r.texto).toContain("*Total: R$ 131,00*");
    expect(r.texto).toContain("troco para R$ 200,00");

    // Conversa encerrada: a próxima mensagem abre uma sessão nova.
    const [conversa] = conversas.values();
    expect(conversa).toMatchObject({ encerrada: true, pedidoId: "pedido-1" });
  });

  it("depois de finalizar, a próxima mensagem começa conversa nova", async () => {
    const { agente, requisicoes } = montar([chamar(["finalizar_pedido", argsFinalizar]), texto("Oi de novo!")]);
    await agente.processarMensagem(entrada("pode fechar"));
    await agente.processarMensagem(entrada("oi"));
    expect(requisicoes[1]?.mensagens).toEqual([{ papel: "user", conteudo: "oi" }]);
  });

  it("devolve erros de validação ao modelo para corrigir com o cliente", async () => {
    const { agente, pedidos, requisicoes } = montar([
      chamar(["finalizar_pedido", { ...argsFinalizar, endereco: null }]),
      texto("Preciso do seu endereço completo."),
    ]);
    const r = await agente.processarMensagem(entrada("pode fechar"));
    expect(pedidos).toHaveLength(0);
    expect(r.texto).toBe("Preciso do seu endereço completo.");
    const resultadoTool = requisicoes[1]?.mensagens.at(-1);
    expect(resultadoTool).toMatchObject({ papel: "tool", toolCallId: "call_finalizar_pedido_0" });
    expect(JSON.parse((resultadoTool as { conteudo: string }).conteudo)).toMatchObject({
      sucesso: false,
      erro: expect.stringContaining("Endereço é obrigatório"),
    });
  });

  it("devolve itens indisponíveis ao modelo", async () => {
    const memoria = repositoriosEmMemoria({
      variacoes: variacoesDeTeste({ [ID.calabresaGrande]: { ativa: false } }),
      config: configDeTeste(),
    });
    const { llm, requisicoes } = llmRoteirizado([
      chamar(["calcular_pedido", { itens: argsFinalizar.itens, tipo_entrega: "retirada" }]),
      texto("A Calabresa Grande acabou."),
    ]);
    await criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO }).processarMensagem(entrada("quanto fica?"));
    const resultado = JSON.parse((requisicoes[1]?.mensagens.at(-1) as { conteudo: string }).conteudo);
    expect(resultado).toMatchObject({ sucesso: false, erros: [expect.stringMatching(/não está disponível/)] });
  });

  it("calcular_pedido devolve os valores oficiais formatados", async () => {
    const { agente, requisicoes } = montar([
      chamar(["calcular_pedido", { itens: argsFinalizar.itens, tipo_entrega: "entrega", bairro_id: ID.bairroCentro }]),
      texto("Resumo..."),
    ]);
    await agente.processarMensagem(entrada("quanto fica?"));
    const resultado = JSON.parse((requisicoes[1]?.mensagens.at(-1) as { conteudo: string }).conteudo);
    expect(resultado).toMatchObject({ sucesso: true, subtotal: "R$ 126,00", taxa_entrega: "R$ 5,00", total: "R$ 131,00" });
  });

  it("com a loja fechada não registra pedido e avisa no prompt", async () => {
    const { agente, pedidos, requisicoes } = montar(
      [chamar(["finalizar_pedido", argsFinalizar]), texto("Estamos fechados agora.")],
      FECHADO
    );
    await agente.processarMensagem(entrada("pode fechar"));
    expect(pedidos).toHaveLength(0);
    expect(requisicoes[0]?.sistema).toContain("FECHADA");
    expect(requisicoes[1]?.mensagens.at(-1)?.papel).toBe("tool");
  });

  it("recusa Pix enquanto o gateway não estiver configurado", async () => {
    const { agente, pedidos, requisicoes } = montar([
      chamar(["finalizar_pedido", { ...argsFinalizar, forma_pagamento: "pix", troco_para: null }]),
      texto("O Pix online ainda não está disponível."),
    ]);
    await agente.processarMensagem(entrada("pode fechar no pix"));
    expect(pedidos).toHaveLength(0);
    expect(requisicoes[0]?.sistema).not.toContain("Pix (pagamento online");
  });

  it("responde cada tool call, inclusive várias na mesma rodada", async () => {
    const { agente, requisicoes } = montar([
      chamar(["consultar_cardapio", {}, "a"], ["consultar_status_pedido", {}, "b"]),
      texto("ok"),
    ]);
    await agente.processarMensagem(entrada("cardápio e meu pedido"));
    const ids = requisicoes[1]?.mensagens.flatMap((m) => (m.papel === "tool" ? [m.toolCallId] : []));
    expect(ids).toEqual(["a", "b"]);
  });

  it("JSON inválido nos argumentos vira erro para o modelo, não exceção", async () => {
    const { agente, requisicoes } = montar([
      { conteudo: null, toolCalls: [{ id: "x", nome: "finalizar_pedido", argumentos: "{quebrado" }] },
      texto("Pode repetir?"),
    ]);
    const r = await agente.processarMensagem(entrada("fecha"));
    expect(r.texto).toBe("Pode repetir?");
    expect(requisicoes[1]?.mensagens.at(-1)).toMatchObject({ papel: "tool", conteudo: expect.stringContaining("JSON inválido") });
  });

  it("falha do LLM vira mensagem amigável e não grava nada", async () => {
    const { agente, conversas } = montar([new Error("timeout")]);
    const r = await agente.processarMensagem(entrada("oi"));
    expect(r.texto).toBe(MENSAGEM_ERRO);
    const [conversa] = conversas.values();
    expect(conversa?.mensagens).toEqual([]);
  });

  it("falha do banco numa tool vira erro tratável pelo modelo", async () => {
    const { agente, repos, requisicoes } = montar([chamar(["consultar_cardapio", {}]), texto("Tente de novo.")]);
    repos.cardapio.ativo = async () => {
      throw new Error("conexão recusada");
    };
    const r = await agente.processarMensagem(entrada("cardápio"));
    expect(r.texto).toBe("Tente de novo.");
    expect(requisicoes[1]?.mensagens.at(-1)).toMatchObject({ conteudo: expect.stringContaining("Falha temporária") });
  });

  it("para depois do limite de rodadas", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    const { llm } = llmRoteirizado(Array.from({ length: 3 }, () => chamar(["consultar_cardapio", {}])));
    const agente = criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO, opcoes: { maxRodadas: 3 } });
    const r = await agente.processarMensagem(entrada("?"));
    expect(r.texto).toMatch(/não entendi/);
  });
});

describe("recortarHistorico", () => {
  it("começa na primeira mensagem do cliente", () => {
    const historico: MensagemConversa[] = [
      { papel: "tool", toolCallId: "x", conteudo: "{}" },
      { papel: "assistant", conteudo: "ok" },
      { papel: "user", conteudo: "oi" },
      { papel: "assistant", conteudo: "olá" },
    ];
    expect(recortarHistorico(historico)).toEqual(historico.slice(2));
    expect(recortarHistorico([{ papel: "assistant", conteudo: "x" }])).toEqual([]);
  });
});

describe("confirmação falsa (modelo diz que confirmou sem finalizar_pedido)", () => {
  it.each([
    ["Perfeito. Seu pedido foi confirmado ✅", true],
    ["Pedido confirmado! Já vai para a cozinha.", true],
    ["Seu pedido já está registrado 🙂", true],
    ["Confirmei seu pedido, obrigado!", true],
    ["Posso confirmar o pedido?", false],
    ["Assim que o pedido for confirmado, aviso você.", false],
    ["Quer confirmar?", false],
  ])("%s -> %s", (texto, esperado) => {
    expect(afirmaPedidoFeito(texto)).toBe(esperado);
  });

  it("pede correção ao modelo, que então finaliza de verdade", async () => {
    const { agente, pedidos, requisicoes } = montar([texto("Perfeito. Seu pedido foi confirmado ✅"), chamar(["finalizar_pedido", argsFinalizar])]);
    const r = await agente.processarMensagem(entrada("👍🏻"));
    expect(pedidos).toHaveLength(1);
    expect(r.texto).toContain("Pedido *#1* confirmado");
    expect(requisicoes[1]?.sistema).toContain("Correção obrigatória");
    expect(requisicoes[0]?.sistema).not.toContain("Correção obrigatória");
  });

  it("se o modelo insistir, não engana o cliente: pede um sim", async () => {
    const { agente, pedidos, conversas } = montar([texto("Seu pedido foi confirmado!"), texto("Pedido confirmado ✅")]);
    const r = await agente.processarMensagem(entrada("👍🏻"));
    expect(pedidos).toHaveLength(0);
    expect(r.texto).toContain("me confirma com um *sim*");
    const [conversa] = conversas.values();
    expect(conversa?.mensagens.at(-1)).toMatchObject({ papel: "assistant", conteudo: r.texto });
  });

  it("falar de pedido anterior depois de consultar o status é permitido", async () => {
    const { agente, requisicoes } = montar([chamar(["consultar_status_pedido", {}]), texto("Seu pedido #3 foi confirmado e está em preparo.")]);
    const r = await agente.processarMensagem(entrada("cadê meu pedido?"));
    expect(r.texto).toBe("Seu pedido #3 foi confirmado e está em preparo.");
    expect(requisicoes).toHaveLength(2);
  });
});
