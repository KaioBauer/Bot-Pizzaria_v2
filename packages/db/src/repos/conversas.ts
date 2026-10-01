import type { ChamadaTool, ConversasRepo, MensagemConversa } from "@pizzaria/shared";
import { exigir, type Db } from "../client";
import type { Json } from "../database.types";

const VIOLACAO_UNICIDADE = "23505";

export function criarConversasRepo(db: Db): ConversasRepo {
  async function buscarAtiva(canal: string, chatId: string) {
    const resultado = await db
      .from("conversas")
      .select("id, updated_at")
      .eq("canal", canal)
      .eq("chat_id", chatId)
      .is("encerrada_em", null)
      .maybeSingle();
    if (resultado.error) exigir(resultado, "Erro ao buscar conversa");
    return resultado.data;
  }

  return {
    async obterAtiva(canal, chatId, inativaDesde) {
      const atual = await buscarAtiva(canal, chatId);
      if (atual && new Date(atual.updated_at) >= inativaDesde) return atual.id;

      if (atual) {
        exigir(
          await db
            .from("conversas")
            .update({ encerrada_em: new Date().toISOString() })
            .eq("id", atual.id)
            .select("id"),
          "Erro ao encerrar conversa expirada"
        );
      }

      const criada = await db
        .from("conversas")
        .insert({ canal, chat_id: chatId })
        .select("id")
        .single();
      if (criada.error?.code === VIOLACAO_UNICIDADE) {
        // Outra mensagem do mesmo chat criou a conversa ao mesmo tempo.
        const existente = await buscarAtiva(canal, chatId);
        if (existente) return existente.id;
      }
      return exigir(criada, "Erro ao criar conversa").id;
    },

    async mensagens(conversaId, limite) {
      const linhas = exigir(
        await db
          .from("conversa_mensagens")
          .select("papel, conteudo, tool_calls, tool_call_id")
          .eq("conversa_id", conversaId)
          .order("id", { ascending: false })
          .limit(limite),
        "Erro ao carregar histórico"
      );
      return linhas.reverse().map((linha): MensagemConversa => {
        switch (linha.papel) {
          case "tool":
            return {
              papel: "tool",
              toolCallId: linha.tool_call_id ?? "",
              conteudo: linha.conteudo ?? "",
            };
          case "assistant":
            return {
              papel: "assistant",
              conteudo: linha.conteudo,
              ...(linha.tool_calls
                ? { toolCalls: linha.tool_calls as unknown as ChamadaTool[] }
                : {}),
            };
          default:
            return { papel: "user", conteudo: linha.conteudo ?? "" };
        }
      });
    },

    async adicionar(conversaId, mensagens) {
      if (mensagens.length === 0) return;
      exigir(
        await db
          .from("conversa_mensagens")
          .insert(
            mensagens.map((m) => ({
              conversa_id: conversaId,
              papel: m.papel,
              conteudo: m.conteudo,
              tool_calls:
                m.papel === "assistant" && m.toolCalls?.length
                  ? (m.toolCalls as unknown as Json)
                  : null,
              tool_call_id: m.papel === "tool" ? m.toolCallId : null,
            }))
          )
          .select("id"),
        "Erro ao salvar histórico"
      );
      exigir(
        await db
          .from("conversas")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversaId)
          .select("id"),
        "Erro ao atualizar conversa"
      );
    },

    async encerrar(conversaId, pedidoId) {
      exigir(
        await db
          .from("conversas")
          .update({ encerrada_em: new Date().toISOString(), pedido_id: pedidoId })
          .eq("id", conversaId)
          .select("id"),
        "Erro ao encerrar conversa"
      );
    },
  };
}
