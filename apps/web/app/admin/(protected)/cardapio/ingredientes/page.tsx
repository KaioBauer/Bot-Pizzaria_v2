import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listarCamadasBorda, listarIngredientesAdmin, listarTamanhos } from "@pizzaria/db";
import { CabecalhoPagina } from "../../../../../components/ui";
import { exigirAdmin } from "../../../../../lib/auth";
import { ListaCamadasBorda, ListaIngredientes } from "./editor";

export const metadata: Metadata = { title: "Ingredientes e camadas" };
export const dynamic = "force-dynamic";

export default async function IngredientesPage() {
  const { supabase } = await exigirAdmin();
  const [ingredientes, tamanhos, bordas] = await Promise.all([
    listarIngredientesAdmin(supabase),
    listarTamanhos(supabase),
    listarCamadasBorda(supabase),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div>
        <Link href="/admin/cardapio" className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900">
          <ChevronLeft className="size-4" /> Cardápio
        </Link>
        <div className="mt-2">
          <CabecalhoPagina
            titulo="Ingredientes e camadas"
            descricao="Montagem visual do pedido pelo link: ingredientes extras (e do “Monte a sua”), com preço por tamanho, e as imagens que desenham a pizza."
          />
        </div>
      </div>
      <ListaIngredientes inicial={ingredientes} tamanhos={tamanhos.map((t) => ({ id: t.id, nome: t.nome }))} />
      <ListaCamadasBorda bordas={bordas} />
    </main>
  );
}
