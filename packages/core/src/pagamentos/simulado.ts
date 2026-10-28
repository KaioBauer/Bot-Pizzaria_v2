import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { CobrancaSimulada, CobrancasSimuladasRepo, StatusCobrancaSimulada } from "@pizzaria/shared";
import { gerarBrCode, lerBrCode } from "./brcode";
import type { GatewayPix, StatusCobranca } from "./gateway";

/**
 * Pix simulado: faz o papel do PSP (o banco do lojista) sem dinheiro de verdade.
 * Gera BR Code válido (o mesmo formato que um app de banco lê), QR Code,
 * expiração, cancelamento e estorno, e avisa as mudanças por webhook assinado,
 * como um PSP real. O pagamento é feito no "Banco simulado" do painel, colando
 * o Pix copia e cola, como o cliente faria no app do banco.
 *
 * A chave Pix é fictícia: um app de banco real lê o QR, mas não acha a chave
 * e não deixa pagar. Nenhum dinheiro se move.
 */

export type TipoEventoPixSimulado = "cobranca.paga" | "cobranca.expirada" | "cobranca.estornada";

export interface EventoPixSimulado {
  id: string;
  tipo: TipoEventoPixSimulado;
  referencia: string;
  txid: string;
  criadoEm: string;
}

export interface OpcoesPixSimulado {
  cobrancas: CobrancasSimuladasRepo;
  /** Chave Pix aleatória (EVP) fictícia do recebedor. */
  chave: string;
  /** Nome e cidade que o app do banco mostra antes de pagar. */
  recebedor: () => Promise<{ nome: string; cidade: string }>;
  /** Chamado a cada mudança de status; o bot transforma em webhook. */
  aoMudar?: (evento: EventoPixSimulado) => void;
  agora?: () => Date;
}

const PARA_STATUS: Record<StatusCobrancaSimulada, StatusCobranca> = {
  ativa: "pendente",
  paga: "aprovado",
  expirada: "cancelado",
  cancelada: "cancelado",
  estornada: "estornado",
};

/** ISPB fictício do "Banco simulado" (8 dígitos, como no SPI). */
export const ISPB_SIMULADO = "99999999";

const ALFANUMERICO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function aleatorio(tamanho: number): string {
  return [...randomBytes(tamanho)].map((b) => ALFANUMERICO[b % ALFANUMERICO.length]).join("");
}

/** E + ISPB + AAAAMMDDHHmm (UTC) + 11 caracteres: 32 no total, como o SPI. */
export function gerarEndToEndId(instante: Date): string {
  const data = instante.toISOString().replace(/\D/g, "").slice(0, 12);
  return `E${ISPB_SIMULADO}${data}${aleatorio(11)}`;
}

/** Chave aleatória com só o começo e o fim visíveis, como no app do banco. */
export function mascararChave(chave: string): string {
  return chave.length <= 12 ? chave : `${chave.slice(0, 8)}…${chave.slice(-4)}`;
}

export interface CobrancaParaPagar {
  txid: string;
  recebedor: string;
  cidade: string;
  chave: string;
  valorCentavos: number;
  descricao: string;
  status: StatusCobrancaSimulada;
  expiraEm: string;
}

export interface Comprovante {
  endToEndId: string;
  txid: string;
  valorCentavos: number;
  recebedor: string;
  pagador: string;
  pagoEm: string;
}

export type ResultadoBanco<T> = { ok: true; dados: T } | { ok: false; erro: string };

const MOTIVO_INDISPONIVEL: Partial<Record<StatusCobrancaSimulada, string>> = {
  paga: "Esta cobrança já foi paga.",
  expirada: "Esta cobrança expirou. Peça um novo Pix ao recebedor.",
  cancelada: "Esta cobrança foi cancelada pelo recebedor.",
  estornada: "Esta cobrança já foi paga e devolvida.",
};

