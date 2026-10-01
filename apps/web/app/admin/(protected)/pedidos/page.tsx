import type { Metadata } from "next";
import { listarPedidosPainel } from "@pizzaria/db";
import { exigirAdmin } from "../../../../lib/auth";
import { JANELA_FINALIZADOS_MS } from "./constantes";
import { QuadroPedidos } from "./quadro";

export const metadata: Metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const { supabase } = await exigirAdmin();
  const pedidos = await listarPedidosPainel(supabase, new Date(Date.now() - JANELA_FINALIZADOS_MS));
  return <QuadroPedidos inicial={pedidos} />;
}
