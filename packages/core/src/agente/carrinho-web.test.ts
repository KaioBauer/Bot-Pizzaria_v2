import { describe, expect, it } from "vitest";
import { configDeTeste, ID, sabor, variacoesDeTeste } from "../testes/fixtures";
import { llmRoteirizado, repositoriosEmMemoria, texto } from "../testes/memoria";
import { criarAgente } from "./agente";
import { codigoCarrinhoWeb } from "./carrinho-web";

const ABERTO = new Date("2026-10-02T20:00:00-03:00");
const FECHADO = new Date("2026-10-02T10:00:00-03:00");
const CODIGO = "a1b2c3d4e5f60718";

const carrinho = [
  { sabores: [sabor(ID.calabresa, ID.calabresaGrande), sabor(ID.margherita, ID.margheritaGrande)], adicionais: [ID.calabresaBorda], quantidade: 1, observacao: "sem cebola" },
  { sabores: [sabor(ID.coca, ID.cocaUnica)], adicionais: [], quantidade: 2, observacao: null },
];

const entrada = (texto: string) => ({ canal: "telegram" as const, chatId: "123", clienteNome: "Maria", texto });

function montar(agora = ABERTO, itens: unknown = carrinho) {
  const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
  memoria.carrinhos.set(CODIGO, itens);
  const { llm, requisicoes } = llmRoteirizado([texto("Perfeito! Qual o endereço?")]);
  const agente = criarAgente({ repos: memoria.repos, llm, agora: () => agora, opcoes: { urlCardapio: "https://loja/cardapio" } });
  return { agente, requisicoes, ...memoria };
}

describe("codigoCarrinhoWeb", () => {
  it.each([
    [`/start c_${CODIGO}`, CODIGO],
    [`/start@ViannaBot c_${CODIGO.toUpperCase()}`, CODIGO],
    [`oi\n/start c_${CODIGO}`, CODIGO],
    ["/start", null],
    ["/start cardapio", null],
    ["/start c_xyz", null],
    [`quero c_${CODIGO}`, null],
  ])("%s -> %s", (texto, esperado) => {
    expect(codigoCarrinhoWeb(texto)).toBe(esperado);
  });
});

describe("carrinho do cardápio no agente", () => {
  it("reprecifica no servidor, responde sem o LLM e deixa os IDs no histórico", async () => {
    const { agente, requisicoes, conversas, carrinhos } = montar();
    const r = await agente.processarMensagem(entrada(`/start c_${CODIGO}`));

    expect(requisicoes).toHaveLength(0);
    // Grande sem tamanhos cadastrados: vale o sabor mais caro (59,00) + borda 8,00
    expect(r.texto).toContain("1x Meio a meio Calabresa / Margherita (Grande) + Borda Catupiry — R$ 67,00");
    expect(r.texto).toContain("2x Coca-Cola Lata — R$ 12,00");
    expect(r.texto).toContain("*Subtotal: R$ 79,00*");
    expect(r.texto).toContain("*entrega* ou *retirada*");
    expect(carrinhos.has(CODIGO)).toBe(false);

    const ativa = [...conversas.values()].find((c) => !c.encerrada)!;
    expect(ativa.mensagens.map((m) => m.papel)).toEqual(["user", "assistant"]);
    expect(ativa.mensagens[0]?.conteudo).toContain(ID.calabresaBorda);

    // A próxima mensagem vai ao LLM com o carrinho no histórico.
    await agente.processarMensagem(entrada("entrega"));
    expect(requisicoes[0]?.mensagens[0]).toMatchObject({ papel: "user" });
    expect(JSON.stringify(requisicoes[0]?.mensagens[0])).toContain(ID.margheritaGrande);
    expect(requisicoes[0]?.sistema).toContain("Pedido montado no cardápio do site");
  });

  it("carrinho usado, vencido ou inexistente", async () => {
    const { agente } = montar();
    await agente.processarMensagem(entrada(`/start c_${CODIGO}`));
    const r = await agente.processarMensagem(entrada(`/start c_${CODIGO}`));
    expect(r.texto).toContain("Não encontrei esse pedido do cardápio");
    expect(r.texto).toContain("https://loja/cardapio");
  });

  it("carrinho com formato inválido é tratado como inexistente", async () => {
    const { agente } = montar(ABERTO, [{ sabores: [] }]);
    expect((await agente.processarMensagem(entrada(`/start c_${CODIGO}`))).texto).toContain("Não encontrei");
  });

  it("item indisponível: avisa e não inventa preço", async () => {
    const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste({ [ID.cocaUnica]: { ativa: false } }), config: configDeTeste() });
    memoria.carrinhos.set(CODIGO, carrinho);
    const agente = criarAgente({ repos: memoria.repos, llm: llmRoteirizado([]).llm, agora: () => ABERTO });
    const r = await agente.processarMensagem(entrada(`/start c_${CODIGO}`));
    expect(r.texto).toContain("tem um detalhe");
    expect(r.texto).not.toContain("Subtotal");
  });

  it("loja fechada: avisa e não consome o carrinho", async () => {
    const { agente, carrinhos } = montar(FECHADO);
    const r = await agente.processarMensagem(entrada(`/start c_${CODIGO}`));
    expect(r.texto).toContain("fechados");
    expect(r.texto).toContain("Enviar pelo Telegram");
    expect(carrinhos.has(CODIGO)).toBe(true);
  });
});
