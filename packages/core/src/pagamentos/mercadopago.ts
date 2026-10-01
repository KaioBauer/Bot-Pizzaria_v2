import { createHmac, timingSafeEqual } from "node:crypto";
import { paraCentavos, paraReais } from "@pizzaria/shared";
import type { GatewayPix, StatusCobranca } from "./gateway";

const API = "https://api.mercadopago.com";

export interface OpcoesMercadoPago {
  accessToken: string;
  /** URL pública do webhook (ex.: https://bot.dominio/webhooks/mercadopago). Sem ela, só a conferência periódica. */
  urlNotificacao?: string;
  /** E-mail do pagador exigido pela API (o cliente não precisa informar). */
  emailPagador: string;
  fetch?: typeof fetch;
}

export class ErroMercadoPago extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ErroMercadoPago";
  }
}

const STATUS: Record<string, StatusCobranca> = {
  pending: "pendente",
  in_process: "pendente",
  authorized: "pendente",
  approved: "aprovado",
  rejected: "recusado",
  cancelled: "cancelado",
  expired: "cancelado",
  refunded: "estornado",
  charged_back: "estornado",
};

/** "2026-10-01T20:30:00.000-03:00": formato com fuso que a API exige. */
function dataComFuso(data: Date): string {
  const iso = new Date(data.getTime() - 3 * 3600_000).toISOString().replace("Z", "");
  return `${iso}-03:00`;
}

export function criarGatewayMercadoPago(opcoes: OpcoesMercadoPago): GatewayPix {
  const http = opcoes.fetch ?? fetch;

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown, idempotencia?: string): Promise<T> {
    const resposta = await http(`${API}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${opcoes.accessToken}`,
        "Content-Type": "application/json",
        ...(idempotencia ? { "X-Idempotency-Key": idempotencia } : {}),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      signal: AbortSignal.timeout(15_000),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
      throw new ErroMercadoPago(`Mercado Pago ${metodo} ${caminho}: HTTP ${resposta.status} ${texto.slice(0, 300)}`, resposta.status);
    }
    return (texto ? JSON.parse(texto) : {}) as T;
  }

  type Pagamento = {
    id: number;
    status: string;
    transaction_amount: number;
    external_reference: string | null;
    date_of_expiration?: string;
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
  };

  return {
    async criarCobranca(c) {
      const pagamento = await chamar<Pagamento>(
        "POST",
        "/v1/payments",
        {
          transaction_amount: paraReais(c.valorCentavos),
          description: c.descricao,
          payment_method_id: "pix",
          payer: { email: opcoes.emailPagador },
          external_reference: c.pedidoId,
          date_of_expiration: dataComFuso(c.expiraEm),
          ...(opcoes.urlNotificacao ? { notification_url: opcoes.urlNotificacao } : {}),
        },
        `pedido-${c.pedidoId}`
      );
      const dados = pagamento.point_of_interaction?.transaction_data;
      if (!dados?.qr_code || !dados.qr_code_base64) {
        throw new ErroMercadoPago("Mercado Pago não devolveu o QR Code do Pix", 502);
      }
      return {
        provedorId: String(pagamento.id),
        qrCode: dados.qr_code,
        qrCodeBase64: dados.qr_code_base64,
        expiraEm: pagamento.date_of_expiration ? new Date(pagamento.date_of_expiration) : c.expiraEm,
      };
    },

    async consultar(provedorId) {
      const p = await chamar<Pagamento>("GET", `/v1/payments/${encodeURIComponent(provedorId)}`);
      return {
        provedorId: String(p.id),
        status: STATUS[p.status] ?? "pendente",
        valorCentavos: paraCentavos(p.transaction_amount),
        referenciaExterna: p.external_reference,
      };
    },

    async cancelar(provedorId) {
      await chamar("PUT", `/v1/payments/${encodeURIComponent(provedorId)}`, { status: "cancelled" });
    },

    async estornar(provedorId) {
      await chamar("POST", `/v1/payments/${encodeURIComponent(provedorId)}/refunds`, {}, `estorno-${provedorId}`);
    },
  };
}

/**
 * Valida o cabeçalho `x-signature` do webhook do Mercado Pago:
 * HMAC-SHA256(segredo, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;").
 * `dataId` vem da query string (`data.id`). Rejeita notificações mais
 * velhas que `toleranciaMs` (proteção contra replay).
 */
export function validarAssinaturaMercadoPago(params: {
  assinatura: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  segredo: string;
  agora?: number;
  toleranciaMs?: number;
}): boolean {
  if (!params.assinatura || !params.dataId) return false;
  const partes = Object.fromEntries(
    params.assinatura.split(",").map((parte) => {
      const [chave, ...valor] = parte.split("=");
      return [chave?.trim(), valor.join("=").trim()];
    })
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;

  const tsMs = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  const tolerancia = params.toleranciaMs ?? 15 * 60_000;
  if (!Number.isFinite(tsMs) || Math.abs((params.agora ?? Date.now()) - tsMs) > tolerancia) return false;

  const id = /^[a-z0-9]+$/i.test(params.dataId) ? params.dataId.toLowerCase() : params.dataId;
  const manifesto = `id:${id};${params.requestId ? `request-id:${params.requestId};` : ""}ts:${ts};`;
  const esperado = createHmac("sha256", params.segredo).update(manifesto).digest();
  const recebido = Buffer.from(v1, "hex");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
