import type { Metadata } from "next";
import { listarAtendimentos } from "@pizzaria/db";
import { exigirAdmin } from "../../../../lib/auth";
import { Caixa } from "./caixa";

export const metadata: Metadata = { title: "Conversas" };
export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  const { supabase } = await exigirAdmin();
  const atendimentos = await listarAtendimentos(supabase);
  return <Caixa inicial={atendimentos} />;
}
