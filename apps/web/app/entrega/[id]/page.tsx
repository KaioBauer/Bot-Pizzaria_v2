import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { exigirEntregador } from "../../../lib/auth";
import { TopoEntrega } from "../topo";
import { TelaEntrega, type DetalheEntrega } from "./tela";

export const metadata: Metadata = { title: "Entrega" };
export const dynamic = "force-dynamic";

export default async function EntregaPage({ params }: PageProps<"/entrega/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, usuarioId, papel } = await exigirEntregador(`/entrega/${id}`);
  const [{ data, error }, { data: eu }] = await Promise.all([
    supabase.rpc("entrega_detalhe", { p_pedido: id }),
    supabase.from("entregadores").select("nome").eq("user_id", usuarioId).maybeSingle(),
  ]);

  return (
    <div className="min-h-dvh bg-creme-50">
      <TopoEntrega nome={eu?.nome ?? (papel === "admin" ? "Administrador" : null)} />
      {error || !data ? (
        <main className="mx-auto max-w-lg p-6 text-center">
          <p className="font-display text-2xl font-semibold">Pedido não encontrado</p>
          <p className="mt-2 text-sm text-stone-500">{error?.message.replace(/^.*?: /, "") ?? "Confira se o QR é deste pedido."}</p>
        </main>
      ) : (
        <TelaEntrega detalhe={data as unknown as DetalheEntrega} usuarioId={usuarioId} admin={papel === "admin"} />
      )}
    </div>
  );
}
