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
