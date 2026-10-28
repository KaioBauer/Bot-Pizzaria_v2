import {
  calcularPedidoArgsSchema,
  type CalcularPedidoArgs,
  type CategoriaCardapio,
  type ClienteConhecido,
  type ConfiguracaoLoja,
  type MensagemConversa,
  type PedidoConfirmadoArgs,
} from "@pizzaria/shared";

/**
 * Travas determinísticas contra alucinação. O prompt pede, o código confere:
 * - a resposta ao cliente só cita valores, links e telefones que vieram de
 *   uma fonte oficial (cardápio, configuração, ferramentas ou o próprio cliente);
 * - finalizar_pedido registra exatamente o último resumo (calcular_pedido)
 *   que o cliente viu e respondeu (os itens nem passam pelo modelo de novo);
 * - nome, telefone, endereço e troco precisam ter sido ditos pelo cliente
 *   (ou estar no cadastro), nunca deduzidos pelo modelo.
 */

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const soDigitos = (texto: string) => texto.replace(/\D/g, "");

// Valores em dinheiro -------------------------------------------------------------

function paraCentavosTexto(numero: string): number | null {
  // "1.234,56" / "35,9" / "35" / "35.00"
  let limpo = numero.trim();
  if (/,\d{1,2}$/.test(limpo)) limpo = limpo.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}$/.test(limpo)) limpo = limpo.replace(/\./g, "");
  const valor = Number(limpo);
  return Number.isFinite(valor) ? Math.round(valor * 100) : null;
}

/** Valores monetários citados num texto ("R$ 35,00", "R$35", "40 reais"), em centavos. */
export function valoresCitados(texto: string): number[] {
  const valores: number[] = [];
  const padroes = [/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi, /(\d+(?:[.,]\d{1,2})?)\s*reais\b/gi];
  for (const padrao of padroes) {
    for (const m of texto.matchAll(padrao)) {
      const v = paraCentavosTexto(m[1]!);
      if (v !== null) valores.push(v);
    }
  }
  return valores;
}

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  dez: 10, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300, quinhentos: 500, mil: 1000,
};

/** Números que o cliente escreveu (ou falou, no áudio transcrito), como valores em reais. */
function numerosDoCliente(texto: string): number[] {
  const numeros = [...texto.matchAll(/\d+(?:[.,]\d{1,2})?/g)].flatMap((m) => paraCentavosTexto(m[0]) ?? []);
  for (const palavra of normalizarTexto(texto).split(/[^a-z]+/)) {
    const n = NUMEROS_POR_EXTENSO[palavra];
    if (n) numeros.push(n * 100);
  }
  return numeros;
}

export interface FontesOficiais {
  categorias: CategoriaCardapio[];
  config: ConfiguracaoLoja;
  /** Histórico + mensagens desta rodada (resultados de ferramentas e falas do cliente). */
  mensagens: MensagemConversa[];
  urlCardapio: string | null;
  /** Link do pedido pelo link (/pedir), quando ligado. */
  urlPedir?: string | null;
  telefoneCanal: string | null;
  cliente: ClienteConhecido | null;
}

const textosDoCliente = (mensagens: MensagemConversa[]) => mensagens.flatMap((m) => (m.papel === "user" ? [m.conteudo] : []));

function valoresConhecidos(f: FontesOficiais): Set<number> {
  const conhecidos = new Set<number>([0]);
  const base = new Map(f.config.tamanhos.map((t) => [normalizarTexto(t.nome.trim()), t.precoBaseCentavos]));
  for (const t of f.config.tamanhos) conhecidos.add(t.precoBaseCentavos);
  for (const b of f.config.bairros) conhecidos.add(b.taxaCentavos);
  conhecidos.add(f.config.pedidoMinimoCentavos);
  for (const categoria of f.categorias) {
    for (const produto of categoria.produtos) {
      for (const v of produto.variacoes) {
        conhecidos.add(v.precoCentavos);
        // Adicional de sabor especial ("+ R$ 15 na Grande") = preço do tamanho - base.
        const precoBase = v.tipo === "tamanho" ? base.get(normalizarTexto(v.nome.trim())) : undefined;
        if (precoBase !== undefined) conhecidos.add(Math.max(0, v.precoCentavos - precoBase));
      }
    }
  }
  for (const m of f.mensagens) {
    if (m.papel === "tool" || (m.papel === "assistant" && m.autor === "atendente" && m.conteudo)) {
      for (const v of valoresCitados(m.conteudo ?? "")) conhecidos.add(v);
    } else if (m.papel === "user") {
      for (const v of [...valoresCitados(m.conteudo), ...numerosDoCliente(m.conteudo)]) conhecidos.add(v);
    }
  }
  return conhecidos;
}

// Links e telefones ---------------------------------------------------------------

const PADRAO_LINK = /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|app|io|me)(?:\.br)?\b(?:\/[^\s<>()]*)?/gi;

export function linksCitados(texto: string): string[] {
  return [...texto.matchAll(PADRAO_LINK)].map((m) => m[0].replace(/[.,!?;:]+$/, ""));
}

