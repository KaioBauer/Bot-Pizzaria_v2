"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  definirAceitandoPedidos,
  definirEntregadorAtivo,
  salvarBairros,
  salvarConfiguracao,
  salvarConfiguracaoPedidoLink,
  salvarHorarios,
  salvarTamanhos,
} from "@pizzaria/db";
import { exigirAdmin } from "../../../../lib/auth";

export type Resultado = { ok: true } | { ok: false; erro: string };

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const configSchema = z.object({
  nomePizzaria: z.string().trim().min(2, "Informe o nome da pizzaria").max(60),
  telefone: opcional(20),
  endereco: opcional(200),
  whatsappNumero: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || (v.length >= 12 && v.length <= 13), "WhatsApp: use DDI + DDD + número, ex.: 5511987654321")
    .transform((v) => v || null),
  instagram: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ""))
    .transform((v) => v || null),
  fusoHorario: z.string().default("America/Sao_Paulo"),
  pedidoMinimoCentavos: z.number().int().min(0).max(100_000),
  aceitandoPedidos: z.boolean(),
  pixExpiracaoMinutos: z.number().int().min(5, "Pix: mínimo 5 minutos").max(1440),
});

const pedidoLinkSchema = z.object({
  pedidoLinkAtivo: z.boolean(),
  maxIngredientes: z
    .number({ message: "Informe o máximo de ingredientes" })
    .int("Máximo de ingredientes: número inteiro")
    .min(1, "Máximo de ingredientes: mínimo 1")
    .max(20, "Máximo de ingredientes: até 20"),
});

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (use HH:MM)");
const horariosSchema = z
  .array(z.object({ diaSemana: z.number().int().min(0).max(6), abre: hora, fecha: hora }))
  .max(28)
  .refine((ts) => ts.every((t) => t.abre !== t.fecha), "Abertura e fechamento não podem ser iguais");

const bairrosSchema = z
  .array(
    z.object({
      id: z.uuid().optional(),
      nome: z.string().trim().min(2, "Nome do bairro muito curto").max(60),
      taxaCentavos: z.number().int().min(0).max(100_000),
      ativo: z.boolean(),
    })
  )
  .refine(
    (bs) => new Set(bs.map((b) => b.nome.toLowerCase())).size === bs.length,
    "Há bairros com o mesmo nome"
  );

const tamanhosSchema = z.array(
  z.object({
    id: z.uuid(),
    fatias: z.number().int().min(1, "Fatias: mínimo 1").max(32),
    maxSabores: z.number().int().min(1, "Sabores: mínimo 1").max(6, "Sabores: máximo 6"),
    precoBaseCentavos: z.number().int().min(100, "Preço do tamanho inválido").max(100_000),
  })
);

async function executar<T>(schema: z.ZodType<T>, entrada: unknown, salvar: (dados: T) => Promise<void>): Promise<Resultado> {
  const dados = schema.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: dados.error.issues[0]?.message ?? "Dados inválidos" };
  try {
    await salvar(dados.data);
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro ao salvar" };
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/cardapio");
  revalidatePath("/pedir");
  return { ok: true };
}

export async function salvarConfiguracaoAction(entrada: z.input<typeof configSchema>) {
  const { supabase } = await exigirAdmin();
  return executar(configSchema, entrada, (d) => salvarConfiguracao(supabase, d));
}

export async function salvarPedidoLinkAction(entrada: z.input<typeof pedidoLinkSchema>) {
  const { supabase } = await exigirAdmin();
  return executar(pedidoLinkSchema, entrada, (d) => salvarConfiguracaoPedidoLink(supabase, d));
}

export async function salvarHorariosAction(entrada: z.input<typeof horariosSchema>) {
  const { supabase } = await exigirAdmin();
  return executar(horariosSchema, entrada, (d) => salvarHorarios(supabase, d));
}

export async function salvarBairrosAction(entrada: z.input<typeof bairrosSchema>) {
  const { supabase } = await exigirAdmin();
  return executar(bairrosSchema, entrada, (d) => salvarBairros(supabase, d));
}

export async function salvarTamanhosAction(entrada: z.input<typeof tamanhosSchema>) {
  const { supabase } = await exigirAdmin();
  return executar(tamanhosSchema, entrada, (d) => salvarTamanhos(supabase, d));
}

export async function alternarEntregadorAction(formData: FormData) {
  const { supabase } = await exigirAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await definirEntregadorAtivo(supabase, id.data, formData.get("ativo") === "true");
  revalidatePath("/admin/configuracoes");
}

/** "Pausar pedidos" / "Voltar a receber": chave rápida do topo do painel. */
export async function alternarLojaAction(formData: FormData) {
  const { supabase } = await exigirAdmin();
  await definirAceitandoPedidos(supabase, formData.get("aceitando") === "true");
  revalidatePath("/admin", "layout");
  revalidatePath("/cardapio");
}
