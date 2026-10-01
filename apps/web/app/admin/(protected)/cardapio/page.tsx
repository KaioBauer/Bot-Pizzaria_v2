import type { Metadata } from "next";
import Link from "next/link";
import { listarCardapioAdmin } from "@pizzaria/db";
import { formatarReais } from "@pizzaria/shared";
import { exigirAdmin } from "../../../../lib/auth";
import { alternarProdutoAction, excluirCategoriaAction, salvarCategoriaAction } from "./actions";

export const metadata: Metadata = { title: "Cardápio" };
export const dynamic = "force-dynamic";

const campo = "rounded-lg border border-stone-300 bg-white px-3 py-2";

export default async function CardapioAdminPage({ searchParams }: PageProps<"/admin/cardapio">) {
  const { supabase } = await exigirAdmin();
  const { erro } = await searchParams;
  const categorias = await listarCardapioAdmin(supabase);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Cardápio</h1>
        <div className="flex gap-2">
          <Link href="/cardapio" target="_blank" className="rounded-lg px-4 py-2.5 font-medium ring-1 ring-stone-300 hover:bg-white">
            Ver cardápio público ↗
          </Link>
          <Link href="/admin/cardapio/produto/novo" className="rounded-lg bg-marca-600 px-4 py-2.5 font-semibold text-white hover:bg-marca-700">
            + Novo produto
          </Link>
        </div>
      </div>

      {typeof erro === "string" && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-800">{erro}</p>}

      {categorias.map((categoria) => (
        <section key={categoria.id} className={`rounded-2xl bg-white ring-1 ring-stone-200 ${categoria.ativo ? "" : "opacity-60"}`}>
          <form action={salvarCategoriaAction} className="flex flex-wrap items-center gap-2 border-b border-stone-100 p-4">
            <input type="hidden" name="id" value={categoria.id} />
            <input name="nome" defaultValue={categoria.nome} aria-label="Nome da categoria" className={`${campo} flex-1 text-lg font-bold`} />
            <label className="flex items-center gap-1 text-sm text-stone-600">
              Ordem
              <input name="ordem" type="number" min={0} defaultValue={categoria.ordem} className={`${campo} w-20`} />
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input name="ativo" type="checkbox" defaultChecked={categoria.ativo} className="size-4 accent-marca-600" /> Visível
            </label>
            <button className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">Salvar</button>
            {categoria.produtos.length === 0 && (
              <button formAction={excluirCategoriaAction} className="rounded-lg px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                Excluir
              </button>
            )}
          </form>

          <ul className="divide-y divide-stone-100">
            {categoria.produtos.length === 0 && <li className="p-4 text-sm text-stone-500">Nenhum produto nesta categoria.</li>}
            {categoria.produtos.map((produto) => {
              const precos = produto.variacoes.filter((v) => v.ativo && (v.tipo === "tamanho" || v.tipo === "padrao"));
              return (
                <li key={produto.id} className={`flex items-center gap-3 p-3 ${produto.ativo ? "" : "bg-stone-50"}`}>
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                    {produto.imagemUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={produto.imagemUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-2xl">🍕</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${produto.ativo ? "" : "text-stone-400 line-through"}`}>{produto.nome}</p>
                    <p className="truncate text-sm text-stone-500">
                      {precos.map((v) => `${v.tipo === "padrao" ? "" : `${v.nome} `}${formatarReais(v.precoCentavos)}`).join(" · ") || "Sem preço ativo"}
                    </p>
                  </div>
                  <form action={alternarProdutoAction}>
                    <input type="hidden" name="id" value={produto.id} />
                    <input type="hidden" name="ativo" value={String(!produto.ativo)} />
                    <button
                      className={`rounded-full px-3 py-1.5 text-sm font-medium ${produto.ativo ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}
                      title={produto.ativo ? "Clique para tirar do cardápio" : "Clique para voltar ao cardápio"}
                    >
                      {produto.ativo ? "Disponível" : "Esgotado"}
                    </button>
                  </form>
                  <Link href={`/admin/cardapio/produto/${produto.id}`} className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
                    Editar
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <form action={salvarCategoriaAction} className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 p-4">
        <input name="nome" placeholder="Nova categoria (ex.: Esfihas)" required className={`${campo} flex-1`} />
        <input name="ordem" type="number" min={0} defaultValue={categorias.length + 1} aria-label="Ordem" className={`${campo} w-20`} />
        <input type="hidden" name="ativo" value="true" />
        <button className="rounded-lg bg-stone-800 px-4 py-2 font-medium text-white">Adicionar categoria</button>
      </form>
    </main>
  );
}
