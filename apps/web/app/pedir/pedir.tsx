"use client";

import { ChefHat, Clock, CupSoda, Minus, Plus, ShoppingBag, Volume2, VolumeX, Wand2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CatalogoPedir } from "@pizzaria/db";
import { formatarReais, type ItemPedidoLinkArgs } from "@pizzaria/shared";
import { usarSom, usePreferenciaSom } from "../../components/pizza-builder";
import { cn, Logo } from "../../components/ui";
import { FormularioPedido, ListaCarrinho, type InfoLoja } from "./checkout";
import { Folha } from "./folha";
import { carregar, montarPrecos, novoId, precificar, salvar, variacaoUnica, type ItemCarrinho } from "./modelo";
import { Montador } from "./montador";

const ALVO_CARRINHO = "alvo-carrinho";

export function Pedir({ catalogo, loja }: { catalogo: CatalogoPedir; loja: InfoLoja }) {
  const router = useRouter();
  const precos = useMemo(() => montarPrecos(catalogo, loja.maxIngredientes), [catalogo, loja.maxIngredientes]);
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [carregado, setCarregado] = useState(false);
  const livreId = catalogo.pizzas.find((p) => p.montagemLivre)?.id;
  // Uma barra só: montar do zero (padrão), sabores da casa ou bebidas.
  const [aba, setAba] = useState<"livre" | "sabores" | "outros">(livreId ? "livre" : "sabores");
  const [folha, setFolha] = useState<"carrinho" | "dados" | null>(null);
  const [editando, setEditando] = useState<ItemCarrinho | null>(null);
  const [somLigado, setSomLigado] = usePreferenciaSom();
  const tocar = usarSom(somLigado);
  const [pulo, setPulo] = useState(0);

  // Carrinho salvo no aparelho (sobrevive a recarregar a página).
  useEffect(() => {
    setItens(carregar().itens);
    setCarregado(true);
  }, []);
  useEffect(() => {
    if (carregado) salvar({ ...carregar(), itens });
  }, [itens, carregado]);

  // Chave de idempotência por conteúdo do carrinho: reenviar o mesmo carrinho
  // (duplo clique, rede caiu) devolve o mesmo pedido em vez de criar outro.
  const assinatura = JSON.stringify(itens.map((i) => i.item));
  const chaveIdempotencia = useMemo(() => novoId(), [assinatura]); // eslint-disable-line react-hooks/exhaustive-deps

  const cotacao = precificar(itens.map((i) => i.item), precos);
  const quantidade = itens.reduce((s, i) => s + i.item.quantidade, 0);

  function adicionarPizza(item: ItemPedidoLinkArgs) {
    if (editando) {
      setItens((l) => l.map((i) => (i.id === editando.id ? { ...i, item } : i)));
      setEditando(null);
      setFolha("carrinho");
    } else {
      setItens((l) => [...l, { id: novoId(), item }]);
    }
    setPulo((n) => n + 1);
  }

  function quantidadeOutro(produtoId: string, variacaoId: string, delta: number) {
    tocar(delta > 0 ? "pop" : "sai");
    setItens((l) => {
      const atual = l.find((i) => i.item.sabores[0]?.variacao_id === variacaoId && i.item.sabores.length === 1 && !i.item.adicionais.length);
      if (!atual) {
        return delta > 0 ? [...l, { id: novoId(), item: { sabores: [{ produto_id: produtoId, variacao_id: variacaoId }], adicionais: [], ingredientes: [], quantidade: 1, observacao: null } }] : l;
      }
      const nova = atual.item.quantidade + delta;
      return nova <= 0 ? l.filter((i) => i !== atual) : l.map((i) => (i === atual ? { ...i, item: { ...i.item, quantidade: Math.min(50, nova) } } : i));
    });
    if (delta > 0) setPulo((n) => n + 1);
  }

  const categoriasOutros = [...new Set(catalogo.outros.map((p) => p.categoria))];

  return (
    <div className="min-h-dvh bg-[#f8f3ea] text-stone-900">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-[#f8f3ea]/90 px-4 backdrop-blur">
        <Logo className="h-8 w-auto" />
        <span className="flex-1 truncate font-display text-lg font-semibold">{loja.nome}</span>
        <button
          type="button"
          onClick={() => setSomLigado(!somLigado)}
          className="flex size-10 items-center justify-center rounded-full text-stone-600 hover:bg-white"
          aria-label={somLigado ? "Desligar sons" : "Ligar sons"}
          aria-pressed={somLigado}
        >
          {somLigado ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
        <motion.button
          id={ALVO_CARRINHO}
          key={pulo}
          type="button"
          onClick={() => setFolha("carrinho")}
          initial={pulo ? { scale: 1.35 } : false}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 12 }}
          className="relative flex h-10 items-center gap-1.5 rounded-full bg-stone-900 pr-3.5 pl-3 text-sm font-semibold text-white"
          aria-label={`Carrinho, ${quantidade} ${quantidade === 1 ? "item" : "itens"}`}
        >
          <ShoppingBag className="size-4" />
          {cotacao.ok && quantidade ? formatarReais(cotacao.subtotalCentavos) : "Carrinho"}
          {quantidade > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-marca-500 text-[11px] tabular">{quantidade}</span>
          )}
        </motion.button>
      </header>

      <main className="mx-auto max-w-lg px-4">
        {(!loja.aberta || !loja.linkAtivo) && (
          <p className="mt-1 flex items-center gap-2 rounded-full bg-stone-900 px-3 py-1.5 text-[12.5px] text-white">
            <Clock className="size-3.5 shrink-0" />
            <span className="truncate">
              {!loja.linkAtivo
                ? "Pedidos pelo site desligados — monte só por diversão"
                : loja.pausada
                  ? "Sem pedidos agora — monte só por diversão 😉"
                  : `Fechados${loja.proximaAbertura ? ` · abrimos ${loja.proximaAbertura}` : ""} — monte por diversão`}
            </span>
          </p>
        )}

        <div className="mt-2 flex gap-1 rounded-2xl bg-[#efe3cf] p-1" role="tablist" aria-label="O que pedir">
          {[
            ...(livreId ? [{ chave: "livre" as const, rotulo: "Do seu jeito", Icone: Wand2 }] : []),
            { chave: "sabores" as const, rotulo: "Sabores", Icone: ChefHat },
            ...(catalogo.outros.length ? [{ chave: "outros" as const, rotulo: "Bebidas", Icone: CupSoda }] : []),
          ].map(({ chave, rotulo, Icone }) => (
            <button
              key={chave}
              type="button"
              role="tab"
              aria-selected={aba === chave}
              onClick={() => {
                setAba(chave);
                setEditando(null);
              }}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13.5px] font-semibold transition-colors",
                aba === chave ? "text-stone-900" : "text-stone-600"
              )}
            >
              {aba === chave && <motion.span layoutId="aba-ativa" className="absolute inset-0 rounded-xl bg-white shadow-suave" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icone className="relative size-4" />
              <span className="relative">{rotulo}</span>
            </button>
          ))}
        </div>

        {aba !== "outros" ? (
          <Montador
            modo={aba}
            key={`${editando?.id ?? "nova"}:${aba}`}
            catalogo={catalogo}
            precos={precos}
            {...(editando ? { editando: editando.item } : {})}
            alvoCarrinho={ALVO_CARRINHO}
            aoAdicionar={adicionarPizza}
            tocar={tocar}
          />
        ) : (
          <div className="pt-4 pb-28">
            {categoriasOutros.map((categoria) => (
              <section key={categoria} className="mb-5">
                <h2 className="mb-2 font-display text-lg font-semibold">{categoria}</h2>
                <ul className="divide-y divide-creme-200 rounded-2xl bg-white px-3 shadow-suave ring-1 ring-creme-200">
                  {catalogo.outros
                    .filter((p) => p.categoria === categoria)
                    .map((p) => {
                      const v = variacaoUnica(p);
                      if (!v) return null;
                      const qtd = itens.find((i) => i.item.sabores[0]?.variacao_id === v.id)?.item.quantidade ?? 0;
                      return (
                        <li key={p.id} className="flex items-center gap-3 py-3">
                          {p.imagemUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imagemUrl} alt="" loading="lazy" className="size-12 rounded-xl object-cover" />
                          ) : (
                            <span className="size-12 rounded-xl bg-creme-100" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{p.nome}</p>
                            <p className="text-sm text-stone-600 tabular">{formatarReais(v.precoCentavos)}</p>
                          </div>
                          {qtd > 0 && (
                            <button type="button" onClick={() => quantidadeOutro(p.id, v.id, -1)} className="flex size-10 items-center justify-center rounded-full ring-1 ring-creme-300" aria-label={`Tirar ${p.nome}`}>
                              <Minus className="size-4" />
                            </button>
                          )}
                          {qtd > 0 && <span className="w-5 text-center font-semibold tabular">{qtd}</span>}
                          <button type="button" onClick={() => quantidadeOutro(p.id, v.id, 1)} className="flex size-10 items-center justify-center rounded-full bg-marca-600 text-white" aria-label={`Adicionar ${p.nome}`}>
                            <Plus className="size-4" />
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
            {quantidade > 0 && (
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-creme-200 bg-[#f8f3ea]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
                <button type="button" onClick={() => setFolha("carrinho")} className="mx-auto flex h-12 w-full max-w-lg items-center justify-center rounded-full bg-marca-600 font-semibold text-white shadow-elevada">
                  Ver carrinho · {cotacao.ok ? formatarReais(cotacao.subtotalCentavos) : ""}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {folha === "carrinho" && (
          <Folha
            key="carrinho"
            titulo="Seu pedido"
            aoFechar={() => setFolha(null)}
            rodape={
              itens.length > 0 && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setAba(livreId ? "livre" : "sabores"); setFolha(null); }} className="h-12 rounded-full px-4 font-semibold ring-1 ring-creme-300">
                    + Pizza
                  </button>
                  <button
                    type="button"
                    disabled={!cotacao.ok}
                    onClick={() => setFolha("dados")}
                    className="h-12 flex-1 rounded-full bg-marca-600 font-semibold text-white shadow-elevada disabled:bg-stone-400"
                  >
                    Continuar · {cotacao.ok ? formatarReais(cotacao.subtotalCentavos) : "revise os itens"}
                  </button>
                </div>
              )
            }
          >
            <ListaCarrinho
              itens={itens}
              precos={precos}
              aoAlterar={setItens}
              aoEditar={(id) => {
                const alvo = itens.find((i) => i.id === id) ?? null;
                setEditando(alvo);
                setAba(alvo?.item.sabores[0]?.produto_id === livreId ? "livre" : "sabores");
                setFolha(null);
                window.scrollTo({ top: 0 });
              }}
            />
          </Folha>
        )}
        {folha === "dados" && (
          <Folha key="dados" titulo="Seus dados" aoFechar={() => setFolha("carrinho")}>
            <FormularioPedido
              itens={itens}
              precos={precos}
              loja={loja}
              chaveIdempotencia={chaveIdempotencia}
              aoConcluir={(token) => {
                setItens([]);
                router.push(`/pedir/acompanhar/${token}`);
              }}
            />
          </Folha>
        )}
      </AnimatePresence>
    </div>
  );
}
