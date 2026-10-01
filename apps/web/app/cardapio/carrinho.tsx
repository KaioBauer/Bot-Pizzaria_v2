"use client";

import { Check, MessageCircle, Minus, Plus, Search, Send, ShoppingBag, Trash2, X } from "lucide-react";
import { createContext, use, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { precificarItens } from "@pizzaria/core/precificacao";
import {
  formatarReais,
  type CategoriaCardapio,
  type ItemPedidoArgs,
  type ProdutoCardapio,
  type TamanhoPizza,
  type VariacaoParaPreco,
} from "@pizzaria/shared";
import { cn } from "../../components/ui";
import { enviarCarrinhoAction } from "./actions";

/**
 * Montar o pedido no cardápio e enviar ao bot do Telegram. O preço mostrado
 * aqui usa a mesma precificação do servidor (core/precificacao), mas é só
 * prévia: o bot reprecifica tudo a partir dos IDs.
 */

const CHAVE_ARMAZENAMENTO = "vianna:carrinho:v1";

interface OpcaoTamanho {
  nome: string;
  fatias: number | null;
  maxSabores: number;
  aPartirDeCentavos: number;
}

interface Catalogo {
  variacoes: Map<string, VariacaoParaPreco>;
  produtos: Map<string, ProdutoCardapio>;
  /** Categorias com pizzas (produtos com variação de tamanho). */
  pizzas: { nome: string; produtos: ProdutoCardapio[] }[];
  opcoesTamanho: OpcaoTamanho[];
  tamanhos: TamanhoPizza[];
}

const ehPizza = (p: ProdutoCardapio) => p.variacoes.some((v) => v.tipo === "tamanho");
const vendaveis = (p: ProdutoCardapio) => p.variacoes.filter((v) => v.tipo === "tamanho" || v.tipo === "padrao");
const mesmoNome = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function montarCatalogo(categorias: CategoriaCardapio[], tamanhos: TamanhoPizza[]): Catalogo {
  const variacoes = new Map<string, VariacaoParaPreco>();
  const produtos = new Map<string, ProdutoCardapio>();
  for (const p of categorias.flatMap((c) => c.produtos)) {
    produtos.set(p.id, p);
    for (const v of p.variacoes) {
      variacoes.set(v.id, { ...v, ativa: true, produtoId: p.id, produtoNome: p.nome, produtoAtivo: true });
    }
  }
  const pizzas = categorias.map((c) => ({ nome: c.nome, produtos: c.produtos.filter(ehPizza) })).filter((c) => c.produtos.length);

  // Tamanhos na ordem cadastrada; tamanhos sem cadastro (cardápio antigo) vão no fim.
  const precosPorTamanho = new Map<string, number[]>();
  for (const v of pizzas.flatMap((c) => c.produtos).flatMap((p) => p.variacoes)) {
    if (v.tipo !== "tamanho") continue;
    const chave = v.nome.toLowerCase();
    precosPorTamanho.set(chave, [...(precosPorTamanho.get(chave) ?? []), v.precoCentavos]);
  }
  const opcoesTamanho: OpcaoTamanho[] = tamanhos
    .filter((t) => precosPorTamanho.has(t.nome.toLowerCase()))
    .map((t) => ({ nome: t.nome, fatias: t.fatias, maxSabores: t.maxSabores, aPartirDeCentavos: t.precoBaseCentavos }));
  for (const [chave, precos] of precosPorTamanho) {
    if (opcoesTamanho.some((o) => o.nome.toLowerCase() === chave)) continue;
    const nome = pizzas.flatMap((c) => c.produtos).flatMap((p) => p.variacoes).find((v) => v.tipo === "tamanho" && v.nome.toLowerCase() === chave)!.nome;
    opcoesTamanho.push({ nome, fatias: null, maxSabores: 2, aPartirDeCentavos: Math.min(...precos) });
  }
  return { variacoes, produtos, pizzas, opcoesTamanho, tamanhos };
}

function precificar(item: ItemPedidoArgs, catalogo: Catalogo) {
  const r = precificarItens([item], catalogo.variacoes, catalogo.tamanhos);
  return r.ok ? { ok: true as const, ...r.itens[0]! } : { ok: false as const, erro: r.erros[0]?.replace(/^Item 1: /, "") ?? "Item inválido" };
}

/** Itens iguais (exceto quantidade) se somam no carrinho. */
const assinatura = (i: ItemPedidoArgs) => JSON.stringify([i.sabores, [...i.adicionais].sort(), i.observacao ?? ""]);

// Contexto ------------------------------------------------------------------------

interface ValorCarrinho {
  habilitado: boolean;
  abrirMontador: (produtoId: string) => void;
}

const ContextoCarrinho = createContext<ValorCarrinho>({ habilitado: false, abrirMontador: () => {} });

export function BotaoAdicionar({ produto }: { produto: ProdutoCardapio }) {
  const { habilitado, abrirMontador } = use(ContextoCarrinho);
  if (!habilitado || vendaveis(produto).length === 0) return null;
  const pizza = ehPizza(produto);
  return (
    <button
      type="button"
      onClick={() => abrirMontador(produto.id)}
      className="mt-2 inline-flex h-8 items-center gap-1 rounded-full bg-marca-50 px-3 text-sm font-semibold text-marca-700 ring-1 ring-marca-200 ring-inset transition hover:bg-marca-100 active:scale-95"
      aria-label={`${pizza ? "Montar pizza com" : "Adicionar"} ${produto.nome}`}
    >
      <Plus className="size-4" /> {pizza ? "Montar pizza" : "Adicionar"}
    </button>
  );
}

// Folha (bottom sheet no celular, modal centralizado no computador) ----------------

function Folha({ titulo, aoFechar, children, rodape }: { titulo: string; aoFechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  });
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar.current();
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", tecla);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-stone-950/50 backdrop-blur-[2px]" onClick={aoFechar} aria-hidden />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-creme-50 shadow-elevada sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-creme-200 px-5 py-4">
          <h2 className="flex-1 font-display text-xl font-semibold">{titulo}</h2>
          <button type="button" onClick={aoFechar} className="flex size-9 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200/60" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {rodape && <div className="border-t border-creme-200 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{rodape}</div>}
      </div>
    </div>
  );
}

