import { CharacterSet, PrinterTypes, ThermalPrinter } from "node-thermal-printer";
import type { ComandoCupom } from "./cupom";
import { SpoolerWindows } from "./transporte/windows";

export interface OpcoesImpressora {
  /** "windows:NOME_DA_IMPRESSORA" (USB/spooler) ou "tcp://IP:9100" (rede). */
  interface: string;
  colunas: number;
  modelo: "epson" | "elgin" | "bematech" | "star" | "generico";
  /** Página de código ESC/POS; "nenhuma" remove acentos (máxima compatibilidade). */
  paginaCodigo: "PC860_PORTUGUESE" | "PC850_MULTILINGUAL" | "WPC1252" | "nenhuma";
  /** Avanço de linhas antes do corte (algumas impressoras cortam rente ao texto). */
  avancoAntesDoCorte: number;
}

export interface Impressora {
  imprimir(comandos: ComandoCupom[], vias: number, documento: string): Promise<void>;
  status(): Promise<string>;
}

function removerAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function criarImpressora(opcoes: OpcoesImpressora): Impressora {
  const windows = opcoes.interface.match(/^windows:(.+)$/i);
  const transporte = windows ? new SpoolerWindows(windows[1]!.trim()) : opcoes.interface;

  // Elgin, Bematech e as genéricas (POS-58 etc.) falam o dialeto ESC/POS da Epson.
  const tipo = opcoes.modelo === "star" ? PrinterTypes.STAR : PrinterTypes.EPSON;
  const pagina = opcoes.paginaCodigo;
  const semAcentos = pagina === "nenhuma";
  const codificacao = pagina === "nenhuma" ? { removeSpecialCharacters: true } : { characterSet: CharacterSet[pagina] };

  function novoDocumento() {
    return new ThermalPrinter({
      type: tipo,
      // A biblioteca aceita um objeto de interface próprio no lugar da URI.
      interface: transporte as string,
      width: opcoes.colunas,
      ...codificacao,
      options: { timeout: 10_000 },
    });
  }

  function renderizar(doc: ThermalPrinter, comandos: ComandoCupom[]) {
    for (const c of comandos) {
      if (c.tipo === "linha") {
        doc.alignLeft();
        doc.println(c.caractere.repeat(opcoes.colunas));
        continue;
      }
      if (c.tipo === "corte") {
        for (let i = 0; i < opcoes.avancoAntesDoCorte; i++) doc.newLine();
        // Sem os "VT" padrão da biblioteca: em impressoras genéricas (POS-58)
        // eles avançam muito papel. O avanço fica só por PRINTER_AVANCO_CORTE.
        doc.cut({ verticalTabAmount: 0 });
        continue;
      }
      if (c.centro) doc.alignCenter();
      else doc.alignLeft();
      doc.bold(Boolean(c.negrito));
      if (c.grande) doc.setTextDoubleHeight(), doc.setTextDoubleWidth();
      doc.println(semAcentos ? removerAcentos(c.texto) : c.texto);
      if (c.grande) doc.setTextNormal();
      doc.bold(false);
    }
  }

  return {
    async imprimir(comandos, vias, documento) {
      const doc = novoDocumento();
      for (let i = 0; i < vias; i++) renderizar(doc, comandos);
      await doc.execute({ docname: documento });
    },

    async status() {
      if (transporte instanceof SpoolerWindows) return transporte.status();
      const doc = novoDocumento();
      return (await doc.isPrinterConnected()) ? "Normal" : "offline";
    },
  };
}