const PADRAO_TELEFONE = /(?:\+?\s?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\s?\d{4}[\s.-]?\d{4}\b/g;

export function telefonesCitados(texto: string): string[] {
  return [...texto.matchAll(PADRAO_TELEFONE)].map((m) => soDigitos(m[0])).filter((d) => d.length >= 10 && d.length <= 13);
}

const final8 = (digitos: string) => digitos.slice(-8);

function telefoneConhecido(digitos: string, f: Pick<FontesOficiais, "config" | "telefoneCanal" | "cliente" | "mensagens">): boolean {
  const alvo = final8(digitos);
  const oficiais = [f.config.telefone, f.config.whatsappNumero, f.telefoneCanal, f.cliente?.telefone].flatMap((t) => (t ? [soDigitos(t)] : []));
  if (oficiais.some((t) => t.length >= 8 && final8(t) === alvo)) return true;
  return textosDoCliente(f.mensagens).some((t) => soDigitos(t).includes(alvo));
}

// Verificação da resposta ---------------------------------------------------------

export type ProblemaResposta =
  | { tipo: "valor"; valores: number[] }
  | { tipo: "link"; links: string[] }
  | { tipo: "telefone"; telefones: string[] };

/** Confere o texto que vai para o cliente contra as fontes oficiais. */
export function verificarResposta(texto: string, fontes: FontesOficiais): ProblemaResposta[] {
  const problemas: ProblemaResposta[] = [];

  const conhecidos = valoresConhecidos(fontes);
  const valores = [...new Set(valoresCitados(texto).filter((v) => !conhecidos.has(v)))];
  if (valores.length) problemas.push({ tipo: "valor", valores });

  const semProtocolo = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const permitidos = [fontes.urlCardapio, fontes.urlPedir].flatMap((u) => (u ? [semProtocolo(u)] : []));
  const links = linksCitados(texto).filter((l) => !permitidos.some((p) => semProtocolo(l).startsWith(p)));
  if (links.length) problemas.push({ tipo: "link", links });

  const telefones = telefonesCitados(texto).filter((t) => !telefoneConhecido(t, fontes));
  if (telefones.length) problemas.push({ tipo: "telefone", telefones });

  return problemas;
}

/** Remove links e telefones não autorizados (último recurso, se o modelo insistir). */
export function removerNaoAutorizados(texto: string, problemas: ProblemaResposta[]): string {
  let limpo = texto;
  for (const p of problemas) {
    if (p.tipo === "link") for (const l of p.links) limpo = limpo.split(l).join("");
  }
  if (problemas.some((p) => p.tipo === "telefone")) {
    const proibidos = new Set(problemas.flatMap((p) => (p.tipo === "telefone" ? p.telefones : [])));
    limpo = limpo.replace(PADRAO_TELEFONE, (m) => (proibidos.has(soDigitos(m)) ? "" : m));
  }
  return limpo.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/gm, "").trim();
}

// Resumo confirmado pelo cliente --------------------------------------------------

export interface UltimaCotacao {
  args: CalcularPedidoArgs;
  /** Descrição de cada item, na ordem de `args.itens` (do resultado da ferramenta). */
  descricoes: string[];
  /** Mensagens anteriores ao resumo: de onde podem vir os dados do pedido. */
  antes: MensagemConversa[];
  /** O que o cliente escreveu depois de ver o resumo. */
  respostas: string[];
}

/** Último calcular_pedido bem-sucedido da conversa e o que o cliente respondeu depois dele. */
export function ultimaCotacao(mensagens: MensagemConversa[]): UltimaCotacao | null {
  const chamadas = new Map<string, string>();
  let ultima: UltimaCotacao | null = null;
  mensagens.forEach((m, indice) => {
    if (m.papel === "assistant") {
      for (const c of m.toolCalls ?? []) if (c.nome === "calcular_pedido") chamadas.set(c.id, c.argumentos);
    } else if (m.papel === "tool") {
      const argumentos = chamadas.get(m.toolCallId);
      if (argumentos === undefined) return;
      try {
        const resultado = JSON.parse(m.conteudo) as { sucesso?: unknown; itens?: Array<{ descricao?: string; quantidade?: number }> };
        if (resultado.sucesso !== true) return;
        const args = calcularPedidoArgsSchema.safeParse(JSON.parse(argumentos || "{}"));
        if (!args.success) return;
        const descricoes = args.data.itens.map((item, i) => {
          const r = resultado.itens?.[i];
          return r?.descricao ? `${r.quantidade ?? item.quantidade}x ${r.descricao}` : `${item.quantidade}x item ${i + 1}`;
        });
        ultima = { args: args.data, descricoes, antes: mensagens.slice(0, indice), respostas: [] };
      } catch {
        // resultado ou argumentos ilegíveis: não conta como resumo
      }
    } else if (ultima) {
      ultima.respostas.push(m.conteudo);
    }
  });
  return ultima;
}

const AFIRMACAO =
  /(^|[^a-z])(sim|s|ss|ok|okay|pode|podes|confirm[a-z]*|fech[a-z]*|isso|beleza|blz|certo|certinho|perfeito|manda|mande|bora|claro|positivo|exato|correto|show|top|ta bom|ta otimo|ta certo|de acordo|uhum|aham|yes|combinado|pode ser|vamos)([^a-z]|$)/;
