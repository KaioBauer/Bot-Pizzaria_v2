"use server";

import { redirect } from "next/navigation";
import { papelDasClaims } from "../../../lib/auth";
import { criarClienteSessao } from "../../../lib/supabase/server";

export interface EstadoLogin {
  erro: string | null;
}

export async function entrarAction(_anterior: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const supabase = await criarClienteSessao();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) return { erro: "E-mail ou senha incorretos." };

  const { data: claims } = await supabase.auth.getClaims();
  if (papelDasClaims(claims?.claims) !== "admin") {
    await supabase.auth.signOut();
    return { erro: "Este usuário não tem acesso ao painel." };
  }

  redirect("/admin/pedidos");
}

export async function sairAction() {
  const supabase = await criarClienteSessao();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
