import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ExternalLink, EyeOff, Pizza, Plus } from "lucide-react";
import { listarCardapioAdmin } from "@pizzaria/db";
import { formatarReais } from "@pizzaria/shared";
import { Aviso, Botao, BotaoLink, CabecalhoPagina, Cartao, cn, estiloEntrada, MiniaturaProduto, Selo, Vazio } from "../../../../components/ui";
import { exigirAdmin } from "../../../../lib/auth";
import { alternarProdutoAction, excluirCategoriaAction, salvarCategoriaAction } from "./actions";

export const metadata: Metadata = { title: "Cardápio" };
export const dynamic = "force-dynamic";

export default async function CardapioAdminPage({ searchParams }: PageProps<"/admin/cardapio">) {
  const { supabase } = await exigirAdmin();
  const { erro } = await searchParams;
  const categorias = await listarCardapioAdmin(supabase);
  const totalProdutos = categorias.reduce((s, c) => s + c.produtos.length, 0);
  const esgotados = categorias.reduce((s, c) => s + c.produtos.filter((p) => !p.ativo).length, 0);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <CabecalhoPagina
        titulo="Cardápio"
        descricao={`${totalProdutos} produtos em ${categorias.length} categorias${esgotados ? ` · ${esgotados} indisponível(is)` : ""}`}
        acoes={
          <>
            <BotaoLink href="/cardapio" target="_blank" variante="secundario">
              <ExternalLink className="size-4" /> Ver cardápio público
            </BotaoLink>
            <BotaoLink href="/admin/cardapio/produto/novo">
              <Plus className="size-4" /> Novo produto
            </BotaoLink>
          </>
        }
      />

      {typeof erro === "string" && <Aviso>{erro}</Aviso>}

      {categorias.map((categoria) => (
        <Cartao key={categoria.id} className={cn(!categoria.ativo && "opacity-70")}>
          <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-4 sm:px-6">
            <h2 className="font-display text-xl font-semibold">{categoria.nome}</h2>
            <Selo>{categoria.produtos.length}</Selo>
            {!categoria.ativo && (
              <Selo tom="aviso">
                <EyeOff className="size-3" /> Oculta
              </Selo>
            )}
            <div className="ml-auto flex items-center gap-2">
              <BotaoLink href={`/admin/cardapio/produto/novo?categoria=${categoria.id}`} variante="fantasma" tamanho="sm">
                <Plus className="size-4" /> Produto
              </BotaoLink>
              <details className="group relative">
                <summary className="flex h-8 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-semibold text-stone-600 hover:bg-stone-100 [&::-webkit-details-marker]:hidden">
                  Editar
                </summary>
                <form
                  action={salvarCategoriaAction}
                  className="absolute top-10 right-0 z-10 w-80 space-y-3 rounded-2xl bg-white p-4 shadow-elevada ring-1 ring-stone-900/10"
                >
                  <input type="hidden" name="id" value={categoria.id} />
                  <label className="block text-sm font-medium">
                    Nome
                    <input name="nome" defaultValue={categoria.nome} className={cn(estiloEntrada, "mt-1")} />
                  </label>
                  <div className="flex items-end gap-3">
                    <label className="block w-24 text-sm font-medium">
                      Ordem
                      <input name="ordem" type="number" min={0} defaultValue={categoria.ordem} className={cn(estiloEntrada, "mt-1")} />
                    </label>
                    <label className="flex items-center gap-2 pb-2.5 text-sm">
                      <input name="ativo" type="checkbox" defaultChecked={categoria.ativo} className="size-4 accent-marca-600" /> Visível no cardápio
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Botao tamanho="sm" className="flex-1">Salvar</Botao>
                    {categoria.produtos.length === 0 && (
                      <Botao tamanho="sm" variante="perigo" formAction={excluirCategoriaAction}>
                        Excluir
                      </Botao>
                    )}
                  </div>
                </form>
              </details>
            </div>
          </div>

          {categoria.produtos.length === 0 ? (
            <Vazio icone={<Pizza className="size-6" />} titulo="Nenhum produto nesta categoria" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {categoria.produtos.map((produto) => {
                const precos = produto.variacoes.filter((v) => v.ativo && (v.tipo === "tamanho" || v.tipo === "padrao"));
                const menor = precos.length ? Math.min(...precos.map((v) => v.precoCentavos)) : null;
                return (
                  <li key={produto.id} className="flex items-center gap-4 px-5 py-3 sm:px-6">
                    <MiniaturaProduto nome={produto.nome} url={produto.imagemUrl} className={cn("size-14 shrink-0 rounded-xl", !produto.ativo && "grayscale")} />
                    <Link href={`/admin/cardapio/produto/${produto.id}`} className="group min-w-0 flex-1">
                      <p className={cn("font-semibold group-hover:text-marca-700", !produto.ativo && "text-stone-400")}>{produto.nome}</p>
                      <p className="truncate text-sm text-stone-500">
                        {precos.length > 1
                          ? precos.map((v) => `${v.nome} ${formatarReais(v.precoCentavos)}`).join(" · ")
                          : menor !== null
                            ? formatarReais(menor)
                            : "Sem preço ativo"}
                      </p>
                    </Link>
                    <form action={alternarProdutoAction}>
                      <input type="hidden" name="id" value={produto.id} />
                      <input type="hidden" name="ativo" value={String(!produto.ativo)} />
                      <button
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-colors",
                          produto.ativo
                            ? "bg-manjericao-50 text-manjericao-700 ring-manjericao-100 hover:bg-manjericao-100"
                            : "bg-stone-100 text-stone-500 ring-stone-200 hover:bg-stone-200"
                        )}
                        title={produto.ativo ? "Clique para marcar como esgotado" : "Clique para voltar a vender"}
                      >
                        <span className={cn("size-1.5 rounded-full", produto.ativo ? "bg-manjericao-500" : "bg-stone-400")} />
                        {produto.ativo ? "Disponível" : "Esgotado"}
                      </button>
                    </form>
                    <Link href={`/admin/cardapio/produto/${produto.id}`} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={`Editar ${produto.nome}`}>
                      <ChevronRight className="size-5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      ))}

      <form action={salvarCategoriaAction} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 p-4">
        <input name="nome" placeholder="Nova categoria (ex.: Esfihas, Sobremesas)" required className={cn(estiloEntrada, "min-w-60 flex-1")} />
        <input name="ordem" type="number" min={0} defaultValue={categorias.length + 1} aria-label="Ordem" className={cn(estiloEntrada, "w-24")} />
        <input type="hidden" name="ativo" value="true" />
        <Botao variante="escuro">
          <Plus className="size-4" /> Adicionar categoria
        </Botao>
      </form>
    </main>
  );
}