const NEGACAO_NO_INICIO = /^(nao|n|espera|pera|perai|calma|aguarda|ainda nao)([^a-z]|$)/;

/**
 * A última mensagem do cliente depois do resumo confirma o pedido? ("sim",
 * "pode fechar", 👍). Pergunta, acréscimo ou "não" não confirmam.
 */
export function confirmaResumo(respostas: string[]): boolean {
  const ultima = respostas.at(-1);
  if (!ultima) return false;
  if (/[👍✅👌🙏]/u.test(ultima)) return true;
  const texto = normalizarTexto(ultima).replace(/^\[audio transcrito\]\s*/, "").trim();
  if (texto.includes("?") || NEGACAO_NO_INICIO.test(texto)) return false;
  return AFIRMACAO.test(texto);
}

const chaveSabores = (item: CalcularPedidoArgs["itens"][number]) =>
  JSON.stringify([item.sabores.map((s) => `${s.produto_id}:${s.variacao_id}`).sort(), [...item.adicionais].sort()]);

/** Itens da cotação anterior que sumiram nesta (o modelo costuma esquecer o que veio antes). */
export function itensQueSairam(anterior: UltimaCotacao | null, itens: CalcularPedidoArgs["itens"]): string[] {
  if (!anterior) return [];
  const atuais = new Set(itens.map(chaveSabores));
  return anterior.args.itens.flatMap((item, i) => (atuais.has(chaveSabores(item)) ? [] : [anterior.descricoes[i]!]));
}

// Dados do cliente ------------------------------------------------------------------

/**
 * Nome, telefone, endereço e troco do finalizar_pedido precisam ter origem: o
 * cliente escreveu, o canal informou ou está no cadastro. Devolve os problemas.
 */
export function conferirDadosCliente(
  args: PedidoConfirmadoArgs,
  f: Pick<FontesOficiais, "config" | "telefoneCanal" | "cliente" | "mensagens"> & { nomePerfil: string | null }
): string[] {
  const falas = textosDoCliente(f.mensagens);
  const falasNormalizadas = normalizarTexto(falas.join("\n"));
  const contemPalavra = (palavra: string) => new RegExp(`(^|[^a-z0-9])${palavra}($|[^a-z0-9])`).test(falasNormalizadas);
  const problemas: string[] = [];

  const primeiroNome = normalizarTexto(args.cliente_nome.trim().split(/\s+/)[0] ?? "").replace(/[^a-z0-9]/g, "");
  const nomesConhecidos = [f.nomePerfil, f.cliente?.nome].flatMap((n) => (n ? [normalizarTexto(n)] : []));
  if (primeiroNome && !contemPalavra(primeiroNome) && !nomesConhecidos.some((n) => n.includes(primeiroNome))) {
    problemas.push("cliente_nome: o cliente não informou esse nome. Pergunte o nome a ele; não deduza.");
  }

  if (!telefoneConhecido(args.cliente_telefone, f)) {
    problemas.push("cliente_telefone: esse telefone não foi informado pelo cliente. Peça o telefone com DDD; não invente.");
  }

  const endereco = args.tipo_entrega === "entrega" ? args.endereco : null;
  const salvo = f.cliente?.ultimoEndereco ?? null;
  if (endereco) {
    const numero = soDigitos(endereco.numero);
    const numeroSalvo = soDigitos(salvo?.numero ?? "");
    if (numero && numero !== numeroSalvo && !falas.some((t) => new RegExp(`(^|\\D)${numero}(\\D|$)`).test(t))) {
      problemas.push("endereco.numero: o cliente não informou esse número. Pergunte o número da casa; não invente.");
    }
    const palavrasRua = normalizarTexto(endereco.rua).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !["rua", "avenida", "travessa", "alameda", "estrada", "rodovia"].includes(p));
    const ruaSalva = normalizarTexto(salvo?.rua ?? "");
    if (palavrasRua.length && !palavrasRua.some((p) => contemPalavra(p) || ruaSalva.includes(p))) {
      problemas.push("endereco.rua: o cliente não informou essa rua. Pergunte o endereço; não invente.");
    }
  }

  const PAGAMENTO: Record<string, RegExp> = {
    pix: /\bpix\b/,
    dinheiro: /\b(dinheiro|especie|cash|troco|notas?)\b/,
    cartao: /\b(cartao|credito|debito|maquininha|maquina)\b/,
  };
  if (!PAGAMENTO[args.forma_pagamento]?.test(falasNormalizadas)) {
    problemas.push("forma_pagamento: o cliente não escolheu essa forma de pagamento. Pergunte como ele vai pagar (só as formas disponíveis).");
  }

  if (args.troco_para != null) {
    const troco = Math.round(args.troco_para * 100);
    if (!falas.some((t) => numerosDoCliente(t).includes(troco) || valoresCitados(t).includes(troco))) {
      problemas.push("troco_para: o cliente não disse esse valor. Pergunte se precisa de troco e para quanto.");
    }
  }
  return problemas;
}
