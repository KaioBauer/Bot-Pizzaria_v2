"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirEntregador, papelDasClaims } from "../../lib/auth";
import { criarClienteSessao } from "../../lib/supabase/server";

export type Resultado = { ok: true } | { ok: false; erro: string };

/** Mensagem do RAISE EXCEPTION das funções de entrega, sem prefixo técnico. */
const mensagem = (erro: { message: string }) => erro.message.replace(/^.*?: /, "") || "Não foi possível concluir";

/** Só caminhos internos de /entrega (nada de redirecionar para fora). */
const destinoSeguro = (proximo: unknown) =>
  typeof proximo === "string" && /^\/entrega(\/[0-9a-f-]{36})?$/.test(proximo) ? proximo : "/entrega";

export interface EstadoLogin {
  erro: string | null;
}

export async function entrarEntregadorAction(_anterior: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const supabase = await criarClienteSessao();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) return { erro: "E-mail ou senha incorretos." };

  const { data: claims } = await supabase.auth.getClaims();
  const papel = papelDasClaims(claims?.claims);
  if (papel !== "entregador" && papel !== "admin") {
    await supabase.auth.signOut();
    return { erro: "Este usuário não é entregador." };
  }
  redirect(destinoSeguro(formData.get("proximo")));
}

export async function sairEntregadorAction() {
  const supabase = await criarClienteSessao();
  await supabase.auth.signOut();
  redirect("/entrega/login");
}

export async function iniciarEntregaAction(pedidoId: string): Promise<Resultado> {
  const id = z.uuid().safeParse(pedidoId);
  if (!id.success) return { ok: false, erro: "Pedido inválido" };
  const { supabase } = await exigirEntregador(`/entrega/${id.data}`);
  const { error } = await supabase.rpc("iniciar_entrega", { p_pedido: id.data });
  if (error) return { ok: false, erro: mensagem(error) };
  revalidatePath(`/entrega/${id.data}`);
  revalidatePath("/entrega");
  return { ok: true };
}

const conclusaoSchema = z.object({
  pedidoId: z.uuid(),
  foto: z.string().min(10).max(300),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  precisaoM: z.number().min(0).max(100_000).nullable(),
  valorRecebidoCentavos: z.number().int().min(0).max(10_000_000).nullable(),
});

export async function concluirEntregaAction(entrada: z.input<typeof conclusaoSchema>): Promise<Resultado> {
  const dados = conclusaoSchema.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Dados da entrega inválidos" };
  const d = dados.data;
  const { supabase } = await exigirEntregador(`/entrega/${d.pedidoId}`);
  const { error } = await supabase.rpc("concluir_entrega", {
    p_pedido: d.pedidoId,
    p_foto: d.foto,
    ...(d.lat !== null && d.lng !== null ? { p_lat: d.lat, p_lng: d.lng } : {}),
    ...(d.precisaoM !== null ? { p_precisao_m: d.precisaoM } : {}),
    ...(d.valorRecebidoCentavos !== null ? { p_valor_recebido: d.valorRecebidoCentavos / 100 } : {}),
  });
  if (error) return { ok: false, erro: mensagem(error) };
  revalidatePath(`/entrega/${d.pedidoId}`);
  revalidatePath("/entrega");
  return { ok: true };
}
