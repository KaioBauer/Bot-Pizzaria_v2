import { describe, expect, it } from "vitest";
import type { MensagemConversa } from "@pizzaria/shared";
import { configDeTeste, ID, sabor, variacoesDeTeste } from "../testes/fixtures";
import { chamar, llmRoteirizado, repositoriosEmMemoria, semearResumo, texto } from "../testes/memoria";
import { afirmaPedidoFeito, criarAgente, MENSAGEM_ERRO, recortarHistorico } from "./agente";

// Sexta 2026-10-02, 20:00 em São Paulo: dentro do horário de teste (18:00–23:30).
const ABERTO = new Date("2026-10-02T20:00:00-03:00");
const FECHADO = new Date("2026-10-02T10:00:00-03:00");

const entrada = (textoCliente: string) => ({
  canal: "whatsapp" as const,
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

  it("resumo com total sem calcular_pedido na rodada volta ao modelo para recalcular (taxa de entrega)", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    const itens = [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], quantidade: 1 }];
    await semearResumo(memoria.repos, entrada(""), { itens, tipo_entrega: "retirada" });
    const { llm, requisicoes } = llmRoteirizado([
      texto("1x Calabresa (Grande)\n*Total: R$ 45,00*\nEntrega: Rua A, 1 - Centro\nPode confirmar?"),
      chamar(["calcular_pedido", { itens, tipo_entrega: "entrega", bairro_id: ID.bairroCentro }]),
      texto("Resumo atualizado com a entrega. Pode confirmar?"),
    ]);
    const r = await criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO }).processarMensagem(entrada("quero entrega, Rua A 1, Centro"));
    expect(requisicoes[1]!.sistema).toContain("sem chamar calcular_pedido");
    expect(requisicoes[1]!.forcarTool).toBe("calcular_pedido");
    expect(requisicoes[2]!.forcarTool).toBeUndefined();
    expect(r.texto).toBe("Resumo atualizado com a entrega. Pode confirmar?");
  });

  it("o prompt lembra o pedido recém-feito (a conversa encerra ao finalizar)", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    memoria.pedidos.push({ id: "p1", numero: 7, status: "em_preparo", tipoEntrega: "entrega", totalCentavos: 7300 } as (typeof memoria.pedidos)[number]);
    const { llm, requisicoes } = llmRoteirizado([texto("Seu pedido #7 está em preparo!")]);
    await criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO }).processarMensagem(entrada("obrigado"));
    expect(requisicoes[0]!.sistema).toMatch(/Pedidos recentes deste cliente: #7 \(Em preparo/);
  });

  it("loja pausada: pausa rápida, sem horário de abertura da grade", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste({ aceitandoPedidos: false }) });
    const { llm, requisicoes } = llmRoteirizado([texto("Estamos numa pausa rápida, tente em alguns minutos.")]);
    await criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO }).processarMensagem(entrada("quero pedir"));
    expect(requisicoes[0]!.sistema).toContain("PAUSADA");
    expect(requisicoes[0]!.sistema).not.toMatch(/; abre /);
  });

  it("resposta vazia do modelo ganha uma nova tentativa", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    const { llm, requisicoes } = llmRoteirizado([texto(""), texto("Oi! Como posso ajudar?")]);
    const r = await criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO }).processarMensagem(entrada("oi"));
    expect(requisicoes).toHaveLength(2);
    expect(r.texto).toBe("Oi! Como posso ajudar?");
  });

  it("não pede ao cliente do WhatsApp o telefone que já é conhecido", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    const { llm, requisicoes } = llmRoteirizado([texto("Só me confirma o telefone com DDD, por favor."), texto("Qual a forma de pagamento?")]);
    const r = await criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO }).processarMensagem({ ...entrada("meu nome é Maria"), telefone: "5547900000002" });
    expect(requisicoes[1]!.sistema).toContain("número do WhatsApp");
    expect(r.texto).toBe("Qual a forma de pagamento?");
  });

  it("oferece pedir pela conversa ou pelo link só com o pedido pelo link ligado", async () => {
    const opcoes = { urlCardapio: "https://painel.exemplo/cardapio", urlPedir: "https://painel.exemplo/pedir" };
    const promptCom = async (config: Parameters<typeof configDeTeste>[0], agora = ABERTO) => {
      const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste(config) });
      const { llm, requisicoes } = llmRoteirizado([texto("Oi!")]);
      await criarAgente({ repos: memoria.repos, llm, agora: () => agora, opcoes }).processarMensagem({ ...entrada("boa noite"), canal: "whatsapp" });
      return requisicoes[0]!.sistema;
    };
    expect(await promptCom({ pedidoLinkAtivo: true })).toContain("Pedido pelo link (o cliente monta a pizza e finaliza por lá): https://painel.exemplo/pedir");
    expect(await promptCom({ pedidoLinkAtivo: false })).not.toContain("https://painel.exemplo/pedir");
    expect(await promptCom({ pedidoLinkAtivo: false })).not.toContain("Como o cliente pode pedir");
    expect(await promptCom({ pedidoLinkAtivo: true })).toContain("Como o cliente pode pedir");
    // Loja fechada: o link também não aceita pedidos, então não é oferecido.
    expect(await promptCom({ pedidoLinkAtivo: true }, FECHADO)).not.toContain("https://painel.exemplo/pedir");
  });

  it("o link do pedido pelo link passa pela trava de links quando ligado", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste({ pedidoLinkAtivo: true }) });
    const resposta = "Pode pedir aqui comigo ou montar a sua pizza pelo link: https://painel.exemplo/pedir. Como prefere?";
    const { llm, requisicoes } = llmRoteirizado([texto(resposta)]);
    const agente = criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO, opcoes: { urlPedir: "https://painel.exemplo/pedir" } });
    const r = await agente.processarMensagem({ ...entrada("boa noite"), canal: "whatsapp" });
    expect(r.texto).toBe(resposta);
    expect(requisicoes).toHaveLength(1); // sem pedido de correção
  });

  it("finaliza com preços do servidor, ignorando valores do modelo", async () => {
    const { agente, pedidos, conversas, repos } = montar([chamar(["finalizar_pedido", argsFinalizar])]);
    await semearResumo(repos, entrada(""), argsFinalizar);
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
    const { agente, requisicoes, repos } = montar([chamar(["finalizar_pedido", argsFinalizar]), texto("Oi de novo!")]);
    await semearResumo(repos, entrada(""), argsFinalizar);
    await agente.processarMensagem(entrada("pode fechar"));
    await agente.processarMensagem(entrada("oi"));
    expect(requisicoes[1]?.mensagens).toEqual([{ papel: "user", conteudo: "oi" }]);
  });

  it("devolve erros de validação ao modelo para corrigir com o cliente", async () => {
    const { agente, pedidos, requisicoes, repos } = montar([
      chamar(["finalizar_pedido", { ...argsFinalizar, endereco: null }]),
      texto("Preciso do seu endereço completo."),
    ]);
    await semearResumo(repos, entrada(""), argsFinalizar);
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
    const { agente, pedidos, requisicoes, repos } = montar([texto("Perfeito. Seu pedido foi confirmado ✅"), chamar(["finalizar_pedido", argsFinalizar])]);
    await semearResumo(repos, entrada(""), argsFinalizar);
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
