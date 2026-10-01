import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { validarAssinaturaMercadoPago, type ServicoPix } from "@pizzaria/core";
import { concluirEventoWebhook, registrarEventoWebhook, type Db } from "@pizzaria/db";
import { execucaoUnica } from "@pizzaria/shared";

const PROVEDOR = "mercadopago";
export const ROTA_WEBHOOK_MP = "/webhooks/mercadopago";

/**
 * Webhook do Mercado Pago + conferência periódica dos Pix pendentes.
 * O webhook só diz "o pagamento X mudou": o status real é sempre consultado
 * na API pelo ServicoPix. Respondemos 200 na hora (o MP reenvia se demorar)
 * e processamos em segundo plano.
 */
export function registrarPix(opcoes: {
  servidor: FastifyInstance;
  db: Db;
  pix: ServicoPix;
  logger: Logger;
  segredoWebhook?: string;
  conferenciaMs: number;
}) {
  const { servidor, db, pix, logger } = opcoes;
  if (!opcoes.segredoWebhook) logger.warn("MP_WEBHOOK_SECRET ausente: webhooks aceitos sem validar assinatura (só use em teste)");

  servidor.post<{ Querystring: Record<string, string | undefined>; Body: { type?: string; action?: string; data?: { id?: string | number } } | undefined }>(
    ROTA_WEBHOOK_MP,
    async (req, resposta) => {
      const tipo = req.query.type ?? req.query.topic ?? req.body?.type;
      const dataId = req.query["data.id"] ?? req.query.id ?? (req.body?.data?.id !== undefined ? String(req.body.data.id) : undefined);
      const requestId = req.headers["x-request-id"] as string | undefined;

      if (opcoes.segredoWebhook) {
        const valida = validarAssinaturaMercadoPago({
          assinatura: req.headers["x-signature"] as string | undefined,
          requestId,
          dataId,
          segredo: opcoes.segredoWebhook,
        });
        if (!valida) {
          logger.warn({ dataId, requestId }, "Webhook do Mercado Pago com assinatura inválida");
          return resposta.code(401).send({ ok: false });
        }
      }
      if (tipo !== "payment" || !dataId) return resposta.code(200).send({ ok: true, ignorado: true });

      const chave = `${dataId}:${requestId ?? req.body?.action ?? "sem-request-id"}`;
      if (!(await registrarEventoWebhook(db, PROVEDOR, chave, { query: req.query, body: req.body ?? null }))) {
        return resposta.code(200).send({ ok: true, duplicado: true });
      }

      void pix
        .processarAtualizacao(dataId)
        .then((resultado) => {
          logger.info({ dataId, resultado }, "Webhook de pagamento processado");
          return concluirEventoWebhook(db, PROVEDOR, chave, resultado);
        })
        .catch((err: unknown) => {
          logger.error({ err, dataId }, "Falha ao processar webhook (a conferência periódica tenta de novo)");
          return concluirEventoWebhook(db, PROVEDOR, chave, `erro: ${String(err).slice(0, 200)}`);
        });
      return resposta.code(200).send({ ok: true });
    }
  );

  const conferir = execucaoUnica(() => pix.conferirPendentes(), (err) => logger.error({ err }, "Falha na conferência de Pix"));
  let temporizador: NodeJS.Timeout | null = null;

  return {
    iniciar() {
      void conferir();
      temporizador = setInterval(() => void conferir(), opcoes.conferenciaMs);
    },
    async parar() {
      if (temporizador) clearInterval(temporizador);
      await conferir.ocioso();
    },
  };
}
