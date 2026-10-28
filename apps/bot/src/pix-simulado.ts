import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Logger } from "pino";
import { assinarWebhookPixSimulado, type BancoPixSimulado, type EventoPixSimulado } from "@pizzaria/core";
import type { ValidarAdmin } from "./admin-whatsapp";

/**
 * Emissor dos webhooks do Pix simulado, com o comportamento de um PSP real:
 * chega alguns segundos depois do pagamento, assinado (HMAC), e é reenviado
 * se o recebedor não responder 2xx. `perda` (0 a 1) descarta webhooks de
 * propósito para exercitar a conferência periódica.
 */
export function criarEmissorWebhookPix(opcoes: {
  url: string;
  segredo: string;
  logger: Logger;
  atrasoMs?: readonly [number, number];
  perda?: number;
  /** Esperas entre as tentativas (a primeira é imediata, depois do atraso). */
  reenviosMs?: readonly number[];
  fetch?: typeof fetch;
  sortear?: () => number;
}) {
  const http = opcoes.fetch ?? fetch;
  const sortear = opcoes.sortear ?? Math.random;
  const [atrasoMin, atrasoMax] = opcoes.atrasoMs ?? [1_000, 4_000];
  const reenvios = opcoes.reenviosMs ?? [2_000, 10_000, 30_000];
  const emAndamento = new Set<Promise<void>>();
  let parado = false;

  const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

  async function entregar(evento: EventoPixSimulado) {
    await esperar(atrasoMin + sortear() * (atrasoMax - atrasoMin));
    if (sortear() < (opcoes.perda ?? 0)) {
      opcoes.logger.warn({ evento: evento.tipo, referencia: evento.referencia }, "Webhook do Pix simulado descartado de propósito (perda simulada)");
      return;
    }
    const corpo = JSON.stringify(evento);
    for (let tentativa = 0; tentativa <= reenvios.length && !parado; tentativa++) {
      if (tentativa > 0) await esperar(reenvios[tentativa - 1]!);
      try {
        const r = await http(opcoes.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-pix-assinatura": assinarWebhookPixSimulado(corpo, opcoes.segredo), "x-pix-evento-id": evento.id },
          body: corpo,
          signal: AbortSignal.timeout(10_000),
        });
        if (r.ok) return;
        opcoes.logger.warn({ status: r.status, tentativa }, "Webhook do Pix simulado recusado");
      } catch (err) {
        opcoes.logger.warn({ err, tentativa }, "Webhook do Pix simulado falhou");
      }
    }
    opcoes.logger.error({ evento: evento.tipo, referencia: evento.referencia }, "Webhook do Pix simulado desistiu (a conferência periódica cobre)");
  }

  return {
    emitir(evento: EventoPixSimulado) {
      if (parado) return;
      const p = entregar(evento).finally(() => emAndamento.delete(p));
      emAndamento.add(p);
    },
    async parar() {
      parado = true;
      await Promise.allSettled([...emAndamento]);
    },
  };
}

/**
 * Rotas do "Banco simulado" usadas pelo painel (com o token do admin logado):
 *   GET  /admin/pix-simulado        extrato: cobranças recentes
 *   POST /admin/pix-simulado/ler    lê o Pix copia e cola (recebedor, valor)
 *   POST /admin/pix-simulado/pagar  paga e devolve o comprovante
 */
export function registrarBancoPixSimulado(params: {
  servidor: FastifyInstance;
  /** null = Pix desligado (PIX_SIMULADO=false). */
  banco: BancoPixSimulado | null;
  validarAdmin: ValidarAdmin;
  logger: Logger;
}) {
  const { servidor, banco, logger } = params;

  async function autorizado(req: FastifyRequest, resposta: FastifyReply): Promise<boolean> {
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    const ok = token ? await params.validarAdmin(token).catch(() => false) : false;
    if (!ok) await resposta.code(401).send({ erro: "Não autorizado" });
    return ok;
  }

  const textoDe = (v: unknown, maximo: number) => (typeof v === "string" ? v.slice(0, maximo) : "");

  servidor.get("/admin/pix-simulado", async (req, resposta) => {
    if (!(await autorizado(req, resposta))) return;
    if (!banco) return resposta.send({ habilitado: false, cobrancas: [] });
    return resposta.send({ habilitado: true, cobrancas: await banco.recentes(30) });
  });

  servidor.post<{ Body: { codigo?: unknown } | null }>("/admin/pix-simulado/ler", async (req, resposta) => {
    if (!(await autorizado(req, resposta))) return;
    if (!banco) return resposta.code(409).send({ erro: "O Pix está desligado no bot (PIX_SIMULADO=false)." });
    return resposta.send(await banco.ler(textoDe(req.body?.codigo, 600)));
  });

  servidor.post<{ Body: { codigo?: unknown; pagador?: unknown } | null }>("/admin/pix-simulado/pagar", async (req, resposta) => {
    if (!(await autorizado(req, resposta))) return;
    if (!banco) return resposta.code(409).send({ erro: "O Pix está desligado no bot (PIX_SIMULADO=false)." });
    const resultado = await banco.pagar(textoDe(req.body?.codigo, 600), textoDe(req.body?.pagador, 60));
    if (resultado.ok) logger.info({ txid: resultado.dados.txid, valorCentavos: resultado.dados.valorCentavos }, "Pix simulado pago pelo Banco simulado");
    return resposta.send(resultado);
  });
}
