import { describe, expect, it } from "vitest";
import { configDeTeste, ID, sabor, variacoesDeTeste } from "../testes/fixtures";
import { chamar, llmRoteirizado, repositoriosEmMemoria, semearResumo, texto } from "../testes/memoria";
import { criarAgente } from "./agente";
import { mensagemBoasVindas, reconhecerComando } from "./comandos";

const ABERTO = new Date("2026-10-02T20:00:00-03:00");

describe("reconhecerComando", () => {
  it.each([
    ["/start", "start"],
    ["/start cardapio", "start"],
    ["/reiniciar", "reiniciar"],
    ["/REINICIAR", "reiniciar"],
    ["/reiniciar@AtendimentoViannaPizzariaBot", "reiniciar"],
    ["/recomeçar", "reiniciar"],
    ["quero uma calabresa\n/reiniciar", "reiniciar"],
  ] as const)("%s -> %s", (entrada, esperado) => {
    expect(reconhecerComando(entrada)).toBe(esperado);
  });

  it.each(["oi", "reiniciar", "/startup", "quero reiniciar o pedido", "/cardapio"])("não é comando: %s", (entrada) => {
    expect(reconhecerComando(entrada)).toBeNull();
  });
});

describe("mensagemBoasVindas", () => {
  const base = { config: configDeTeste(), proximaAbertura: null, urlCardapio: "https://painel/cardapio", nomeCliente: "Maria Souza" };

  it("cumprimenta pelo primeiro nome e manda o link do cardápio", () => {
    const m = mensagemBoasVindas({ ...base, comando: "start", situacao: { aberta: true } });
    expect(m).toContain("Olá, Maria!");
    expect(m).toContain("https://painel/cardapio");
  });

  it("no reinício avisa que descartou o pedido em montagem", () => {
    expect(mensagemBoasVindas({ ...base, comando: "reiniciar", situacao: { aberta: true } })).toContain("comecei do zero");
  });

  it("fechado informa quando abre", () => {
    const m = mensagemBoasVindas({ ...base, comando: "start", situacao: { aberta: false, motivo: "fora_do_horario" }, proximaAbertura: "hoje às 18:00" });
    expect(m).toContain("abrimos hoje às 18:00");
  });
});

describe("/reiniciar no agente", () => {
  it("zera a conversa sem chamar o LLM", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    const { llm, requisicoes } = llmRoteirizado([texto("Anotado: calabresa grande."), texto("Olá de novo!")]);
    const agente = criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO });
    const entrada = (t: string) => ({ canal: "whatsapp" as const, chatId: "1", clienteNome: "Maria", texto: t });

    await agente.processarMensagem(entrada("quero uma calabresa grande"));
    const r = await agente.processarMensagem(entrada("/reiniciar"));
    expect(r.texto).toContain("comecei do zero");
    expect(requisicoes).toHaveLength(1); // o comando não passou pelo LLM

    await agente.processarMensagem(entrada("oi"));
    expect(requisicoes[1]?.mensagens).toEqual([{ papel: "user", conteudo: "oi" }]); // histórico zerado
  });

  it("não afeta pedido já feito", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
    const args = { itens: [{ sabores: [sabor(ID.calabresa, ID.calabresaGrande)], quantidade: 1 }], tipo_entrega: "retirada", forma_pagamento: "cartao", cliente_nome: "Maria", cliente_telefone: "11987654321" };
    const { llm } = llmRoteirizado([chamar(["finalizar_pedido", args])]);
    const agente = criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO });
    await semearResumo(memoria.repos, { canal: "whatsapp", chatId: "1" }, args);
    await agente.processarMensagem({ canal: "whatsapp", chatId: "1", texto: "pode fechar" });
    await agente.processarMensagem({ canal: "whatsapp", chatId: "1", texto: "/reiniciar" });
    expect(memoria.pedidos).toHaveLength(1);
    expect(memoria.pedidos[0]?.status).toBe("novo");
  });
});
