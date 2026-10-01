import { createVerify } from "node:crypto";
import QRCode from "qrcode";
import type { GatewayPix, StatusCobranca } from "./gateway";

/**
 * Gateway Pix da OpenPix/Woovi (API v1). A cobrança é identificada pelo
 * `correlationID`, que é o próprio ID do pedido: consultas, cancelamento e
 * estorno usam esse valor como `provedorId`.
 * Referência: SDK oficial @woovi/node-sdk e developers.woovi.com.
 */

export type AmbienteOpenPix = "producao" | "sandbox";

const BASE_URL: Record<AmbienteOpenPix, string> = {
  producao: "https://api.openpix.com.br",
  sandbox: "https://api.woovi-sandbox.com",
};

export interface OpcoesOpenPix {
  /** AppID da aplicação (painel Woovi > API/Plugins). */
  appId: string;
  ambiente: AmbienteOpenPix;
  fetch?: typeof fetch;
}

export class ErroOpenPix extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ErroOpenPix";
  }
}

const STATUS: Record<string, StatusCobranca> = {
  ACTIVE: "pendente",
  COMPLETED: "aprovado",
  EXPIRED: "cancelado",
};

interface CobrancaOpenPix {
  correlationID: string;
  value: number;
  status?: "ACTIVE" | "COMPLETED" | "EXPIRED";
  brCode?: string;
  expiresDate?: string;
}

export function criarGatewayOpenPix(opcoes: OpcoesOpenPix): GatewayPix {
  const http = opcoes.fetch ?? fetch;
  const base = BASE_URL[opcoes.ambiente];

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const resposta = await http(`${base}${caminho}`, {
      method: metodo,
      headers: { Authorization: opcoes.appId, "Content-Type": "application/json" },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      signal: AbortSignal.timeout(15_000),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
      throw new ErroOpenPix(`OpenPix ${metodo} ${caminho}: HTTP ${resposta.status} ${texto.slice(0, 300)}`, resposta.status);
    }
    return (texto ? JSON.parse(texto) : {}) as T;
  }

  const caminhoCobranca = (id: string) => `/api/v1/charge/${encodeURIComponent(id)}`;

  return {
    async criarCobranca(c) {
      const expiraEmSegundos = Math.max(60, Math.round((c.expiraEm.getTime() - Date.now()) / 1000));
      // return_existing: repetir a criação para o mesmo pedido devolve a mesma cobrança.
      const { charge } = await chamar<{ charge: CobrancaOpenPix }>("POST", "/api/v1/charge?return_existing=true", {
        correlationID: c.pedidoId,
        value: c.valorCentavos,
        comment: c.descricao.slice(0, 140),
        expiresIn: expiraEmSegundos,
      });
      if (!charge.brCode) throw new ErroOpenPix("OpenPix não devolveu o código Pix (brCode)", 502);
      const png = await QRCode.toBuffer(charge.brCode, { type: "png", width: 512, margin: 2, errorCorrectionLevel: "M" });
      return {
        provedorId: charge.correlationID,
        qrCode: charge.brCode,
        qrCodeBase64: png.toString("base64"),
        expiraEm: charge.expiresDate ? new Date(charge.expiresDate) : c.expiraEm,
      };
    },

    async consultar(provedorId) {
      let charge: CobrancaOpenPix;
      try {
        ({ charge } = await chamar<{ charge: CobrancaOpenPix }>("GET", caminhoCobranca(provedorId)));
      } catch (err) {
        // Cobrança cancelada (DELETE) deixa de existir: a API responde 400/404.
        if (err instanceof ErroOpenPix && (err.status === 400 || err.status === 404)) {
          return { provedorId, status: "cancelado", valorCentavos: 0, referenciaExterna: provedorId };
        }
        throw err;
      }
      return {
        provedorId: charge.correlationID,
        status: STATUS[charge.status ?? ""] ?? "pendente",
        valorCentavos: charge.value,
        referenciaExterna: charge.correlationID,
      };
    },

    async cancelar(provedorId) {
      try {
        await chamar("DELETE", caminhoCobranca(provedorId));
      } catch (err) {
        // Já paga/expirada/removida: a consulta seguinte decide o que fazer.
        if (!(err instanceof ErroOpenPix) || err.status >= 500) throw err;
      }
    },

    async estornar(provedorId) {
      await chamar("POST", `${caminhoCobranca(provedorId)}/refund`, {
        correlationID: `estorno-${provedorId}`,
        comment: "Pedido cancelado",
      });
    },
  };
}

// Assinatura do webhook -------------------------------------------------------------

/** Chave pública de produção publicada na documentação da Woovi (fallback se o endpoint falhar). */
export const CHAVE_PUBLICA_OPENPIX_PRODUCAO = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/+NtIkjzevvqD+I3MMv3bLXDt
pvxBjY4BsRrSdca3rtAwMcRYYvxSnd7jagVLpctMiOxQO8ieUCKLSWHpsMAjO/zZ
WMKbqoG8MNpi/u3fp6zz0mcHCOSqYsPUUG19buW8bis5ZZ2IZgBObWSpTvJ0cnj6
HKBAA82Jln+lGwS1MwIDAQAB
-----END PUBLIC KEY-----
`;

/**
 * Valida o cabeçalho `x-webhook-signature`: RSA-SHA256 (base64) sobre o
 * corpo CRU da requisição, com qualquer uma das chaves públicas vigentes.
 */
export function validarAssinaturaOpenPix(params: {
  corpoCru: Buffer | string;
  assinatura: string | undefined;
  chavesPublicas: string[];
}): boolean {
  if (!params.assinatura) return false;
  return params.chavesPublicas.some((chave) => {
    try {
      const verificador = createVerify("sha256");
      verificador.update(typeof params.corpoCru === "string" ? Buffer.from(params.corpoCru) : params.corpoCru);
      verificador.end();
      return verificador.verify(chave, params.assinatura!, "base64");
    } catch {
      return false;
    }
  });
}

/**
 * Chaves públicas da Woovi (endpoint público), com cache de 1 hora como a
 * documentação recomenda. Em caso de falha usa o cache anterior ou a chave
 * de produção documentada.
 */
export function criarCacheChavesOpenPix(ambiente: AmbienteOpenPix, http: typeof fetch = fetch) {
  let cache: { chaves: string[]; expiraEm: number } | null = null;
  return async (): Promise<string[]> => {
    if (cache && cache.expiraEm > Date.now()) return cache.chaves;
    try {
      const resposta = await http(`${BASE_URL[ambiente]}/api/v1/webhook/public-keys`, { signal: AbortSignal.timeout(10_000) });
      const corpo = (await resposta.json()) as { public_keys?: Array<{ key: string }> };
      const chaves = (corpo.public_keys ?? []).map((k) => k.key).filter(Boolean);
      if (chaves.length) {
        cache = { chaves, expiraEm: Date.now() + 60 * 60_000 };
        return chaves;
      }
    } catch {
      // segue para o fallback
    }
    return cache?.chaves ?? (ambiente === "producao" ? [CHAVE_PUBLICA_OPENPIX_PRODUCAO] : []);
  };
}
