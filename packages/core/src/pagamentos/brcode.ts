/**
 * BR Code do Pix ("copia e cola"): payload EMV-QRCPS do Manual de Padrões
 * para Iniciação do Pix (Banco Central). Cada campo é ID (2 dígitos) +
 * tamanho (2 dígitos) + valor; o último campo (63) é o CRC16-CCITT do texto.
 */

export interface DadosBrCode {
  /** Chave Pix do recebedor (aleatória/EVP, e-mail, telefone, CPF/CNPJ). */
  chave: string;
  valorCentavos: number;
  /** Até 25 caracteres; sem acento (o leitor do banco não aceita). */
  nomeRecebedor: string;
  /** Até 15 caracteres. */
  cidade: string;
  /** Identificador da cobrança: até 25 letras/números. */
  txid: string;
  /** Mensagem ao pagador (opcional). */
  descricao?: string;
}

const GUI_PIX = "br.gov.bcb.pix";

/** CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acentos e o que o padrão não aceita, e corta no tamanho máximo. */
function limpar(texto: string, maximo: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,\-/@*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximo);
}

function campo(id: string, valor: string): string {
  const tamanho = Buffer.byteLength(valor, "utf8");
  if (tamanho > 99) throw new Error(`Campo ${id} do BR Code passa de 99 caracteres`);
  return `${id}${String(tamanho).padStart(2, "0")}${valor}`;
}

export function gerarBrCode(d: DadosBrCode): string {
  if (!Number.isInteger(d.valorCentavos) || d.valorCentavos <= 0) throw new Error("Valor do Pix inválido");
  const txid = d.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const descricao = d.descricao ? limpar(d.descricao, 40) : "";
  const conta = campo("00", GUI_PIX) + campo("01", d.chave) + (descricao ? campo("02", descricao) : "");
  const semCrc =
    campo("00", "01") +
    campo("01", "12") + // 12 = QR usado uma vez só (cobrança)
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") + // BRL
    campo("54", (d.valorCentavos / 100).toFixed(2)) +
    campo("58", "BR") +
    campo("59", limpar(d.nomeRecebedor, 25) || "RECEBEDOR") +
    campo("60", limpar(d.cidade, 15) || "BRASIL") +
    campo("62", campo("05", txid)) +
    "6304";
  return semCrc + crc16(semCrc);
}

export interface BrCodeLido {
  chave: string;
  valorCentavos: number | null;
  nomeRecebedor: string;
  cidade: string;
  txid: string | null;
  descricao: string | null;
}

/** Lê campos ID+tamanho+valor; null se o texto não fecha certinho. */
function lerCampos(texto: string): Map<string, string> | null {
  const campos = new Map<string, string>();
  let i = 0;
  while (i < texto.length) {
    const id = texto.slice(i, i + 2);
    const tamanho = Number(texto.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(tamanho) || i + 4 + tamanho > texto.length) return null;
    campos.set(id, texto.slice(i + 4, i + 4 + tamanho));
    i += 4 + tamanho;
  }
  return campos;
}

/**
 * Lê um Pix copia e cola como o app do banco faz: confere o CRC e extrai
 * recebedor, valor e identificador. null = código inválido ou não é Pix.
 */
export function lerBrCode(codigo: string): BrCodeLido | null {
  const texto = codigo.trim();
  if (texto.length < 30 || texto.slice(-8, -4) !== "6304") return null;
  if (crc16(texto.slice(0, -4)) !== texto.slice(-4).toUpperCase()) return null;
  const campos = lerCampos(texto.slice(0, -8));
  if (!campos || campos.get("00") !== "01") return null;
  const conta = lerCampos(campos.get("26") ?? "");
  if (!conta || conta.get("00")?.toLowerCase() !== GUI_PIX || !conta.get("01")) return null;
  const valor = campos.get("54");
  const txid = lerCampos(campos.get("62") ?? "")?.get("05") ?? null;
  return {
    chave: conta.get("01")!,
    valorCentavos: valor ? Math.round(Number(valor) * 100) : null,
    nomeRecebedor: campos.get("59") ?? "",
    cidade: campos.get("60") ?? "",
    txid: txid && txid !== "***" ? txid : null,
    descricao: conta.get("02") ?? null,
  };
}
