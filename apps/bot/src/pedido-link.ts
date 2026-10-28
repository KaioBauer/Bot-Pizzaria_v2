import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { finalizarPedidoLink, telefoneComDdi, type ServicoPix } from "@pizzaria/core";
import { formatarReais, type Repositorios } from "@pizzaria/shared";
import type { ChannelAdapter } from "./canais/tipos";
import { criarLimiteTaxa } from "./limite-taxa";

export const ROTA_PEDIDO_LINK = "/pedido-link";
/** Campo invisível no formulário: gente não preenche, robô preenche. */
export const CAMPO_HONEYPOT = "site";
/** IP do cliente repassado pelo servidor do painel (a rota não é pública no Nginx). */
export const CABECALHO_IP_CLIENTE = "x-cliente-ip";

/** Link de acompanhamento do pedido por link. */
export function urlAcompanhamento(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/acompanhar/${token}`;
}

/**
 * Pedido direto pelo link (/pedir). Quem chama é a server action do painel,
 * pela rede interna. Proteções: honeypot, limite por IP e por telefone e a
 * chave de idempotência (resolvida no core/banco).
 */
export function registrarPedidoLink(opcoes: {
  servidor: FastifyInstance;
  repos: Repositorios;
  pix: ServicoPix | null;
  /** Canal usado para os avisos (WhatsApp); null = só a página de acompanhamento. */
  whatsapp: ChannelAdapter | null;
  /** URL pública do /pedir, para o link de acompanhamento na mensagem. */
  urlPedir: string | null;
  logger: Logger;
  limites?: { porIp: number; porTelefone: number; janelaMs: number };
}) {
  const { repos, logger } = opcoes;
  const limites = opcoes.limites ?? { porIp: 20, porTelefone: 5, janelaMs: 60 * 60 * 1000 };
  const porIp = criarLimiteTaxa({ maximo: limites.porIp, janelaMs: limites.janelaMs });
  const porTelefone = criarLimiteTaxa({ maximo: limites.porTelefone, janelaMs: limites.janelaMs });
  const faxina = setInterval(() => {
    porIp.faxina();
    porTelefone.faxina();
  }, 10 * 60 * 1000);
  faxina.unref();

  // O que o /pedir precisa saber do bot (o gateway Pix só existe aqui).
  opcoes.servidor.get(`${ROTA_PEDIDO_LINK}/config`, async () => ({ pix: Boolean(opcoes.pix) }));

  opcoes.servidor.post(ROTA_PEDIDO_LINK, async (req, resposta) => {
    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const ip = String(req.headers[CABECALHO_IP_CLIENTE] ?? req.ip);

    if (typeof corpo[CAMPO_HONEYPOT] === "string" && corpo[CAMPO_HONEYPOT]) {
      logger.warn({ ip }, "Pedido por link barrado pelo honeypot");
      return resposta.code(400).send({ ok: false, erros: ["Não foi possível enviar o pedido."] });
    }
    if (!porIp.consumir(ip)) {
      logger.warn({ ip }, "Pedido por link: limite por IP");
      return resposta.code(429).send({ ok: false, erros: ["Muitas tentativas. Aguarde alguns minutos e tente de novo."] });
    }
    const telefone = typeof corpo.cliente_telefone === "string" ? telefoneComDdi(corpo.cliente_telefone) : "";
    if (telefone && !porTelefone.permite(telefone)) {
      logger.warn({ ip, telefone }, "Pedido por link: limite por telefone");
      return resposta.code(429).send({ ok: false, erros: ["Muitos pedidos para este telefone. Fale com a pizzaria se precisar de ajuda."] });
    }

    const { [CAMPO_HONEYPOT]: _honeypot, ...entrada } = corpo;
    let resultado;
    try {
      resultado = await finalizarPedidoLink({ repos, pix: opcoes.pix, logger }, entrada);
    } catch (err) {
      logger.error({ err }, "Falha ao registrar pedido por link");
      return resposta.code(500).send({ ok: false, erros: ["Não consegui registrar o pedido agora. Tente de novo em instantes."] });
    }
    if (!resultado.ok) return resposta.code(422).send(resultado);

    if (!resultado.existente) {
      porTelefone.registrar(telefone);
      void avisarWhatsapp(telefone, resultado);
    }
    return resposta.send({ ok: true, numero: resultado.numero, token: resultado.token, totalCentavos: resultado.totalCentavos });
  });

  /** Confirmação no WhatsApp do cliente (melhor esforço: a página já mostra tudo). */
  async function avisarWhatsapp(chatId: string, pedido: { numero: number; token: string; totalCentavos: number; pix?: unknown }) {
    if (!opcoes.whatsapp) return;
    const link = opcoes.urlPedir ? urlAcompanhamento(opcoes.urlPedir, pedido.token) : null;
    const texto = [
      pedido.pix
        ? `📝 Recebemos seu pedido *#${pedido.numero}* (${formatarReais(pedido.totalCentavos)}). Ele entra na fila assim que o Pix for pago.`
        : `✅ Recebemos seu pedido *#${pedido.numero}* (${formatarReais(pedido.totalCentavos)})! Já vamos começar a preparar. 🍕`,
      link ? `Acompanhe por aqui: ${link}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await opcoes.whatsapp.sendMessage(chatId, texto);
    } catch (err) {
      logger.warn({ err, numero: pedido.numero }, "Não consegui avisar o pedido por link no WhatsApp");
    }
  }

  return { parar: () => clearInterval(faxina) };
}
