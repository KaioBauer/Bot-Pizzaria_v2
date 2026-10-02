import { formatarReais, formatarTelefone, type FormaPagamento, type TipoEntrega } from "@pizzaria/shared";

/**
 * Layout do cupom como uma lista de comandos neutros. Puro e testável: quem
 * transforma isso em ESC/POS é `impressora.ts`. Todas as linhas cabem em
 * `colunas` (32 em 58 mm, 48 em 80 mm), considerando o tamanho da fonte.
 */

export interface PedidoParaCupom {
  numero: number;
  criadoEm: Date;
  canal: string;
  clienteNome: string;
  clienteTelefone: string | null;
  tipoEntrega: TipoEntrega;
  enderecoTexto: string | null;
  formaPagamento: FormaPagamento;
  trocoParaCentavos: number | null;
  subtotalCentavos: number;
  taxaEntregaCentavos: number;
  totalCentavos: number;
  observacoes: string | null;
  itens: Array<{
    quantidade: number;
    descricao: string;
    observacao: string | null;
    subtotalCentavos: number;
  }>;
}

export type ComandoCupom =
  | { tipo: "texto"; texto: string; centro?: boolean; negrito?: boolean; grande?: boolean }
  | { tipo: "linha"; caractere: "-" | "=" }
  | { tipo: "qr"; conteudo: string }
  | { tipo: "corte" };

export interface OpcoesCupom {
  colunas: number;
  nomePizzaria: string;
  fusoHorario: string;
  reimpressao?: boolean;
  /** Link da tela do motoboy (<painel>/entrega/<id>); entrega ganha um QR com ele. */
  urlEntrega?: string | null;
}

const PAGAMENTO: Record<FormaPagamento, string> = {
  pix: "PIX (JA PAGO)",
  dinheiro: "DINHEIRO",
  cartao: "CARTAO (MAQUININHA)",
};

