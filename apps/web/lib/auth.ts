import "server-only";
import { redirect } from "next/navigation";
import { criarClienteSessao } from "./supabase/server";

/** Papel vem de app_metadata, que só a service_role altera (ver migration do painel). */
export function papelDasClaims(claims: Record<string, unknown> | undefined): string | null {
  const meta = claims?.app_metadata as { papel?: unknown } | undefined;
  return typeof meta?.papel === "string" ? meta.papel : null;
}

/**
 * Exige usuário logado com papel "admin". Toda página e server action do
 * painel chama isto — o proxy só redireciona a navegação, não protege
 * server actions chamadas diretamente.
 */
export async function exigirAdmin() {
  const supabase = await criarClienteSessao();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims || papelDasClaims(data.claims) !== "admin") redirect("/admin/login");
  return { supabase, usuarioId: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
}

/** Compatibilidade com as telas antigas do cardápio (reescritas na Fase 4). */
export const requireAdminSession = exigirAdmin;
