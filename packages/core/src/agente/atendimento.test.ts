import { describe, expect, it } from "vitest";
import { configDeTeste, variacoesDeTeste } from "../testes/fixtures";
import { chamar, llmRoteirizado, repositoriosEmMemoria, texto } from "../testes/memoria";
import { criarAgente, MENSAGEM_ATENDENTE_CHAMADO } from "./agente";

const ABERTO = new Date("2026-10-02T20:00:00-03:00");
const entrada = (t: string) => ({ canal: "whatsapp" as const, chatId: "5511999990000", clienteNome: "Maria", texto: t });

function montar(roteiro: Parameters<typeof llmRoteirizado>[0]) {
  const memoria = repositoriosEmMemoria({ variacoes: variacoesDeTeste(), config: configDeTeste() });
  const { llm, requisicoes } = llmRoteirizado(roteiro);
  const agente = criarAgente({ repos: memoria.repos, llm, agora: () => ABERTO });
  return { agente, requisicoes, ...memoria };
}

describe("atendimento humano", () => {
  it("chamar_atendente pausa a IA, liga o aviso e responde sem o modelo inventar", async () => {
    const { agente, atendimentos, requisicoes } = montar([chamar(["chamar_atendente", { motivo: "pedido #3 atrasado" }])]);
    const r = await agente.processarMensagem(entrada("meu pedido tá atrasado faz 1 hora!!"));
    expect(r.texto).toBe(MENSAGEM_ATENDENTE_CHAMADO);
    expect(requisicoes).toHaveLength(1);
    expect(atendimentos.get("whatsapp:5511999990000")).toMatchObject({ iaPausada: true, precisaAtencao: true, motivo: "pedido #3 atrasado" });
  });

  it("com a IA pausada: não chama o modelo, não responde e avisa o painel", async () => {
    const { agente, atendimentos, requisicoes, conversas } = montar([]);
    atendimentos.set("whatsapp:5511999990000", { iaPausada: true, precisaAtencao: false });
    const r = await agente.processarMensagem(entrada("alô? alguém aí?"));
    expect(r.texto).toBe("");
    expect(requisicoes).toHaveLength(0);
    expect(atendimentos.get("whatsapp:5511999990000")).toMatchObject({ precisaAtencao: true, ultima: "alô? alguém aí?", autor: "cliente" });
    const [conversa] = conversas.values();
    expect(conversa?.mensagens).toEqual([{ papel: "user", conteudo: "alô? alguém aí?", autor: "cliente" }]);
  });

  it("comandos também não passam pela IA enquanto o humano atende", async () => {
    const { agente, atendimentos } = montar([]);
    atendimentos.set("whatsapp:5511999990000", { iaPausada: true, precisaAtencao: false });
    expect((await agente.processarMensagem(entrada("/reiniciar"))).texto).toBe("");
  });

  it("resposta normal da IA vira a última mensagem do chat no painel", async () => {
    const { agente, atendimentos } = montar([texto("Oi! O que vai ser hoje?")]);
    await agente.processarMensagem(entrada("oi"));
    expect(atendimentos.get("whatsapp:5511999990000")).toMatchObject({ iaPausada: false, precisaAtencao: false, ultima: "Oi! O que vai ser hoje?", autor: "ia" });
  });
});
