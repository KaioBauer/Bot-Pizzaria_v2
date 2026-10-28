"use server";

import { headers } from "next/headers";
import { clientePublico } from "../../lib/supabase/publico";

/**
 * O pedido por link é gravado pelo bot (único com service_role, Pix e
 * notificações). Estas actions repassam o formulário pela rede interna
 * (BOT_URL; a rota não é exposta no Nginx) junto com o IP do cliente.
 */

const URL_BOT = (process.env.BOT_URL || "http://localhost:3001").replace(/\/+$/, "");

export type ResultadoFinalizar = { ok: true; numero: number; token: string; totalCentavos: number } | { ok: false; erros: string[] };

async function ipDoCliente(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

export async function finalizarPedidoAction(pedido: unknown): Promise<ResultadoFinalizar> {
  try {
    const resposta = await fetch(`${URL_BOT}/pedido-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cliente-ip": await ipDoCliente() },
      body: JSON.stringify(pedido),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await resposta.json().catch(() => null)) as ResultadoFinalizar | null;
    if (!json) return { ok: false, erros: [`Não consegui registrar agora (HTTP ${resposta.status}). Tente de novo.`] };
    return json;
  } catch {
    return { ok: false, erros: ["Não consegui falar com a pizzaria agora. Confira sua internet e tente de novo — seu pedido não será duplicado."] };
  }
}

/** O que o /pedir precisa do bot: se há Pix online. Bot fora do ar = sem Pix. */
export async function configBot(): Promise<{ pix: boolean }> {
  try {
    const resposta = await fetch(`${URL_BOT}/pedido-link/config`, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
    if (!resposta.ok) return { pix: false };
    return { pix: Boolean(((await resposta.json()) as { pix?: boolean }).pix) };
  } catch {
    return { pix: false };
  }
}

export interface Acompanhamento {
  numero: number;
  status: string;
  tipo_entrega: "entrega" | "retirada";
  forma_pagamento: "pix" | "dinheiro" | "cartao";
  subtotal: number;
  taxa_entrega: number;
  valor_total: number;
  motivo_cancelamento: string | null;
  criado_em: string;
  itens: { quantidade: number; descricao: string; subtotal: number }[];
  pix: { copia_e_cola: string | null; qr_base64: string | null; expira_em: string; status: string } | null;
}

/** Status do pedido pelo token do link (função pública acompanhar_pedido). */
export async function acompanharAction(token: string): Promise<Acompanhamento | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data, error } = await clientePublico().rpc("acompanhar_pedido", { p_token: token });
  if (error) throw new Error("Não consegui consultar o pedido agora.");
  return (data as unknown as Acompanhamento | null) ?? null;
}
