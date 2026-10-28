import type { Logger } from "pino";
import { mensagemStatusPedido } from "@pizzaria/core";
import type { Db } from "@pizzaria/db";
import { ehStatusPedido, execucaoUnica, type TipoEntrega } from "@pizzaria/shared";
import type { ChannelAdapter } from "./canais/tipos";
import { urlAcompanhamento } from "./pedido-link";

const MAX_TENTATIVAS = 5;
/** Notificação mais velha que isso não é mais enviada (perdeu o sentido). */
const VALIDADE_MS = 6 * 60 * 60 * 1000;

/**
 * Envia ao cliente as mudanças de status registradas em
 * `notificacoes_cliente` (preenchida por trigger). Disparado por Realtime, ao
 * iniciar e periodicamente — se o bot estava fora do ar, envia ao voltar.
 * Se o status mudou várias vezes antes do envio, só o mais recente vai.
 */
export function criarNotificador(opcoes: {
  db: Db;
  canais: ReadonlyMap<string, ChannelAdapter>;
  logger: Logger;
  intervaloMs?: number;
  /** URL pública do /pedir: os avisos de pedidos por link levam o link de acompanhamento. */
  urlPedir?: string | null;
}) {
  const { db, canais, logger } = opcoes;

  async function marcar(ids: number[], campos: { enviada_em?: string; ultimo_erro?: string; tentativas?: number }) {
    const { error } = await db.from("notificacoes_cliente").update(campos).in("id", ids);
    if (error) logger.error({ err: error, ids }, "Falha ao atualizar notificações");
  }

  async function processar() {
    const { data, error } = await db
      .from("notificacoes_cliente")
      .select("id, status, tentativas, pedido_id, pedido:pedidos(numero, tipo_entrega, canal, chat_id, motivo_cancelamento, token_acompanhamento)")
      .is("enviada_em", null)
      .lt("tentativas", MAX_TENTATIVAS)
      .gte("created_at", new Date(Date.now() - VALIDADE_MS).toISOString())
      .order("id")
      .limit(100);
    if (error) throw new Error(`Erro ao buscar notificações: ${error.message}`);
    if (!data.length) return;

    // Mais recente por pedido; as anteriores são descartadas como substituídas.
    const ultimaPorPedido = new Map<string, (typeof data)[number]>();
    for (const n of data) ultimaPorPedido.set(n.pedido_id, n);
    const substituidas = data.filter((n) => ultimaPorPedido.get(n.pedido_id) !== n).map((n) => n.id);
    if (substituidas.length) {
      await marcar(substituidas, { enviada_em: new Date().toISOString(), ultimo_erro: "substituída por status mais recente" });
    }

    for (const n of ultimaPorPedido.values()) {
      const log = logger.child({ pedido: n.pedido.numero, status: n.status });
      // Pedido por link: avisos pelo WhatsApp do telefone informado (chat_id = número com DDI).
      const porLink = n.pedido.canal === "link";
      const canal = canais.get(porLink ? "whatsapp" : n.pedido.canal);
      const status = ehStatusPedido(n.status)
        ? mensagemStatusPedido({
            numero: n.pedido.numero,
            status: n.status,
            tipoEntrega: n.pedido.tipo_entrega as TipoEntrega,
            motivoCancelamento: n.pedido.motivo_cancelamento,
          })
        : null;
      const texto =
        status && porLink && opcoes.urlPedir
          ? `${status}\nAcompanhe: ${urlAcompanhamento(opcoes.urlPedir, n.pedido.token_acompanhamento)}`
          : status;

      if (!texto) {
        await marcar([n.id], { enviada_em: new Date().toISOString(), ultimo_erro: "status sem notificação" });
        continue;
      }
      if (!canal && porLink) {
        // Sem WhatsApp o cliente acompanha só pela página: nada a reenviar.
        await marcar([n.id], { enviada_em: new Date().toISOString(), ultimo_erro: "pedido por link sem WhatsApp habilitado" });
        continue;
      }
      if (!canal) {
        await marcar([n.id], { tentativas: n.tentativas + 1, ultimo_erro: `canal ${n.pedido.canal} desabilitado` });
        log.warn("Canal do pedido desabilitado; notificação não enviada");
        continue;
      }
      try {
        await canal.sendMessage(n.pedido.chat_id, texto);
        await marcar([n.id], { enviada_em: new Date().toISOString() });
        log.info("Cliente notificado");
      } catch (err) {
        await marcar([n.id], { tentativas: n.tentativas + 1, ultimo_erro: String(err).slice(0, 500) });
        log.error({ err }, "Falha ao notificar cliente");
      }
    }
  }

  const executar = execucaoUnica(processar, (err) => logger.error({ err }, "Falha ao processar notificações"));
  let canalRealtime: ReturnType<Db["channel"]> | null = null;
  let temporizador: NodeJS.Timeout | null = null;

  return {
    async iniciar() {
      canalRealtime = db
        .channel("notificacoes-cliente")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificacoes_cliente" }, () => void executar())
        .subscribe((estado) => {
          if (estado === "SUBSCRIBED") void executar();
          else if (estado !== "CLOSED") logger.warn({ estado }, "Realtime de notificações desconectado; seguindo pela varredura");
        });
      temporizador = setInterval(() => void executar(), opcoes.intervaloMs ?? 30_000);
      await executar();
    },
    async parar() {
      if (temporizador) clearInterval(temporizador);
      if (canalRealtime) await db.removeChannel(canalRealtime);
      await executar.ocioso();
    },
  };
}
