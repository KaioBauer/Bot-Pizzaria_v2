import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin, QrCode } from "lucide-react";
import { exigirEntregador } from "../../lib/auth";
import { TopoEntrega } from "./topo";

export const metadata: Metadata = { title: "Entregas" };
export const dynamic = "force-dynamic";

export default async function EntregasPage() {
  const { supabase, usuarioId } = await exigirEntregador("/entrega");
  const [{ data: entregas }, { data: eu }] = await Promise.all([
    supabase.rpc("minhas_entregas"),
    supabase.from("entregadores").select("nome").eq("user_id", usuarioId).maybeSingle(),
  ]);

  return (
    <div className="min-h-dvh bg-creme-50">
      <TopoEntrega nome={eu?.nome ?? null} />
      <main className="mx-auto max-w-lg space-y-6 p-4">
        <div className="flex items-start gap-4 rounded-3xl bg-stone-950 p-5 text-white">
          <QrCode className="size-10 shrink-0 text-marca-300" />
          <div>
            <p className="font-display text-xl font-semibold">Escaneie o QR do cupom</p>
            <p className="mt-1 text-sm text-stone-300">Abra a câmera do celular e aponte para o QR Code impresso no pedido. A entrega abre aqui.</p>
          </div>
        </div>

        <section>
          <h2 className="mb-3 font-semibold text-stone-700">Em rota com você</h2>
          {!entregas?.length ? (
            <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-500 ring-1 ring-stone-900/5">Nenhuma entrega em andamento.</p>
          ) : (
            <ul className="space-y-2">
              {entregas.map((e) => (
                <li key={e.id}>
                  <Link href={`/entrega/${e.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-suave ring-1 ring-stone-900/5">
                    <span className="font-display text-2xl font-semibold text-marca-700">#{e.numero}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{e.cliente_nome}</span>
                      <span className="flex items-center gap-1 truncate text-sm text-stone-500">
                        <MapPin className="size-3.5 shrink-0" /> {e.endereco_texto}
                      </span>
                    </span>
                    <ChevronRight className="size-5 text-stone-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
