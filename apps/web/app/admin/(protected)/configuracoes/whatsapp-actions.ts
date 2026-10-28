"use server";

import { exigirAdmin } from "../../../../lib/auth";

/**
 * Conexão do WhatsApp: o painel não fala com a Evolution API. As actions
 * repassam ao bot (rotas /admin/whatsapp) o token de sessão do admin logado;
 * o bot confere o papel e guarda a chave da Evolution.
 */

export type EstadoWhatsapp = "conectado" | "conectando" | "desconectado" | "sem_instancia" | "desligado";

export interface SituacaoWhatsapp {
  habilitado: boolean;
  estado: EstadoWhatsapp;
  numero: string | null;
  nomePerfil: string | null;
  qrCode?: string | null;
  codigoPareamento?: string | null;
}

export type RespostaWhatsapp = { ok: true; situacao: SituacaoWhatsapp } | { ok: false; erro: string };

const URL_BOT = (process.env.BOT_URL || "http://localhost:3001").replace(/\/+$/, "");

async function chamarBot(caminho: string, corpo?: unknown): Promise<RespostaWhatsapp> {
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
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return { ok: false, erro: `Não consegui falar com o bot (${URL_BOT}). Confira se ele está rodando.` };
  }
  const json = (await resposta.json().catch(() => null)) as (SituacaoWhatsapp & { erro?: string }) | null;
  if (!resposta.ok || !json) return { ok: false, erro: json?.erro ?? `O bot respondeu HTTP ${resposta.status}.` };
  return { ok: true, situacao: json };
}

export async function situacaoWhatsappAction(): Promise<RespostaWhatsapp> {
  return chamarBot("/admin/whatsapp");
}

/** `numero` (opcional): gera também o código para "Conectar com número de telefone". */
export async function conectarWhatsappAction(numero?: string): Promise<RespostaWhatsapp> {
  return chamarBot("/admin/whatsapp/conectar", { numero: numero ?? "" });
}

export async function desconectarWhatsappAction(): Promise<RespostaWhatsapp> {
  return chamarBot("/admin/whatsapp/desconectar", {});
}
