import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listarCardapioAdmin } from "@pizzaria/db";
import { exigirAdmin } from "../../../../../../lib/auth";
import { EditorProduto } from "./editor";

export const metadata: Metadata = { title: "Produto" };
export const dynamic = "force-dynamic";

export default async function ProdutoPage({ params, searchParams }: PageProps<"/admin/cardapio/produto/[id]">) {
  const { supabase } = await exigirAdmin();
  const { id } = await params;
  const { categoria } = await searchParams;
  const categorias = await listarCardapioAdmin(supabase);
  const produto = id === "novo" ? null : categorias.flatMap((c) => c.produtos).find((p) => p.id === id);
  if (id !== "novo" && !produto) notFound();

  return (
    <EditorProduto
      categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
      produto={produto ?? null}
      categoriaInicial={typeof categoria === "string" ? categoria : categorias[0]?.id ?? ""}
    />
  );
}
