"use server";

import { revalidatePath } from "next/cache";
import { exigirAdmin } from "../../../../lib/auth";

/**
 * Usuários e acessos: o painel não tem a service_role. As actions repassam ao
 * bot (rotas /admin/usuarios) o token do admin logado; o bot confere o papel e
 * cria/atualiza no Supabase Auth.
 */

export type PapelUsuario = "admin" | "entregador" | "impressora";

export interface UsuarioPainel {
  id: string;
  email: string;
  papel: PapelUsuario | null;
  nome: string | null;
  telefone: string | null;
  ativo: boolean;
  criadoEm: string;
  ultimoAcesso: string | null;
}

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
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, erro: `Não consegui falar com o bot (${URL_BOT}). Confira se ele está rodando.` };
  }
  const json = (await resposta.json().catch(() => null)) as (T & { erro?: string }) | null;
  if (!resposta.ok || !json) return { ok: false, erro: json?.erro ?? `O bot respondeu HTTP ${resposta.status}.` };
  return { ok: true, dados: json };
}

export async function listarUsuariosAction(): Promise<Resposta<UsuarioPainel[]>> {
  const r = await chamarBot<{ usuarios: UsuarioPainel[] }>("/admin/usuarios");
  return r.ok ? { ok: true, dados: r.dados.usuarios } : r;
}

export async function criarUsuarioAction(entrada: {
  nome: string;
  email: string;
  papel: "admin" | "entregador";
  telefone?: string;
  senha?: string;
}): Promise<Resposta<{ id: string; senha: string }>> {
  const r = await chamarBot<{ id: string; senha: string }>("/admin/usuarios", entrada);
  if (r.ok) revalidatePath("/admin/configuracoes");
  return r;
}

export async function trocarSenhaUsuarioAction(id: string, senha?: string): Promise<Resposta<{ senha: string }>> {
  return chamarBot<{ senha: string }>(`/admin/usuarios/${encodeURIComponent(id)}/senha`, { senha: senha ?? "" });
}

export async function definirAcessoUsuarioAction(id: string, ativo: boolean): Promise<Resposta<{ ok: true }>> {
  const r = await chamarBot<{ ok: true }>(`/admin/usuarios/${encodeURIComponent(id)}/ativo`, { ativo });
  if (r.ok) revalidatePath("/admin/configuracoes");
  return r;
}
