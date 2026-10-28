import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { validarAssinaturaPixSimulado, type EventoPixSimulado, type ServicoPix } from "@pizzaria/core";
import { concluirEventoWebhook, registrarEventoWebhook, type Db } from "@pizzaria/db";
import { execucaoUnica } from "@pizzaria/shared";

const PROVEDOR = "simulado";
export const ROTA_WEBHOOK_PIX = "/webhooks/pix";

const EVENTOS_DE_COBRANCA = new Set<string>(["cobranca.paga", "cobranca.expirada", "cobranca.estornada"] satisfies EventoPixSimulado["tipo"][]);

/**
 * Webhook do Pix (hoje o Pix simulado) + conferência periódica dos pendentes.
 * O webhook só diz "a cobrança X mudou": o status real é sempre consultado no
 * gateway pelo ServicoPix. Respondemos 200 na hora e processamos em segundo plano.
 */
export function registrarPix(opcoes: {
  servidor: FastifyInstance;
  db: Db;
  pix: ServicoPix;
  logger: Logger;
  /** Segredo do HMAC (`x-pix-assinatura`) combinado com o emissor. */
  segredoWebhook: string;
  conferenciaMs: number;
}) {
  const { db, pix, logger } = opcoes;

  // Escopo próprio: só esta rota recebe o corpo cru (a assinatura é sobre os bytes exatos).
  void opcoes.servidor.register(async (escopo) => {
    escopo.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, corpo, pronto) => pronto(null, corpo));

    escopo.post(ROTA_WEBHOOK_PIX, async (req, resposta) => {
      const corpoCru = req.body as Buffer;
      if (!validarAssinaturaPixSimulado(corpoCru, req.headers["x-pix-assinatura"] as string | undefined, opcoes.segredoWebhook)) {
        logger.warn("Webhook de Pix com assinatura inválida");
        return resposta.code(401).send({ ok: false });
      }

      let evento: Partial<EventoPixSimulado>;
      try {
        evento = JSON.parse(corpoCru.toString("utf8")) as Partial<EventoPixSimulado>;
      } catch {
        return resposta.code(400).send({ ok: false });
      }
      if (!evento.tipo || !EVENTOS_DE_COBRANCA.has(evento.tipo) || !evento.referencia || !evento.id) {
        return resposta.code(200).send({ ok: true, ignorado: true });
      }

      const { referencia, tipo } = evento;
      if (!(await registrarEventoWebhook(db, PROVEDOR, evento.id, evento))) {
        return resposta.code(200).send({ ok: true, duplicado: true });
      }

      void pix
        .processarAtualizacao(referencia)
        .then((resultado) => {
          logger.info({ referencia, evento: tipo, resultado }, "Webhook de pagamento processado");
          return concluirEventoWebhook(db, PROVEDOR, evento.id!, resultado);
        })
        .catch((err: unknown) => {
          logger.error({ err, referencia }, "Falha ao processar webhook (a conferência periódica tenta de novo)");
          return concluirEventoWebhook(db, PROVEDOR, evento.id!, `erro: ${String(err).slice(0, 200)}`);
        });
      return resposta.code(200).send({ ok: true });
    });
  });

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
