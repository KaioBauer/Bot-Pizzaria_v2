/**
 * Dinheiro trafega pelo domínio sempre como centavos inteiros, para evitar
 * erro de ponto flutuante em somas (0.1 + 0.2). A conversão para/de reais
 * acontece só nas bordas: banco (numeric) e LLM/cliente (texto).
 */

export function paraCentavos(reais: number | string): number {
  return Math.round(Number(reais) * 100);
}

export function paraReais(centavos: number): number {
  return centavos / 100;
}

const formatador = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** 3550 -> "R$ 35,50" (com espaço comum, para não quebrar em chats). */
export function formatarReais(centavos: number): string {
  return formatador.format(centavos / 100).replace(/\u00a0/g, " ");
}

/** "11987654321" -> "(11) 98765-4321"; devolve o original se não reconhecer. */
export function formatarTelefone(telefone: string): string {
  const d = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

/**
 * Lê um valor digitado (pt-BR) em centavos: "35", "35,9", "R$ 1.234,56",
 * "35.90". Devolve null se não for um valor válido não negativo.
 */
export function lerReais(texto: string): number | null {
  let t = texto.replace(/R\$|\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return paraCentavos(t);
}

/** 3550 -> "35,50" (para preencher campos de formulário). */
export function centavosParaCampo(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