function Passo({ titulo, detalhe, children }: { titulo: string; detalhe?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-3 first:pt-0">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h3 className="font-semibold text-stone-900">{titulo}</h3>
        {detalhe && <span className="text-sm text-stone-500">{detalhe}</span>}
      </div>
      {children}
    </section>
  );
}

function Quantidade({ valor, aoMudar, min = 1 }: { valor: number; aoMudar: (n: number) => void; min?: number }) {
  return (
    <div className="inline-flex items-center rounded-full bg-white ring-1 ring-stone-900/10">
      <button type="button" onClick={() => aoMudar(Math.max(min, valor - 1))} className="flex size-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100" aria-label="Diminuir">
        <Minus className="size-4" />
      </button>
      <span className="w-7 text-center font-semibold tabular">{valor}</span>
      <button type="button" onClick={() => aoMudar(Math.min(50, valor + 1))} className="flex size-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100" aria-label="Aumentar">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

const estiloOpcao = (marcada: boolean, desabilitada = false) =>
  cn(
    "flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 transition",
    marcada ? "ring-2 ring-marca-600" : "ring-stone-900/10 hover:ring-stone-900/25",
    desabilitada && "cursor-not-allowed opacity-45 hover:ring-stone-900/10"
  );

function Marcador({ marcada, redondo }: { marcada: boolean; redondo?: boolean }) {
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center border-2", redondo ? "rounded-full" : "rounded-md", marcada ? "border-marca-600 bg-marca-600 text-white" : "border-stone-300")}>
      {marcada && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

// Montador -------------------------------------------------------------------------

function MontadorPizza({ catalogo, produtoInicial, aoAdicionar, aoFechar }: { catalogo: Catalogo; produtoInicial: ProdutoCardapio; aoAdicionar: (i: ItemPedidoArgs) => void; aoFechar: () => void }) {
  const temTamanho = (p: ProdutoCardapio, tamanho: string) => p.variacoes.some((v) => v.tipo === "tamanho" && mesmoNome(v.nome, tamanho));
  const inicial =
    catalogo.opcoesTamanho.find((o) => mesmoNome(o.nome, "Grande") && temTamanho(produtoInicial, o.nome)) ??
    catalogo.opcoesTamanho.find((o) => temTamanho(produtoInicial, o.nome))!;
  const [tamanho, setTamanho] = useState(inicial.nome);
  const [sabores, setSabores] = useState([produtoInicial.id]);
  const [borda, setBorda] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [busca, setBusca] = useState("");

  const opcao = catalogo.opcoesTamanho.find((o) => mesmoNome(o.nome, tamanho))!;
  const produtosSabores = sabores.map((id) => catalogo.produtos.get(id)!);
  const bordas = produtosSabores[0]?.variacoes.filter((v) => v.tipo === "borda") ?? [];
  const cheio = sabores.length >= opcao.maxSabores;

  function escolherTamanho(nome: string) {
    const max = catalogo.opcoesTamanho.find((o) => mesmoNome(o.nome, nome))!.maxSabores;
    setTamanho(nome);
    setSabores((s) => s.filter((id) => temTamanho(catalogo.produtos.get(id)!, nome)).slice(0, max));
  }

  function alternarSabor(id: string) {
    setSabores((s) => (s.includes(id) ? (s.length > 1 ? s.filter((x) => x !== id) : s) : s.length < opcao.maxSabores ? [...s, id] : s));
  }

  const item: ItemPedidoArgs = {
    sabores: produtosSabores.map((p) => ({ produto_id: p.id, variacao_id: p.variacoes.find((v) => v.tipo === "tamanho" && mesmoNome(v.nome, tamanho))!.id })),
    adicionais: borda ? bordas.filter((b) => b.nome === borda).map((b) => b.id) : [],
    quantidade,
    observacao: observacao.trim() || null,
  };
  const preco = sabores.length ? precificar(item, catalogo) : null;

  const termo = busca.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const combina = (p: ProdutoCardapio) => !termo || `${p.nome} ${p.descricao ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(termo);

  return (
    <Folha
      titulo="Monte sua pizza"
      aoFechar={aoFechar}
      rodape={
        <div className="flex items-center gap-3">
          <Quantidade valor={quantidade} aoMudar={setQuantidade} />
          <button
            type="button"
            disabled={!preco?.ok}
            onClick={() => aoAdicionar(item)}
            className="flex h-12 flex-1 items-center justify-between gap-2 rounded-2xl bg-marca-600 px-5 font-bold text-white shadow-sm transition hover:bg-marca-700 disabled:opacity-50"
          >
            <span>Adicionar</span>
            <span className="tabular">{preco?.ok ? formatarReais(preco.subtotalCentavos) : "—"}</span>
          </button>
        </div>
      }
    >
      <Passo titulo="1. Tamanho">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {catalogo.opcoesTamanho.map((o) => {
            const marcada = mesmoNome(o.nome, tamanho);
            return (
              <button key={o.nome} type="button" onClick={() => escolherTamanho(o.nome)} className={cn(estiloOpcao(marcada), "flex-col items-start gap-0.5")} aria-pressed={marcada}>
                <span className="font-semibold">{o.nome}</span>
                <span className="text-xs text-stone-500">
                  {o.fatias ? `${o.fatias} fatias · ` : ""}
                  {o.maxSabores === 1 ? "1 sabor" : `até ${o.maxSabores} sabores`}
                </span>
                <span className="text-sm font-semibold text-marca-700 tabular">{formatarReais(o.aPartirDeCentavos)}</span>
              </button>
            );
          })}
        </div>
      </Passo>

      <Passo titulo="2. Sabores" detalhe={`${sabores.length} de ${opcao.maxSabores}`}>
        <div className="mb-3 flex flex-wrap gap-2">
          {produtosSabores.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-marca-600 py-1 pr-1.5 pl-3 text-sm font-semibold text-white">
              {p.nome}
              {sabores.length > 1 && (
                <button type="button" onClick={() => alternarSabor(p.id)} className="rounded-full p-0.5 hover:bg-white/20" aria-label={`Tirar ${p.nome}`}>
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
        {opcao.maxSabores > 1 && (
          <>
            <label className="relative mb-3 block">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={cheio ? "Limite de sabores atingido" : "Buscar sabor ou ingrediente"}
                className="h-11 w-full rounded-2xl bg-white pr-4 pl-10 text-sm ring-1 ring-stone-900/10 outline-none focus:ring-2 focus:ring-marca-600"
              />
            </label>
            <div className="space-y-4">
              {catalogo.pizzas.map((categoria) => {
                const lista = categoria.produtos.filter((p) => temTamanho(p, tamanho) && combina(p));
                if (!lista.length) return null;
                return (
                  <div key={categoria.nome}>
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase">{categoria.nome}</p>
                    <ul className="space-y-1.5">
                      {lista.map((p) => {
                        const marcada = sabores.includes(p.id);
                        const desabilitada = !marcada && cheio;
                        const preco = p.variacoes.find((v) => v.tipo === "tamanho" && mesmoNome(v.nome, tamanho))!.precoCentavos;
                        const base = catalogo.tamanhos.find((t) => mesmoNome(t.nome, tamanho))?.precoBaseCentavos;
                        const extra = base !== undefined ? preco - base : null;
                        return (
                          <li key={p.id}>
                            <button type="button" onClick={() => alternarSabor(p.id)} disabled={desabilitada} className={estiloOpcao(marcada, desabilitada)} aria-pressed={marcada}>
                              <Marcador marcada={marcada} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold">{p.nome}</span>
                                {p.descricao && <span className="line-clamp-1 text-xs text-stone-500">{p.descricao}</span>}
                              </span>
                              <span className="shrink-0 text-xs font-semibold text-stone-600 tabular">
                                {extra === null ? formatarReais(preco) : extra > 0 ? `+ ${formatarReais(extra)}` : ""}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Passo>

      {bordas.length > 0 && (
        <Passo titulo="3. Borda" detalhe="opcional">
          <div className="space-y-1.5">
            {[null, ...bordas.map((b) => b.nome)].map((nome) => {
              const b = bordas.find((x) => x.nome === nome);
              const marcada = borda === nome;
              return (
                <button key={nome ?? "sem"} type="button" onClick={() => setBorda(nome)} className={estiloOpcao(marcada)} aria-pressed={marcada}>
                  <Marcador marcada={marcada} redondo />
                  <span className="flex-1 text-sm font-semibold">{nome ?? "Sem borda"}</span>
                  {b && <span className="text-xs font-semibold text-stone-600 tabular">+ {formatarReais(b.precoCentavos)}</span>}
                </button>
              );
            })}
          </div>
        </Passo>
      )}

      <Passo titulo={`${bordas.length ? 4 : 3}. Observação`} detalhe="opcional">
        <input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value.slice(0, 200))}
          placeholder="Ex.: sem cebola, bem assada"
          className="h-11 w-full rounded-2xl bg-white px-4 text-sm ring-1 ring-stone-900/10 outline-none focus:ring-2 focus:ring-marca-600"
        />
      </Passo>
      {preco && !preco.ok && <p className="pb-2 text-sm font-medium text-red-700">{preco.erro}</p>}
    </Folha>
  );
}

function MontadorSimples({ catalogo, produto, aoAdicionar, aoFechar }: { catalogo: Catalogo; produto: ProdutoCardapio; aoAdicionar: (i: ItemPedidoArgs) => void; aoFechar: () => void }) {
  const opcoes = vendaveis(produto);
  const [variacao, setVariacao] = useState(opcoes[0]!.id);
  const [quantidade, setQuantidade] = useState(1);
  const item: ItemPedidoArgs = { sabores: [{ produto_id: produto.id, variacao_id: variacao }], adicionais: [], quantidade, observacao: null };
  const preco = precificar(item, catalogo);

  return (
    <Folha
      titulo={produto.nome}
      aoFechar={aoFechar}
      rodape={
        <div className="flex items-center gap-3">
          <Quantidade valor={quantidade} aoMudar={setQuantidade} />
          <button type="button" disabled={!preco.ok} onClick={() => aoAdicionar(item)} className="flex h-12 flex-1 items-center justify-between gap-2 rounded-2xl bg-marca-600 px-5 font-bold text-white shadow-sm transition hover:bg-marca-700 disabled:opacity-50">
            <span>Adicionar</span>
            <span className="tabular">{preco.ok ? formatarReais(preco.subtotalCentavos) : "—"}</span>
          </button>
        </div>
      }
    >
      {produto.descricao && <p className="mb-3 text-sm text-stone-600">{produto.descricao}</p>}
      {opcoes.length > 1 && (
        <div className="space-y-1.5">
          {opcoes.map((v) => (
            <button key={v.id} type="button" onClick={() => setVariacao(v.id)} className={estiloOpcao(variacao === v.id)} aria-pressed={variacao === v.id}>
              <Marcador marcada={variacao === v.id} redondo />
              <span className="flex-1 text-sm font-semibold">{v.nome}</span>
              <span className="text-sm font-semibold tabular">{formatarReais(v.precoCentavos)}</span>
            </button>
          ))}
        </div>
      )}
    </Folha>
  );
}

// Carrinho ---------------------------------------------------------------------------

export function Carrinho({
  categorias,
  tamanhos,
  aberta,
  telegramHabilitado,
  linkWhatsapp,
  linkTelegram,
  children,
}: {
  categorias: CategoriaCardapio[];
  tamanhos: TamanhoPizza[];
  aberta: boolean;
  telegramHabilitado: boolean;
  /** Botões de chat mostrados com o carrinho vazio. */
  linkWhatsapp: string | null;
  linkTelegram: string | null;
  children: ReactNode;
}) {
  const catalogo = useMemo(() => montarCatalogo(categorias, tamanhos), [categorias, tamanhos]);
  const [itens, setItens] = useState<ItemPedidoArgs[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [montando, setMontando] = useState<string | null>(null);
  const [sacolaAberta, setSacolaAberta] = useState(false);
  const [enviando, iniciarEnvio] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [linkEnviado, setLinkEnviado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Carrinho salvo neste navegador (sobrevive a recarregar a página). Itens que
  // saíram do cardápio somem sozinhos.
  useEffect(() => {
    try {
      const salvos: unknown = JSON.parse(localStorage.getItem(CHAVE_ARMAZENAMENTO) ?? "[]");
      if (Array.isArray(salvos)) setItens(salvos.filter((i: ItemPedidoArgs) => precificar(i, catalogo).ok));
    } catch {
      /* sem armazenamento: carrinho só na memória */
    }
    setCarregado(true);
  }, [catalogo]);

  useEffect(() => {
    if (!carregado) return;
    try {
      localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(itens));
    } catch {
      /* ignora */
    }
  }, [itens, carregado]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2200);
    return () => clearTimeout(t);
  }, [aviso]);

  const precificados = itens.map((i) => ({ item: i, preco: precificar(i, catalogo) }));
  const subtotal = precificados.reduce((s, p) => s + (p.preco.ok ? p.preco.subtotalCentavos : 0), 0);
  const quantidadeTotal = itens.reduce((s, i) => s + i.quantidade, 0);

  function adicionar(novo: ItemPedidoArgs) {
    setItens((atual) => {
      const igual = atual.findIndex((i) => assinatura(i) === assinatura(novo));
      if (igual === -1) return [...atual, novo];
      return atual.map((i, n) => (n === igual ? { ...i, quantidade: Math.min(50, i.quantidade + novo.quantidade) } : i));
    });
    setMontando(null);
    setLinkEnviado(null);
    setAviso("Adicionado ao pedido");
  }

  function mudarQuantidade(indice: number, quantidade: number) {
    setItens((atual) => (quantidade <= 0 ? atual.filter((_, n) => n !== indice) : atual.map((i, n) => (n === indice ? { ...i, quantidade } : i))));
  }

  function enviar() {
    setErro(null);
    iniciarEnvio(async () => {
      const r = await enviarCarrinhoAction(itens);
      if (!r.ok) return setErro(r.erro);
      setLinkEnviado(r.link);
      setItens([]);
      window.location.href = r.link;
    });
  }

  const produtoMontando = montando ? catalogo.produtos.get(montando) : undefined;

  return (
    <ContextoCarrinho value={{ habilitado: telegramHabilitado, abrirMontador: setMontando }}>
      {children}

      {quantidadeTotal > 0 || linkEnviado ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200/80 bg-white/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button type="button" onClick={() => setSacolaAberta(true)} className="flex h-13 w-full items-center gap-3 rounded-2xl bg-stone-950 px-5 font-bold text-white shadow-sm transition hover:bg-stone-800">
              <span className="relative">
                <ShoppingBag className="size-5" />
                {quantidadeTotal > 0 && <span className="absolute -top-2 -right-2.5 flex size-5 items-center justify-center rounded-full bg-marca-500 text-[11px] tabular">{quantidadeTotal}</span>}
              </span>
              <span className="flex-1 text-left">{quantidadeTotal > 0 ? "Ver meu pedido" : "Pedido enviado"}</span>
              {quantidadeTotal > 0 && <span className="tabular">{formatarReais(subtotal)}</span>}
            </button>
          </div>
        </div>
      ) : (
        (linkWhatsapp || linkTelegram) && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200/80 bg-white/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            <div className="mx-auto flex max-w-2xl gap-2">
              {linkWhatsapp && (
                <a href={linkWhatsapp} className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-bold text-white shadow-sm transition hover:brightness-95">
                  <MessageCircle className="size-5" /> Pedir no WhatsApp
                </a>
              )}
              {linkTelegram && (
                <a href={linkTelegram} className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#229ED9] font-bold text-white shadow-sm transition hover:brightness-95">
                  <Send className="size-5" /> Pedir no Telegram
                </a>
              )}
            </div>
          </div>
        )
      )}

      {aviso && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <p className="flex items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white shadow-elevada">
            <Check className="size-4 text-manjericao-400" /> {aviso}
          </p>
        </div>
      )}

      {produtoMontando &&
        (ehPizza(produtoMontando) ? (
          <MontadorPizza catalogo={catalogo} produtoInicial={produtoMontando} aoAdicionar={adicionar} aoFechar={() => setMontando(null)} />
        ) : (
          <MontadorSimples catalogo={catalogo} produto={produtoMontando} aoAdicionar={adicionar} aoFechar={() => setMontando(null)} />
        ))}

      {sacolaAberta && (
        <Folha
          titulo="Seu pedido"
          aoFechar={() => setSacolaAberta(false)}
          rodape={
            linkEnviado ? (
              <a href={linkEnviado} className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#229ED9] font-bold text-white shadow-sm transition hover:brightness-95">
                <Send className="size-5" /> Abrir o Telegram
              </a>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-stone-500">Subtotal</span>
                  <span className="font-display text-2xl font-semibold tabular">{formatarReais(subtotal)}</span>
                </div>
                {erro && <p role="alert" className="text-sm font-medium text-red-700">{erro}</p>}
                <button
                  type="button"
                  onClick={enviar}
                  disabled={enviando || !aberta || itens.length === 0}
                  className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#229ED9] font-bold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
                >
                  <Send className="size-5" /> {enviando ? "Enviando..." : "Enviar pelo Telegram"}
                </button>
                <p className="text-center text-xs text-stone-500">
                  {aberta ? "Entrega ou retirada e pagamento você escolhe na conversa." : "Estamos fechados agora. Seu pedido fica salvo aqui para enviar quando abrirmos."}
                </p>
              </div>
            )
          }
        >
          {linkEnviado ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-manjericao-100 text-manjericao-700">
                <Check className="size-7" strokeWidth={3} />
              </span>
              <p className="mt-4 font-display text-xl font-semibold">Pedido enviado!</p>
              <p className="mt-1 text-sm text-stone-600">Continue no Telegram: confirme entrega ou retirada e a forma de pagamento. Se o Telegram não abriu, toque no botão abaixo.</p>
            </div>
          ) : itens.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-500">Seu pedido está vazio.</p>
          ) : (
            <ul className="divide-y divide-creme-200">
              {precificados.map(({ item, preco }, n) => (
                <li key={n} className="flex items-start gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-stone-900">{preco.ok ? preco.descricao : "Item indisponível"}</p>
                    {item.observacao && <p className="text-xs text-stone-500 italic">{item.observacao}</p>}
                    <p className="mt-1 text-sm font-semibold text-marca-700 tabular">{preco.ok ? formatarReais(preco.subtotalCentavos) : preco.erro}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {item.quantidade === 1 ? (
                      <button type="button" onClick={() => mudarQuantidade(n, 0)} className="flex size-9 items-center justify-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label="Remover">
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                    <Quantidade valor={item.quantidade} aoMudar={(q) => mudarQuantidade(n, q)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Folha>
      )}
    </ContextoCarrinho>
  );
}
