import type { AtendimentoRepo } from "@pizzaria/shared";
import { exigir, type Db } from "../client";

const RESUMO = 300;

export function criarAtendimentoRepo(db: Db): AtendimentoRepo {
  return {
    async iaPausada(canal, chatId) {
      const r = await db.from("atendimentos").select("ia_pausada").eq("canal", canal).eq("chat_id", chatId).maybeSingle();
      // Chat sem registro ainda (cliente novo) = IA respondendo; `exigir` trataria o null como erro.
      if (r.error) exigir(r, "Erro ao consultar atendimento");
      return Boolean(r.data?.ia_pausada);
    },

    async registrar(canal, chatId, m) {
      exigir(
        await db
          .from("atendimentos")
          .upsert(
            {
              canal,
              chat_id: chatId,
              ultima_mensagem: m.texto.slice(0, RESUMO),
              ultima_mensagem_autor: m.autor,
              ultima_mensagem_em: new Date().toISOString(),
              // Só envia o que mudou: o upsert não pode apagar nome nem desligar o aviso.
              ...(m.clienteNome ? { cliente_nome: m.clienteNome } : {}),
              ...(m.precisaAtencao ? { precisa_atencao: true } : {}),
            },
            { onConflict: "canal,chat_id" }
          )
          .select("canal"),
        "Erro ao registrar atendimento"
      );
    },

    async pausar(canal, chatId, dados) {
      exigir(
        await db
          .from("atendimentos")
          .upsert(
            {
              canal,
              chat_id: chatId,
              ia_pausada: true,
              pausada_em: new Date().toISOString(),
              pausada_por: dados.por,
              motivo: dados.motivo.slice(0, RESUMO),
              precisa_atencao: true,
            },
            { onConflict: "canal,chat_id" }
          )
          .select("canal"),
        "Erro ao pausar a IA"
      );
    },
  };
}