/** Quebra por palavras; linhas seguintes recebem o recuo. */
export function quebrar(texto: string, largura: number, recuo = ""): string[] {
  const recuoInicial = /^ */.exec(texto)?.[0] ?? "";
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const prefixo = linhas.length === 0 && !atual ? recuoInicial : recuo;
    const disponivel = largura - (atual ? 0 : prefixo.length);
    if (!atual) {
      if (palavra.length > disponivel) {
        // Palavra maior que a linha: corta.
        let resto = palavra;
        while (resto.length > largura - prefixo.length) {
          linhas.push(prefixo + resto.slice(0, largura - prefixo.length));
          resto = resto.slice(largura - prefixo.length);
        }
        atual = prefixo + resto;
      } else {
        atual = prefixo + palavra;
      }
    } else if (atual.length + 1 + palavra.length <= largura) {
      atual += ` ${palavra}`;
    } else {
      linhas.push(atual);
      atual = recuo + palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

/** Texto à esquerda e valor à direita na mesma linha (quebrando o texto se preciso). */
export function emColunas(esquerda: string, direita: string, largura: number, recuo = ""): string[] {
  const linhas = quebrar(esquerda, largura, recuo);
  const ultima = linhas.pop() ?? "";
  if (ultima.length + 1 + direita.length > largura) {
    // O valor não cabe na última linha: vai sozinho, alinhado à direita.
    return [...linhas, ultima, direita.padStart(largura)];
  }
  return [...linhas, ultima + " ".repeat(largura - ultima.length - direita.length) + direita];
}

function valor(centavos: number): string {
  return formatarReais(centavos).replace("R$ ", "");
}

function dataHora(data: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(data)
    .replace(",", "");
}

export function montarCupom(pedido: PedidoParaCupom, opcoes: OpcoesCupom): ComandoCupom[] {
  const { colunas } = opcoes;
  const metade = Math.floor(colunas / 2); // fonte grande ocupa o dobro da largura
  const cmd: ComandoCupom[] = [];
  const texto = (t: string, extra: Partial<Extract<ComandoCupom, { tipo: "texto" }>> = {}) =>
    cmd.push({ tipo: "texto", texto: t, ...extra });
  const varias = (linhas: string[], extra: Partial<Extract<ComandoCupom, { tipo: "texto" }>> = {}) =>
    linhas.forEach((l) => texto(l, extra));

  if (opcoes.reimpressao) texto("*** REIMPRESSAO ***", { centro: true, negrito: true });
  varias(quebrar(opcoes.nomePizzaria.toUpperCase(), colunas), { centro: true, negrito: true });
  cmd.push({ tipo: "linha", caractere: "=" });

  texto(`PEDIDO #${pedido.numero}`, { centro: true, negrito: true, grande: true });
  varias(emColunas(dataHora(pedido.criadoEm, opcoes.fusoHorario), pedido.canal.toUpperCase(), colunas));
  texto(pedido.tipoEntrega === "entrega" ? "ENTREGA" : "RETIRADA NO BALCAO", {
    centro: true,
    negrito: true,
    grande: metade >= 16,
  });
  cmd.push({ tipo: "linha", caractere: "-" });

  varias(quebrar(`Cliente: ${pedido.clienteNome}`, colunas, "  "));
  if (pedido.clienteTelefone) texto(`Tel: ${formatarTelefone(pedido.clienteTelefone)}`);
  if (pedido.enderecoTexto) varias(quebrar(pedido.enderecoTexto, colunas), { negrito: true });
  cmd.push({ tipo: "linha", caractere: "-" });

  for (const item of pedido.itens) {
    // "Meio a meio A / B (Grande) + Borda X" -> sabores na 1ª linha, adicionais embaixo.
    const [principal = "", ...adicionais] = item.descricao.split(" + ");
    const titulo = `${item.quantidade}x ${principal}`;
    if (adicionais.length === 0) {
      varias(emColunas(titulo, valor(item.subtotalCentavos), colunas, "   "), { negrito: true });
    } else {
      varias(quebrar(titulo, colunas, "   "), { negrito: true });
      adicionais.forEach((adicional, i) => {
        const linha = `   + ${adicional}`;
        varias(
          i === adicionais.length - 1 ? emColunas(linha, valor(item.subtotalCentavos), colunas, "     ") : quebrar(linha, colunas, "     ")
        );
      });
    }
    if (item.observacao) varias(quebrar(`   OBS: ${item.observacao}`, colunas, "        "), { negrito: true });
  }
  cmd.push({ tipo: "linha", caractere: "-" });

  if (pedido.taxaEntregaCentavos > 0) {
    varias(emColunas("Subtotal", valor(pedido.subtotalCentavos), colunas));
    varias(emColunas("Taxa de entrega", valor(pedido.taxaEntregaCentavos), colunas));
  }
  varias(emColunas("TOTAL", formatarReais(pedido.totalCentavos), colunas), { negrito: true });
  cmd.push({ tipo: "linha", caractere: "-" });

  texto(`PAGAMENTO: ${PAGAMENTO[pedido.formaPagamento]}`, { negrito: true });
  if (pedido.formaPagamento === "dinheiro") {
    if (pedido.trocoParaCentavos !== null) {
      texto(`Troco para ${formatarReais(pedido.trocoParaCentavos)}`);
      texto(`LEVAR TROCO: ${formatarReais(pedido.trocoParaCentavos - pedido.totalCentavos)}`, { negrito: true });
    } else {
      texto("Sem troco");
    }
  }
  if (pedido.observacoes) {
    cmd.push({ tipo: "linha", caractere: "-" });
    varias(quebrar(`OBS DO PEDIDO: ${pedido.observacoes}`, colunas), { negrito: true });
  }
  if (pedido.tipoEntrega === "entrega" && opcoes.urlEntrega) {
    cmd.push({ tipo: "linha", caractere: "-" });
    texto("MOTOBOY: ESCANEIE", { centro: true, negrito: true });
    texto("para iniciar e confirmar a entrega", { centro: true });
    cmd.push({ tipo: "qr", conteudo: opcoes.urlEntrega });
  }
  cmd.push({ tipo: "linha", caractere: "=" });
  cmd.push({ tipo: "corte" });
  return cmd;
}

/** Visualização em texto puro (testes e modo de pré-visualização). */
export function cupomComoTexto(comandos: ComandoCupom[], colunas: number): string {
  return comandos
    .map((c) => {
      if (c.tipo === "linha") return c.caractere.repeat(colunas);
      if (c.tipo === "corte") return "";
      if (c.tipo === "qr") return `[QR ${c.conteudo}]`;
      if (!c.centro) return c.texto;
      const largura = c.grande ? Math.floor(colunas / 2) : colunas;
      return " ".repeat(Math.max(0, Math.floor((largura - c.texto.length) / 2))) + c.texto;
    })
    .join("\n");
}
