"use server";

import type { CobrancaParaPagar, Comprovante } from "@pizzaria/core";
import type { CobrancaSimulada } from "@pizzaria/shared";
import { exigirAdmin } from "../../../../lib/auth";

/**
 * Banco simulado: o painel não acessa a tabela do Pix simulado. As actions
 * repassam ao bot (rotas /admin/pix-simulado) o token de sessão do admin
 * logado; o bot confere o papel, lê o copia e cola e paga.
 */

export type Extrato = { habilitado: boolean; cobrancas: CobrancaSimulada[] };
export type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string };

const URL_BOT = (process.env.BOT_URL || "http://localhost:3001").replace(/\/+$/, "");

async function chamarBot<T>(caminho: string, corpo?: unknown): Promise<Resposta<T>> {
  const { supabase } = await exigirAdmin();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, erro: "Sessão expirada: entre de novo no painel." };

  let resposta: Response;
  try {
    resposta = await fetch(`${URL_BOT}${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, erro: `Não consegui falar com o bot (${URL_BOT}). Confira se ele está rodando.` };
  }
  const json = (await resposta.json().catch(() => null)) as (T & { erro?: string }) | null;
  if (!resposta.ok || !json) return { ok: false, erro: json?.erro ?? `O bot respondeu HTTP ${resposta.status}.` };
  return { ok: true, dados: json };
}

export async function extratoAction(): Promise<Resposta<Extrato>> {
  return chamarBot<Extrato>("/admin/pix-simulado");
}

/** O bot já devolve `{ ok, dados | erro }`: aqui só junta com as falhas de comunicação. */
async function operacao<T>(caminho: string, corpo: unknown): Promise<Resposta<T>> {
  const r = await chamarBot<Resposta<T>>(caminho, corpo);
  return r.ok ? r.dados : r;
}

export async function lerCodigoAction(codigo: string): Promise<Resposta<CobrancaParaPagar>> {
  return operacao("/admin/pix-simulado/ler", { codigo });
}

export async function pagarAction(codigo: string, pagador: string): Promise<Resposta<Comprovante>> {
  return operacao("/admin/pix-simulado/pagar", { codigo, pagador });
}