export function criarPixSimulado(opcoes: OpcoesPixSimulado) {
  const agora = opcoes.agora ?? (() => new Date());
  const { cobrancas } = opcoes;

  function avisar(tipo: TipoEventoPixSimulado, c: CobrancaSimulada) {
    opcoes.aoMudar?.({ id: randomUUID(), tipo, referencia: c.referencia, txid: c.txid, criadoEm: agora().toISOString() });
  }

  /** Vencida e ainda ativa vira "expirada" (o PSP real expira sozinho e avisa). */
  async function atualizarExpiracao(c: CobrancaSimulada): Promise<CobrancaSimulada> {
    if (c.status !== "ativa" || new Date(c.expiraEm).getTime() > agora().getTime()) return c;
    if (await cobrancas.atualizar(c.referencia, "ativa", { status: "expirada" })) {
      avisar("cobranca.expirada", c);
      return { ...c, status: "expirada" };
    }
    return (await cobrancas.porReferencia(c.referencia)) ?? c;
  }

  async function qrPng(brCode: string): Promise<string> {
    const png = await QRCode.toBuffer(brCode, { type: "png", width: 512, margin: 2, errorCorrectionLevel: "M" });
    return png.toString("base64");
  }

  const gateway: GatewayPix = {
    async criarCobranca(c) {
      const existente = await cobrancas.porReferencia(c.pedidoId);
      if (existente) {
        return { provedorId: existente.referencia, qrCode: existente.brCode, qrCodeBase64: await qrPng(existente.brCode), expiraEm: new Date(existente.expiraEm) };
      }
      const { nome, cidade } = await opcoes.recebedor();
      const txid = aleatorio(25);
      const brCode = gerarBrCode({ chave: opcoes.chave, valorCentavos: c.valorCentavos, nomeRecebedor: nome, cidade, txid });
      const criada = await cobrancas.criar({
        referencia: c.pedidoId,
        txid,
        valorCentavos: c.valorCentavos,
        descricao: c.descricao.slice(0, 140),
        brCode,
        expiraEm: c.expiraEm.toISOString(),
      });
      return { provedorId: criada.referencia, qrCode: criada.brCode, qrCodeBase64: await qrPng(criada.brCode), expiraEm: new Date(criada.expiraEm) };
    },

    async consultar(provedorId) {
      const salva = await cobrancas.porReferencia(provedorId);
      if (!salva) return { provedorId, status: "cancelado", valorCentavos: 0, referenciaExterna: provedorId };
      const c = await atualizarExpiracao(salva);
      return { provedorId, status: PARA_STATUS[c.status], valorCentavos: c.valorCentavos, referenciaExterna: c.referencia };
    },

    async cancelar(provedorId) {
      // Já paga/expirada: nada a fazer; a consulta seguinte decide.
      await cobrancas.atualizar(provedorId, "ativa", { status: "cancelada" });
    },

    async estornar(provedorId) {
      const c = await cobrancas.porReferencia(provedorId);
      if (c?.status === "estornada") return;
      if (!c || !(await cobrancas.atualizar(provedorId, "paga", { status: "estornada", estornadaEm: agora().toISOString() }))) {
        throw new Error(`Pix simulado: cobrança ${provedorId} não está paga para estornar`);
      }
      avisar("cobranca.estornada", c);
    },
  };

  /** O "app do banco": lê o copia e cola e paga. */
  const banco = {
    async ler(codigo: string): Promise<ResultadoBanco<CobrancaParaPagar>> {
      const lido = lerBrCode(codigo);
      if (!lido) return { ok: false, erro: "Código Pix inválido. Confira se copiou o código inteiro." };
      if (lido.chave !== opcoes.chave) return { ok: false, erro: "Chave Pix não encontrada no Banco simulado." };
      const salva = lido.txid ? await cobrancas.porTxid(lido.txid) : null;
      if (!salva) return { ok: false, erro: "Cobrança não encontrada." };
      const c = await atualizarExpiracao(salva);
      return {
        ok: true,
        dados: {
          txid: c.txid,
          recebedor: lido.nomeRecebedor,
          cidade: lido.cidade,
          chave: mascararChave(lido.chave),
          valorCentavos: c.valorCentavos,
          descricao: c.descricao,
          status: c.status,
          expiraEm: c.expiraEm,
        },
      };
    },

    async pagar(codigo: string, pagador: string): Promise<ResultadoBanco<Comprovante>> {
      const leitura = await banco.ler(codigo);
      if (!leitura.ok) return leitura;
      const c = leitura.dados;
      const indisponivel = MOTIVO_INDISPONIVEL[c.status];
      if (indisponivel) return { ok: false, erro: indisponivel };

      const salva = (await cobrancas.porTxid(c.txid))!;
      const pagoEm = agora();
      const endToEndId = gerarEndToEndId(pagoEm);
      const nomePagador = pagador.trim().slice(0, 60) || "Cliente de teste";
      const pagou = await cobrancas.atualizar(salva.referencia, "ativa", {
        status: "paga",
        pagaEm: pagoEm.toISOString(),
        pagadorNome: nomePagador,
        endToEndId,
      });
      if (!pagou) {
        const atual = await cobrancas.porTxid(c.txid);
        return { ok: false, erro: MOTIVO_INDISPONIVEL[atual?.status ?? "cancelada"] ?? "Não foi possível pagar agora." };
      }
      avisar("cobranca.paga", salva);
      return {
        ok: true,
        dados: { endToEndId, txid: c.txid, valorCentavos: c.valorCentavos, recebedor: c.recebedor, pagador: nomePagador, pagoEm: pagoEm.toISOString() },
      };
    },

    /** Extrato do recebedor: cobranças recentes (vencidas aparecem como expiradas). */
    async recentes(limite = 30): Promise<CobrancaSimulada[]> {
      return Promise.all((await cobrancas.recentes(limite)).map(atualizarExpiracao));
    },
  };

  return { gateway, banco };
}

export type PixSimulado = ReturnType<typeof criarPixSimulado>;
export type BancoPixSimulado = PixSimulado["banco"];

// Webhook ---------------------------------------------------------------------------

/** Cabeçalho `x-pix-assinatura`: "sha256=" + HMAC-SHA256 (hex) do corpo cru. */
export function assinarWebhookPixSimulado(corpo: string | Buffer, segredo: string): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
}

export function validarAssinaturaPixSimulado(corpo: string | Buffer, assinatura: string | undefined, segredo: string): boolean {
  if (!assinatura) return false;
  const esperada = Buffer.from(assinarWebhookPixSimulado(corpo, segredo));
  const recebida = Buffer.from(assinatura);
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
}
