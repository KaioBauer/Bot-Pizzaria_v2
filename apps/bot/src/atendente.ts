import type { Logger } from "pino";
import type { Db } from "@pizzaria/db";
import { execucaoUnica, type Canal, type Repositorios } from "@pizzaria/shared";
import type { ChannelAdapter } from "./canais/tipos";

const MAX_TENTATIVAS = 5;
/** Conversa parada há mais que isso recomeça (mesma regra do agente). */
const EXPIRACAO_CONVERSA_MS = 180 * 60_000;
const ehCanal = (c: string): c is Canal => c === "whatsapp";

/**
 * Envia ao cliente as respostas escritas pelo atendente no painel
 * (`mensagens_atendente`, outbox). Disparado por Realtime e por varredura;
 * cada mensagem enviada entra no histórico da conversa (autor "atendente"),
 * para a IA ter o contexto quando a conversa for devolvida a ela.
 */
export function criarEnvioAtendente(opcoes: {
  db: Db;
  repos: Repositorios;
  canais: ReadonlyMap<string, ChannelAdapter>;
  logger: Logger;
  expiracaoConversaMs?: number;
  intervaloMs?: number;
}) {
  const { db, repos, canais, logger } = opcoes;

  async function processar() {
    const { data, error } = await db
      .from("mensagens_atendente")
      .select("id, canal, chat_id, texto, autor_id, tentativas")
      .is("enviada_em", null)
      .lt("tentativas", MAX_TENTATIVAS)
      .order("id")
      .limit(50);
    if (error) throw new Error(`Erro ao buscar mensagens do atendente: ${error.message}`);

    for (const m of data) {
      const log = logger.child({ id: m.id, canal: m.canal, chatId: m.chat_id });
      const canal = canais.get(m.canal);
      if (!canal || !ehCanal(m.canal)) {
        await db.from("mensagens_atendente").update({ tentativas: m.tentativas + 1, ultimo_erro: `canal ${m.canal} desabilitado` }).eq("id", m.id);
        log.warn("Canal desabilitado; mensagem do atendente não enviada");
        continue;
      }
      try {
        await canal.sendMessage(m.chat_id, m.texto);
      } catch (err) {
        await db.from("mensagens_atendente").update({ tentativas: m.tentativas + 1, ultimo_erro: String(err).slice(0, 500) }).eq("id", m.id);
        log.error({ err }, "Falha ao enviar mensagem do atendente");
        continue;
      }
      // Enviada: marca antes do histórico para nunca reenviar (duplicar > perder não vale aqui).
      await db.from("mensagens_atendente").update({ enviada_em: new Date().toISOString() }).eq("id", m.id);
      try {
        const conversaId = await repos.conversas.obterAtiva(m.canal, m.chat_id, new Date(Date.now() - (opcoes.expiracaoConversaMs ?? EXPIRACAO_CONVERSA_MS)));
        await repos.conversas.adicionar(conversaId, [{ papel: "assistant", conteudo: m.texto, autor: "atendente", autorId: m.autor_id }]);
        await repos.atendimento.registrar(m.canal, m.chat_id, { texto: m.texto, autor: "atendente" });
      } catch (err) {
        log.error({ err }, "Mensagem enviada, mas falhou ao gravar no histórico");
      }
      log.info("Mensagem do atendente enviada");
    }
  }

  const executar = execucaoUnica(processar, (err) => logger.error({ err }, "Falha ao enviar mensagens do atendente"));
  let canalRealtime: ReturnType<Db["channel"]> | null = null;
  let temporizador: NodeJS.Timeout | null = null;

  return {
    async iniciar() {
      canalRealtime = db
        .channel("mensagens-atendente")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens_atendente" }, () => void executar())
        .subscribe((estado) => {
          if (estado === "SUBSCRIBED") void executar();
          else if (estado !== "CLOSED") logger.warn({ estado }, "Realtime do atendente desconectado; seguindo pela varredura");
        });
      temporizador = setInterval(() => void executar(), opcoes.intervaloMs ?? 10_000);
      await executar();
    },
    async parar() {
      if (temporizador) clearInterval(temporizador);
      if (canalRealtime) await db.removeChannel(canalRealtime);
      await executar.ocioso();
    },
  };
}
