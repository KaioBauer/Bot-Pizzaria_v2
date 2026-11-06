import type { Metadata } from "next";
import { listarFilaImpressao, listarImpressosRecentes } from "@pizzaria/db";
import { exigirAdmin } from "../../../../lib/auth";
import { FilaImpressao } from "./fila";

export const metadata: Metadata = { title: "Impressão" };
export const dynamic = "force-dynamic";

const JANELA_RECENTES_MS = 12 * 60 * 60 * 1000;

export default async function ImpressaoPage() {
  const { supabase } = await exigirAdmin();
  const [fila, recentes] = await Promise.all([
    listarFilaImpressao(supabase),
    listarImpressosRecentes(supabase, new Date(Date.now() - JANELA_RECENTES_MS)),
  ]);
  return <FilaImpressao inicial={{ fila, recentes }} />;
}
