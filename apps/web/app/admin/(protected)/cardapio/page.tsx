import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ExternalLink, EyeOff, Layers, Pizza, Plus } from "lucide-react";
import {
  listarCardapioAdmin,
  listarTamanhos,
  type CategoriaAdmin,
  type TamanhoAdmin,
} from "@pizzaria/db";
import { centavosParaCampo, formatarReais } from "@pizzaria/shared";
import {
  Aviso,
  Botao,
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  cn,
  estiloEntrada,
  MiniaturaProduto,
  Selo,
  Vazio,
} from "../../../../components/ui";
import { exigirAdmin } from "../../../../lib/auth";
import {
  alternarProdutoAction,
  definirAdicionalCategoriaAction,
  excluirCategoriaAction,
  salvarCategoriaAction,
} from "./actions";

export const metadata: Metadata = { title: "Cardápio" };
export const dynamic = "force-dynamic";

/** Adicional por sabor de uma variação de tamanho (preço − base do tamanho), ou null se o tamanho não é tabelado. */
function adicionalDe(
  nome: string,
  precoCentavos: number,
  tamanhos: TamanhoAdmin[],
): number | null {
  const t = tamanhos.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
  return t ? precoCentavos - t.precoBaseCentavos : null;
}

/** Adicional comum da categoria (o mais frequente entre os sabores), se ela usa a tabela de tamanhos. */
function adicionalDaCategoria(
  categoria: CategoriaAdmin,
  tamanhos: TamanhoAdmin[],
): number | null {
  const contagem = new Map<number, number>();
  for (const p of categoria.produtos) {
    const v = p.variacoes.find(
      (x) =>
        x.tipo === "tamanho" &&
        adicionalDe(x.nome, x.precoCentavos, tamanhos) !== null,
    );
    if (!v) continue;
    const a = adicionalDe(v.nome, v.precoCentavos, tamanhos)!;
    contagem.set(a, (contagem.get(a) ?? 0) + 1);
  }
  return [...contagem].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export default async function CardapioAdminPage({
  searchParams,
}: PageProps<"/admin/cardapio">) {
  const { supabase } = await exigirAdmin();
  const { erro } = await searchParams;
  const [categorias, tamanhos] = await Promise.all([
    listarCardapioAdmin(supabase),
    listarTamanhos(supabase),
  ]);
  const totalProdutos = categorias.reduce((s, c) => s + c.produtos.length, 0);
  const esgotados = categorias.reduce(
    (s, c) => s + c.produtos.filter((p) => !p.ativo).length,
    0,
  );

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
            <BotaoLink href="/admin/cardapio/ingredientes" variante="secundario">
              <Layers className="size-4" /> Ingredientes e camadas
            </BotaoLink>
            <BotaoLink href="/admin/cardapio/produto/novo">
              <Plus className="size-4" /> Novo produto
            </BotaoLink>
          </>
        }
      />

      {typeof erro === "string" && <Aviso>{erro}</Aviso>}

      {categorias.map((categoria) => {
        const adicionalCategoria = adicionalDaCategoria(categoria, tamanhos);
        return (
          <Cartao
            key={categoria.id}
            className={cn(!categoria.ativo && "opacity-70")}
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-4 sm:px-6">
              <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
                {categoria.nome}
              </h2>
              <Selo>{categoria.produtos.length}</Selo>
              {adicionalCategoria !== null && adicionalCategoria > 0 && (
                <Selo tom="marca">
                  + {formatarReais(adicionalCategoria)} por sabor
                </Selo>
              )}
              {!categoria.ativo && (
                <Selo tom="aviso">
                  <EyeOff className="size-3" /> Oculta
                </Selo>
              )}
              <div className="ml-auto flex items-center gap-2">
                <BotaoLink
                  href={`/admin/cardapio/produto/novo?categoria=${categoria.id}`}
                  variante="fantasma"
                  tamanho="sm"
                >
                  <Plus className="size-4" /> Produto
                </BotaoLink>
                <details className="group relative">
                  <summary className="flex h-8 cursor-pointer list-none items-center rounded-lg px-2.5 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-900/5 hover:text-zinc-900 group-open:bg-zinc-900/5 group-open:text-zinc-900 [&::-webkit-details-marker]:hidden">
                    Editar
                  </summary>
                  <div className="absolute top-10 right-0 z-10 w-80 divide-y divide-zinc-100 rounded-xl bg-white shadow-[0_12px_32px_-12px_rgb(0_0_0/0.2)] ring-1 ring-zinc-200 motion-safe:animate-[entrada_0.15s_ease-out_both]">
                    <form
                      action={salvarCategoriaAction}
                      className="space-y-3 p-4"
                    >
                      <input type="hidden" name="id" value={categoria.id} />
                      <label className="block text-[13px] font-medium text-zinc-700">
                        Nome
                        <input
                          name="nome"
                          defaultValue={categoria.nome}
                          className={cn(estiloEntrada, "mt-1")}
                        />
                      </label>
                      <div className="flex items-end gap-3">
                        <label className="block w-24 text-[13px] font-medium text-zinc-700">
                          Ordem
                          <input
                            name="ordem"
                            type="number"
                            min={0}
                            defaultValue={categoria.ordem}
                            className={cn(estiloEntrada, "mt-1")}
                          />
                        </label>
                        <label className="flex items-center gap-2 pb-2.5 text-sm">
                          <input
                            name="ativo"
                            type="checkbox"
                            defaultChecked={categoria.ativo}
                            className="size-4 accent-marca-600"
                          />{" "}
                          Visível no cardápio
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Botao tamanho="sm" className="flex-1">
                          Salvar
                        </Botao>
                        {categoria.produtos.length === 0 && (
                          <Botao
                            tamanho="sm"
                            variante="perigo"
                            formAction={excluirCategoriaAction}
                          >
                            Excluir
                          </Botao>
                        )}
                      </div>
                    </form>
                    {adicionalCategoria !== null && (
                      <form
                        action={definirAdicionalCategoriaAction}
                        className="space-y-2 p-4"
                      >
                        <input type="hidden" name="id" value={categoria.id} />
                        <label className="block text-[13px] font-medium text-zinc-700">
                          Adicional por sabor (R$)
                          <input
                            name="adicional"
                            inputMode="decimal"
                            defaultValue={centavosParaCampo(adicionalCategoria)}
                            className={cn(estiloEntrada, "mt-1")}
                          />
                        </label>
                        <p className="text-xs text-zinc-500">
                          Aplica a todos os sabores da categoria: cada tamanho
                          fica com o preço base + este valor.
                        </p>
                        <Botao
                          tamanho="sm"
                          variante="secundario"
                          className="w-full"
                        >
                          Aplicar a todos
                        </Botao>
                      </form>
                    )}
                  </div>
                </details>
              </div>
            </div>

            {categoria.produtos.length === 0 ? (
              <Vazio
                icone={<Pizza className="size-6" />}
                titulo="Nenhum produto nesta categoria"
              />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {categoria.produtos.map((produto) => {
                  const precos = produto.variacoes.filter(
                    (v) =>
                      v.ativo && (v.tipo === "tamanho" || v.tipo === "padrao"),
                  );
                  const menor = precos.length
                    ? Math.min(...precos.map((v) => v.precoCentavos))
                    : null;
                  const adicional =
                    precos.length > 1
                      ? adicionalDe(
                          precos[0]!.nome,
                          precos[0]!.precoCentavos,
                          tamanhos,
                        )
                      : null;
                  const tabelado =
                    adicional !== null &&
                    precos.every(
                      (v) =>
                        adicionalDe(v.nome, v.precoCentavos, tamanhos) ===
                        adicional,
                    );
                  return (
                    <li
                      key={produto.id}
                      className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-zinc-50/60 sm:px-6"
                    >
                      <MiniaturaProduto
                        nome={produto.nome}
                        url={produto.imagemUrl}
                        className={cn(
                          "size-12 shrink-0 rounded-lg ring-1 ring-zinc-900/5",
                          !produto.ativo && "grayscale",
                        )}
                      />
                      <Link
                        href={`/admin/cardapio/produto/${produto.id}`}
                        className="group min-w-0 flex-1"
                      >
                        <p
                          className={cn(
                            "text-sm font-medium text-zinc-900 transition-colors group-hover:text-zinc-600",
                            !produto.ativo && "text-zinc-400",
                          )}
                        >
                          {produto.nome}
                          {produto.montagemLivre && (
                            <Selo tom="violeta" className="ml-2 align-middle">
                              Pedido pelo link
                            </Selo>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-zinc-500">
                          {tabelado
                            ? `A partir de ${formatarReais(menor!)}${adicional ? ` · + ${formatarReais(adicional)} por sabor` : " · preço da tabela"}`
                            : precos.length > 1
                              ? precos
                                  .map(
                                    (v) =>
                                      `${v.nome} ${formatarReais(v.precoCentavos)}`,
                                  )
                                  .join(" · ")
                              : menor !== null
                                ? formatarReais(menor)
                                : "Sem preço ativo"}
                        </p>
                      </Link>
                      <form action={alternarProdutoAction}>
                        <input type="hidden" name="id" value={produto.id} />
                        <input
                          type="hidden"
                          name="ativo"
                          value={String(!produto.ativo)}
                        />
                        <button
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium ring-1 ring-inset transition-[background-color,transform] active:scale-[0.97]",
                            produto.ativo
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70 hover:bg-emerald-100/70"
                              : "bg-zinc-100 text-zinc-500 ring-zinc-200 hover:bg-zinc-200",
                          )}
                          title={
                            produto.ativo
                              ? "Clique para marcar como esgotado"
                              : "Clique para voltar a vender"
                          }
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              produto.ativo
                                ? "bg-emerald-500"
                                : "bg-zinc-400",
                            )}
                          />
                          {produto.ativo ? "Disponível" : "Esgotado"}
                        </button>
                      </form>
                      <Link
                        href={`/admin/cardapio/produto/${produto.id}`}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        aria-label={`Editar ${produto.nome}`}
                      >
                        <ChevronRight className="size-5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        );
      })}

      <form
        action={salvarCategoriaAction}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-4 transition-colors focus-within:border-zinc-400"
      >
        <input
          name="nome"
          placeholder="Nova categoria (ex.: Esfihas, Sobremesas)"
          required
          className={cn(estiloEntrada, "min-w-60 flex-1")}
        />
        <input
          name="ordem"
          type="number"
          min={0}
          defaultValue={categorias.length + 1}
          aria-label="Ordem"
          className={cn(estiloEntrada, "w-24")}
        />
        <input type="hidden" name="ativo" value="true" />
        <Botao variante="escuro">
          <Plus className="size-4" /> Adicionar categoria
        </Botao>
      </form>
    </main>
  );
}
