import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { validarAssinaturaOpenPix, type ServicoPix } from "@pizzaria/core";
import { concluirEventoWebhook, registrarEventoWebhook, type Db } from "@pizzaria/db";
import { execucaoUnica } from "@pizzaria/shared";

const PROVEDOR = "openpix";
export const ROTA_WEBHOOK_PIX = "/webhooks/openpix";

const EVENTOS_DE_COBRANCA = new Set(["OPENPIX:CHARGE_COMPLETED", "OPENPIX:CHARGE_EXPIRED", "OPENPIX:TRANSACTION_RECEIVED"]);

interface EventoOpenPix {
  event?: string;
  evento?: string;
  charge?: { correlationID?: string; status?: string };
  pix?: { charge?: { correlationID?: string } };
}

function igual(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Webhook da OpenPix/Woovi + conferência periódica dos Pix pendentes.
 * O webhook só diz "a cobrança X mudou": o status real é sempre consultado
 * na API pelo ServicoPix. Respondemos 200 na hora e processamos em segundo plano.
 */
export function registrarPix(opcoes: {
  servidor: FastifyInstance;
  db: Db;
  pix: ServicoPix;
  logger: Logger;
  chavesPublicas: () => Promise<string[]>;
  /** Valor do campo "Authorization" cadastrado no webhook da Woovi (opcional, defesa extra). */
  autorizacaoWebhook?: string;
  conferenciaMs: number;
}) {
  const { db, pix, logger } = opcoes;

  // Escopo próprio: só esta rota recebe o corpo cru (a assinatura é sobre os bytes exatos).
  void opcoes.servidor.register(async (escopo) => {
    escopo.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, corpo, pronto) => pronto(null, corpo));

    escopo.post(ROTA_WEBHOOK_PIX, async (req, resposta) => {
      const corpoCru = req.body as Buffer;

      if (opcoes.autorizacaoWebhook && !igual(req.headers.authorization, opcoes.autorizacaoWebhook)) {
        logger.warn("Webhook OpenPix com Authorization inválido");
        return resposta.code(401).send({ ok: false });
      }
      const valida = validarAssinaturaOpenPix({
        corpoCru,
        assinatura: req.headers["x-webhook-signature"] as string | undefined,
        chavesPublicas: await opcoes.chavesPublicas(),
      });
      if (!valida) {
        logger.warn("Webhook OpenPix com assinatura inválida");
        return resposta.code(401).send({ ok: false });
      }

      let evento: EventoOpenPix;
      try {
        evento = JSON.parse(corpoCru.toString("utf8")) as EventoOpenPix;
      } catch {
        return resposta.code(400).send({ ok: false });
      }
      if (evento.evento === "teste_webhook") return resposta.code(200).send({ ok: true, teste: true });

      const correlationID = evento.charge?.correlationID ?? evento.pix?.charge?.correlationID;
      if (!evento.event || !EVENTOS_DE_COBRANCA.has(evento.event) || !correlationID) {
        return resposta.code(200).send({ ok: true, ignorado: true });
      }

      const chave = `${evento.event}:${correlationID}:${(req.headers["x-webhook-event-id"] as string | undefined) ?? evento.charge?.status ?? ""}`;
      if (!(await registrarEventoWebhook(db, PROVEDOR, chave, evento))) {
        return resposta.code(200).send({ ok: true, duplicado: true });
      }

      void pix
        .processarAtualizacao(correlationID)
        .then((resultado) => {
          logger.info({ correlationID, evento: evento.event, resultado }, "Webhook de pagamento processado");
          return concluirEventoWebhook(db, PROVEDOR, chave, resultado);
        })
        .catch((err: unknown) => {
          logger.error({ err, correlationID }, "Falha ao processar webhook (a conferência periódica tenta de novo)");
          return concluirEventoWebhook(db, PROVEDOR, chave, `erro: ${String(err).slice(0, 200)}`);
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
