import type { PagamentoRegistro, Repositorios, StatusPagamento } from "@pizzaria/shared";
import { loggerSilencioso, type Logger } from "../logger";
import type { CobrancaCriada, GatewayPix, StatusCobranca } from "./gateway";

export const MOTIVO_PIX_EXPIRADO = "O prazo para pagamento do Pix expirou";
export const MOTIVO_PIX_RECUSADO = "O pagamento Pix não foi aprovado";

export type ResultadoAtualizacao =
  | "confirmado"
  | "cancelado"
  | "expirado"
  | "estornado"
  | "valor_divergente"
  | "sem_mudanca"
  | "desconhecido";

const PARA_STATUS_PAGAMENTO: Record<Exclude<StatusCobranca, "pendente" | "aprovado">, StatusPagamento> = {
  recusado: "recusado",
  cancelado: "cancelado",
  estornado: "estornado",
};

/**
 * Orquestra o Pix: gera a cobrança do pedido, aplica as mudanças de status
 * (vindas do webhook ou da conferência periódica) e expira cobranças vencidas.
 * Tudo é idempotente: processar a mesma atualização duas vezes não muda nada.
 * O status sempre é relido no gateway — o corpo do webhook não é confiável.
 */
export function criarServicoPix(deps: {
  gateway: GatewayPix;
  repos: Repositorios;
  logger?: Logger;
  agora?: () => Date;
}) {
  const logger = deps.logger ?? loggerSilencioso;
  const agora = deps.agora ?? (() => new Date());
  const { gateway, repos } = deps;

  async function aprovado(pagamento: PagamentoRegistro, valorPagoCentavos: number): Promise<ResultadoAtualizacao> {
    const log = { pedido: pagamento.pedidoNumero, provedorId: pagamento.provedorId };
    if (valorPagoCentavos !== pagamento.valorCentavos) {
      logger.error({ ...log, esperado: pagamento.valorCentavos, pago: valorPagoCentavos }, "Pix aprovado com valor divergente; pedido NÃO confirmado");
      return "valor_divergente";
    }
    if (pagamento.status === "pendente") await repos.pagamentos.atualizarStatus(pagamento.id, "pendente", "aprovado");

    if (pagamento.pedidoStatus === "aguardando_pagamento") {
      const confirmou = await repos.pedidos.confirmarPagamento(pagamento.pedidoId);
      if (confirmou) logger.info(log, "Pix confirmado; pedido liberado para a cozinha");
      return confirmou ? "confirmado" : "sem_mudanca";
    }
    if (pagamento.pedidoStatus === "cancelado" && pagamento.status !== "estornado") {
      // Pagou depois de o pedido ser cancelado (expirou/cancelado no painel): devolve o dinheiro.
      await gateway.estornar(pagamento.provedorId);
      await repos.pagamentos.atualizarStatus(pagamento.id, "aprovado", "estornado");
      logger.warn(log, "Pix pago em pedido cancelado; estorno solicitado");
      return "estornado";
    }
    return "sem_mudanca";
  }

  async function encerrar(pagamento: PagamentoRegistro, status: StatusPagamento, motivo: string): Promise<boolean> {
    if (pagamento.status === "pendente") await repos.pagamentos.atualizarStatus(pagamento.id, "pendente", status);
    const cancelou = await repos.pedidos.cancelarAguardandoPagamento(pagamento.pedidoId, motivo);
    if (cancelou) logger.info({ pedido: pagamento.pedidoNumero, status }, "Pedido Pix cancelado");
    return cancelou;
  }

  async function processarAtualizacao(provedorId: string): Promise<ResultadoAtualizacao> {
    const pagamento = await repos.pagamentos.porProvedorId(provedorId);
    if (!pagamento) {
      logger.warn({ provedorId }, "Notificação de pagamento desconhecido");
      return "desconhecido";
    }
    const situacao = await gateway.consultar(provedorId);

    if (situacao.status === "aprovado") return aprovado(pagamento, situacao.valorCentavos);

    if (situacao.status !== "pendente") {
      const motivo = situacao.status === "recusado" ? MOTIVO_PIX_RECUSADO : MOTIVO_PIX_EXPIRADO;
      return (await encerrar(pagamento, PARA_STATUS_PAGAMENTO[situacao.status], motivo)) ? "cancelado" : "sem_mudanca";
    }

    // Ainda pendente: pedido cancelado no painel ou prazo vencido -> cancela a cobrança.
    const vencido = new Date(pagamento.expiraEm).getTime() <= agora().getTime();
    if (pagamento.pedidoStatus !== "cancelado" && !vencido) return "sem_mudanca";

    await gateway.cancelar(provedorId).catch((err: unknown) => logger.warn({ err, provedorId }, "Falha ao cancelar cobrança no gateway"));
    const final = await gateway.consultar(provedorId);
    if (final.status === "aprovado") return aprovado(pagamento, final.valorCentavos); // pagou no último segundo
    if (pagamento.pedidoStatus === "cancelado") {
      await repos.pagamentos.atualizarStatus(pagamento.id, "pendente", "cancelado");
      return "cancelado";
    }
    return (await encerrar(pagamento, "expirado", MOTIVO_PIX_EXPIRADO)) ? "expirado" : "sem_mudanca";
  }

  return {
    async gerarCobranca(pedido: {
      pedidoId: string;
      numero: number;
      totalCentavos: number;
      nomePizzaria: string;
      expiracaoMinutos: number;
    }): Promise<CobrancaCriada> {
      const cobranca = await gateway.criarCobranca({
        pedidoId: pedido.pedidoId,
        descricao: `${pedido.nomePizzaria} - pedido #${pedido.numero}`,
        valorCentavos: pedido.totalCentavos,
        expiraEm: new Date(agora().getTime() + pedido.expiracaoMinutos * 60_000),
      });
      await repos.pagamentos.criar({
        pedidoId: pedido.pedidoId,
        provedorId: cobranca.provedorId,
        valorCentavos: pedido.totalCentavos,
        qrCode: cobranca.qrCode,
        qrCodeBase64: cobranca.qrCodeBase64,
        expiraEm: cobranca.expiraEm,
      });
      return cobranca;
    },

    processarAtualizacao,

    /** Conferência periódica: cobre webhooks perdidos e expira cobranças vencidas. */
    async conferirPendentes(): Promise<void> {
      for (const pagamento of await repos.pagamentos.pendentes()) {
        try {
          await processarAtualizacao(pagamento.provedorId);
        } catch (err) {
          logger.error({ err, provedorId: pagamento.provedorId }, "Falha ao conferir pagamento");
        }
      }
    },
  };
}

export type ServicoPix = ReturnType<typeof criarServicoPix>;
