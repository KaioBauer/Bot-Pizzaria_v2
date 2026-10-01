/** Contrato do provedor de Pix (Mercado Pago hoje; trocável). */

export type StatusCobranca = "pendente" | "aprovado" | "recusado" | "cancelado" | "estornado";

export interface NovaCobranca {
  /** Usado como referência externa e chave de idempotência. */
  pedidoId: string;
  descricao: string;
  valorCentavos: number;
  expiraEm: Date;
}

export interface CobrancaCriada {
  provedorId: string;
  /** Código "copia e cola". */
  qrCode: string;
  /** PNG do QR Code em base64 (sem prefixo data:). */
  qrCodeBase64: string;
  expiraEm: Date;
}

export interface SituacaoCobranca {
  provedorId: string;
  status: StatusCobranca;
  valorCentavos: number;
  referenciaExterna: string | null;
}

export interface GatewayPix {
  criarCobranca(cobranca: NovaCobranca): Promise<CobrancaCriada>;
  consultar(provedorId: string): Promise<SituacaoCobranca>;
  cancelar(provedorId: string): Promise<void>;
  estornar(provedorId: string): Promise<void>;
}
