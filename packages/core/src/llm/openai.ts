import OpenAI from "openai";
import type { MensagemConversa } from "@pizzaria/shared";
import type { LlmProvider, RequisicaoLlm, RespostaLlm } from "./tipos";

type MensagemOpenAi = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface OpcoesOpenAi {
  apiKey: string;
  modelo: string;
  /** Tempo máximo por chamada, em ms. */
  timeoutMs?: number;
  maxTentativas?: number;
  /** Só para modelos de raciocínio (gpt-5*, o*). Com tools no Chat Completions, os gpt-5.x exigem "none". */
  esforcoRaciocinio?: "none" | "minimal" | "low" | "medium" | "high";
}

/** Modelos de raciocínio não aceitam `temperature`; usam `reasoning_effort`. */
export function ehModeloRaciocinio(modelo: string): boolean {
  return /^(gpt-5|o\d)/.test(modelo) && !modelo.includes("chat");
}

function paraOpenAi(mensagem: MensagemConversa): MensagemOpenAi {
  switch (mensagem.papel) {
    case "user":
      return { role: "user", content: mensagem.conteudo };
    case "tool":
      return { role: "tool", tool_call_id: mensagem.toolCallId, content: mensagem.conteudo };
    case "assistant":
      return {
        role: "assistant",
        content: mensagem.conteudo,
        ...(mensagem.toolCalls?.length
          ? {
              tool_calls: mensagem.toolCalls.map((chamada) => ({
                id: chamada.id,
                type: "function" as const,
                function: { name: chamada.nome, arguments: chamada.argumentos },
              })),
            }
          : {}),
      };
  }
}

export function criarProvedorOpenAi(opcoes: OpcoesOpenAi): LlmProvider {
  const cliente = new OpenAI({
    apiKey: opcoes.apiKey,
    timeout: opcoes.timeoutMs ?? 30_000,
    maxRetries: opcoes.maxTentativas ?? 2,
  });

  const raciocinio = ehModeloRaciocinio(opcoes.modelo);

  return {
    async completar(requisicao: RequisicaoLlm): Promise<RespostaLlm> {
      const resposta = await cliente.chat.completions.create({
        model: opcoes.modelo,
        ...(raciocinio
          ? { reasoning_effort: opcoes.esforcoRaciocinio ?? "none" }
          : { temperature: 0.3 }),
        messages: [
          { role: "system", content: requisicao.sistema },
          ...requisicao.mensagens.map(paraOpenAi),
        ],
        tools: requisicao.tools.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.nome,
            description: tool.descricao,
            parameters: tool.parametros,
          },
        })),
      });

      const mensagem = resposta.choices[0]?.message;
      return {
        conteudo: mensagem?.content ?? null,
        toolCalls: (mensagem?.tool_calls ?? []).flatMap((chamada) =>
          chamada.type === "function"
            ? [{ id: chamada.id, nome: chamada.function.name, argumentos: chamada.function.arguments }]
            : []
        ),
      };
    },
  };
}
