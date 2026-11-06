"use client";

import { Bike, ChefHat, ChevronRight, CupSoda, Minus, Plus, ShoppingBag, Store, Volume2, VolumeX, Wand2 } from "lucide-react";
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

type Aba = "livre" | "sabores" | "outros";

/** Situação da loja numa linha curta, para a barra do topo. */
function situacao(loja: InfoLoja): { texto: string; aberta: boolean } {
  if (!loja.linkAtivo) return { texto: "Pedidos pelo site desligados", aberta: false };
  if (loja.aberta) return { texto: "Aberto agora", aberta: true };
  if (loja.pausada) return { texto: "Sem pedidos no momento", aberta: false };
  return { texto: `Fechado${loja.proximaAbertura ? ` · abre ${loja.proximaAbertura}` : ""}`, aberta: false };
}

export function Pedir({ catalogo, loja }: { catalogo: CatalogoPedir; loja: InfoLoja }) {
  const router = useRouter();
  const precos = useMemo(() => montarPrecos(catalogo, loja.maxIngredientes), [catalogo, loja.maxIngredientes]);
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [carregado, setCarregado] = useState(false);
  const livreId = catalogo.pizzas.find((p) => p.montagemLivre)?.id;
  const [aba, setAba] = useState<Aba>(livreId ? "livre" : "sabores");
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
  const status = situacao(loja);
  const taxas = loja.bairros.map((b) => b.taxaCentavos);

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

  function trocarAba(nova: Aba) {
    setAba(nova);
    setEditando(null);
  }

  const categoriasOutros = [...new Set(catalogo.outros.map((p) => p.categoria))];
  const abas = [
    ...(livreId ? [{ chave: "livre" as const, rotulo: "Do seu jeito", Icone: Wand2 }] : []),
    { chave: "sabores" as const, rotulo: "Sabores", Icone: ChefHat },
    ...(catalogo.outros.length ? [{ chave: "outros" as const, rotulo: "Bebidas", Icone: CupSoda }] : []),
  ];

  return (
    <div className="min-h-dvh bg-[#f6f3ee] text-stone-900">
      {/* Barra do app */}
      <header className="sticky top-0 z-40 border-b border-black/[0.04] bg-white [transform:translateZ(0)]">
        <div className="mx-auto flex h-16 max-w-lg items-center gap-3 px-4">
          <Logo className="size-10 shrink-0 drop-shadow-[0_4px_8px_rgb(201_53_26/0.35)]" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-extrabold tracking-tight">{loja.nome}</p>
            <p className={cn("flex items-center gap-1.5 truncate text-xs font-medium", status.aberta ? "text-manjericao-600" : "text-stone-500")}>
              <span className={cn("size-1.5 shrink-0 rounded-full", status.aberta ? "bg-manjericao-500" : "bg-stone-400")} />
              {status.texto}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSomLigado(!somLigado)}
            className="flex size-10 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100"
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
            initial={pulo ? { scale: 1.3 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 12 }}
            className={cn(
              "relative flex size-11 items-center justify-center rounded-2xl transition-colors",
              quantidade ? "bg-marca-600 text-white shadow-[0_6px_16px_-6px_rgb(201_53_26/0.7)]" : "bg-stone-100 text-stone-700"
            )}
            aria-label={`Sacola, ${quantidade} ${quantidade === 1 ? "item" : "itens"}`}
          >
            <ShoppingBag className="size-5" />
            {quantidade > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-900 px-1 text-[11px] font-bold text-white tabular ring-2 ring-white">
                {quantidade}
              </span>
            )}
          </motion.button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4">
        {/* Informações da loja, como no topo de um cardápio de delivery */}
        <div className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pt-3">
          {taxas.length > 0 && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-[0_1px_3px_rgb(0_0_0/0.06)]">
              <Bike className="size-3.5 text-marca-600" />
              Entrega {Math.min(...taxas) === Math.max(...taxas) ? formatarReais(taxas[0]!) : `a partir de ${formatarReais(Math.min(...taxas))}`}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-[0_1px_3px_rgb(0_0_0/0.06)]">
            <Store className="size-3.5 text-marca-600" />
            Retirada no balcão
          </span>
          {loja.pedidoMinimoCentavos > 0 && (
            <span className="flex shrink-0 items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-[0_1px_3px_rgb(0_0_0/0.06)]">
              Pedido mín. {formatarReais(loja.pedidoMinimoCentavos)}
            </span>
          )}
          {loja.pix && (
            <span className="flex shrink-0 items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-[0_1px_3px_rgb(0_0_0/0.06)]">Aceita Pix</span>
          )}
        </div>

        {/* O que pedir */}
        <div className="mt-3 flex gap-1 rounded-2xl bg-white p-1 shadow-[0_1px_3px_rgb(0_0_0/0.06)]" role="tablist" aria-label="O que pedir">
          {abas.map(({ chave, rotulo, Icone }) => (
            <button
              key={chave}
              type="button"
              role="tab"
              aria-selected={aba === chave}
              onClick={() => trocarAba(chave)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13.5px] font-bold transition-colors",
                aba === chave ? "text-white" : "text-stone-500 hover:text-stone-800"
              )}
            >
              {aba === chave && <motion.span layoutId="aba-ativa" className="absolute inset-0 rounded-xl bg-stone-900" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
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
          <div className="pt-5 pb-32">
            {categoriasOutros.map((categoria) => (
              <section key={categoria} className="mb-6">
                <h2 className="mb-3 text-lg font-extrabold tracking-tight">{categoria}</h2>
                <ul className="space-y-2.5">
                  {catalogo.outros
                    .filter((p) => p.categoria === categoria)
                    .map((p) => {
                      const v = variacaoUnica(p);
                      if (!v) return null;
                      const qtd = itens.find((i) => i.item.sabores[0]?.variacao_id === v.id)?.item.quantidade ?? 0;
                      return (
                        <li key={p.id} className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-[0_1px_3px_rgb(0_0_0/0.06)]">
                          {p.imagemUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imagemUrl} alt="" loading="lazy" className="size-16 rounded-2xl object-cover" />
                          ) : (
                            <span className="flex size-16 items-center justify-center rounded-2xl bg-[#f6f1e8]">
                              <CupSoda className="size-7 text-marca-600/70" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold">{p.nome}</p>
                            {p.descricao && <p className="truncate text-xs text-stone-500">{p.descricao}</p>}
                            <p className="mt-0.5 text-sm font-bold text-stone-900 tabular">{formatarReais(v.precoCentavos)}</p>
                          </div>
                          <div className={cn("flex items-center rounded-full", qtd > 0 && "bg-stone-100")}>
                            {qtd > 0 && (
                              <>
                                <button type="button" onClick={() => quantidadeOutro(p.id, v.id, -1)} className="flex size-9 items-center justify-center rounded-full text-marca-600" aria-label={`Tirar ${p.nome}`}>
                                  <Minus className="size-4" strokeWidth={2.5} />
                                </button>
                                <span className="w-5 text-center text-sm font-bold tabular">{qtd}</span>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => quantidadeOutro(p.id, v.id, 1)}
                              className="flex size-9 items-center justify-center rounded-full bg-marca-600 text-white shadow-[0_4px_10px_-4px_rgb(201_53_26/0.8)]"
                              aria-label={`Adicionar ${p.nome}`}
                            >
                              <Plus className="size-4" strokeWidth={2.5} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Sacola flutuante (nas bebidas, onde não há botão de adicionar no rodapé) */}
      <AnimatePresence>
        {aba === "outros" && quantidade > 0 && (
          <motion.div
            className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <button
              type="button"
              onClick={() => setFolha("carrinho")}
              className="mx-auto flex h-14 w-full max-w-lg items-center gap-3 rounded-2xl bg-marca-600 px-4 font-bold text-white shadow-[0_12px_28px_-10px_rgb(201_53_26/0.8)]"
            >
              <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-white/20 px-1.5 text-sm tabular">{quantidade}</span>
              <span className="flex-1 text-left">Ver sacola</span>
              <span className="tabular">{cotacao.ok ? formatarReais(cotacao.subtotalCentavos) : ""}</span>
              <ChevronRight className="size-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {folha === "carrinho" && (
          <Folha
            key="carrinho"
            titulo="Sua sacola"
            aoFechar={() => setFolha(null)}
            rodape={
              itens.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-stone-500">Subtotal</span>
                    <span className="text-lg font-extrabold tabular">{cotacao.ok ? formatarReais(cotacao.subtotalCentavos) : "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        trocarAba(livreId ? "livre" : "sabores");
                        setFolha(null);
                      }}
                      className="h-13 rounded-2xl bg-stone-100 px-4 text-sm font-bold text-stone-800"
                    >
                      + Pizza
                    </button>
                    <button
                      type="button"
                      disabled={!cotacao.ok}
                      onClick={() => setFolha("dados")}
                      className="flex h-13 flex-1 items-center justify-center gap-1 rounded-2xl bg-marca-600 font-bold text-white shadow-[0_10px_24px_-10px_rgb(201_53_26/0.8)] disabled:bg-stone-300 disabled:shadow-none"
                    >
                      {cotacao.ok ? "Continuar" : "Revise os itens"} <ChevronRight className="size-5" />
                    </button>
                  </div>
                </div>
              )
            }
          >
            <ListaCarrinho
              itens={itens}
              precos={precos}
              catalogo={catalogo}
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
          <Folha key="dados" titulo="Finalizar pedido" aoFechar={() => setFolha("carrinho")}>
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
