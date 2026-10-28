"use client";

import { Check, ChevronRight, CupSoda, MessageCircle, Minus, Plus, Search, Send, ShoppingBag, Trash2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, use, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { precificarItens } from "@pizzaria/core/precificacao";
import {
  formatarReais,
  type Canal,
  type CategoriaCardapio,
  type ItemPedidoArgs,
  type ProdutoCardapio,
  type TamanhoPizza,
  type VariacaoParaPreco,
} from "@pizzaria/shared";
import { CAMADAS_BASE, miniaturaDoSabor } from "../../components/pizza-builder/biblioteca";
import { cn, Logo } from "../../components/ui";
import { Folha } from "../pedir/folha";
import { enviarCarrinhoAction } from "./actions";

/**
 * Montar o pedido no cardápio e enviar ao bot do Telegram. O preço mostrado
 * aqui usa a mesma precificação do servidor (core/precificacao), mas é só
 * prévia: o bot reprecifica tudo a partir dos IDs.
 */

const CHAVE_ARMAZENAMENTO = "vianna:carrinho:v1";
const rotuloCanal: Record<Canal, string> = { telegram: "Telegram", whatsapp: "WhatsApp" };
const estiloCanal: Record<Canal, string> = {
  telegram: "bg-[#229ED9] shadow-[0_10px_24px_-10px_rgb(34_158_217/0.8)]",
  whatsapp: "bg-[#25D366] shadow-[0_10px_24px_-10px_rgb(37_211_102/0.8)]",
};
const SOMBRA_MARCA = "shadow-[0_10px_24px_-10px_rgb(201_53_26/0.8)]";
const CAMPO = "h-12 w-full rounded-2xl bg-white px-4 text-[15px] ring-1 ring-stone-200 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-marca-400";

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

// Peças visuais -------------------------------------------------------------------

/** Miniatura redonda: foto, ilustração do recheio (pizza) ou ícone. */
function Miniatura({ produto, className }: { produto: ProdutoCardapio | undefined; className?: string }) {
  const pizza = produto ? ehPizza(produto) : false;
  const recheio = produto && pizza && !produto.imagemUrl ? miniaturaDoSabor(produto.descricao, produto.nome) : null;
  return (
    <span aria-hidden className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_30%,#fffaf0,#efe2c8)]", className)}>
      {produto?.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={produto.imagemUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : pizza ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CAMADAS_BASE.massaAssada} alt="" loading="lazy" className="absolute size-[92%] object-contain" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {recheio && <img src={recheio} alt="" loading="lazy" className="relative size-[66%] object-contain" />}
        </>
      ) : (
        <CupSoda className="size-1/2 text-marca-600/70" />
      )}
    </span>
  );
}

function Etiqueta({ tom, children }: { tom: "escuro" | "claro" | "marca" | "ok"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-lg px-2 py-1 text-[10.5px] font-extrabold tracking-wide uppercase tabular",
        tom === "escuro" && "bg-stone-900 text-white",
        tom === "claro" && "bg-stone-100 text-stone-500",
        tom === "marca" && "bg-marca-50 text-marca-700",
        tom === "ok" && "bg-manjericao-50 text-manjericao-700"
      )}
    >
      {children}
    </span>
  );
}

/** Bloco do montador, como os grupos de opções do /pedir. */
function Bloco({ titulo, detalhe, etiqueta, children }: { titulo: string; detalhe?: string; etiqueta?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-stone-50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] leading-tight font-extrabold tracking-tight">{titulo}</h3>
          {detalhe && <p className="mt-0.5 text-[12.5px] text-stone-500">{detalhe}</p>}
        </div>
        {etiqueta}
      </div>
      {children}
    </section>
  );
}

/** Contador grande do rodapé das folhas (mesmo do /pedir). */
function Quantidade({ valor, aoMudar }: { valor: number; aoMudar: (n: number) => void }) {
  return (
    <div className="flex h-14 items-center rounded-2xl bg-stone-100">
      <button type="button" onClick={() => aoMudar(Math.max(1, valor - 1))} disabled={valor <= 1} className="flex size-11 items-center justify-center text-marca-600 disabled:text-stone-300" aria-label="Diminuir quantidade">
        <Minus className="size-4" strokeWidth={2.75} />
      </button>
      <span className="w-5 text-center font-extrabold tabular">{valor}</span>
      <button type="button" onClick={() => aoMudar(Math.min(50, valor + 1))} className="flex size-11 items-center justify-center text-marca-600" aria-label="Aumentar quantidade">
        <Plus className="size-4" strokeWidth={2.75} />
      </button>
    </div>
  );
}

function BotaoConfirmar({ disabled, onClick, rotulo, valor }: { disabled: boolean; onClick: () => void; rotulo: string; valor: string }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      disabled={disabled}
      onClick={onClick}
      className={cn("flex h-14 flex-1 items-center justify-between gap-2 rounded-2xl bg-marca-600 px-5 font-bold text-white transition disabled:bg-stone-300 disabled:shadow-none", SOMBRA_MARCA)}
    >
      <span>{rotulo}</span>
      <span className="tabular">{valor}</span>
    </motion.button>
  );
}

/** Linha de opção selecionável dentro de um bloco. */
const estiloOpcao = (marcada: boolean, desabilitada = false) =>
  cn(
    "flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left transition",
    marcada ? "ring-2 ring-marca-500" : "ring-1 ring-stone-200 hover:ring-stone-300",
    desabilitada && "cursor-not-allowed opacity-45 hover:ring-stone-200"
  );

function Marcador({ marcada, redondo }: { marcada: boolean; redondo?: boolean }) {
  return (
    <span className={cn("flex size-6 shrink-0 items-center justify-center border-2 transition", redondo ? "rounded-full" : "rounded-lg", marcada ? "border-marca-600 bg-marca-600 text-white" : "border-stone-300 bg-white")}>
      {marcada && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

// Contexto ------------------------------------------------------------------------

interface ValorCarrinho {
  habilitado: boolean;
  abrirMontador: (produtoId: string) => void;
}

const ContextoCarrinho = createContext<ValorCarrinho>({ habilitado: false, abrirMontador: () => {} });

/** "+" vermelho sobre a miniatura; o cartão inteiro também abre o montador. */
export function BotaoAdicionar({ produto }: { produto: ProdutoCardapio }) {
  const { habilitado, abrirMontador } = use(ContextoCarrinho);
  if (!habilitado || vendaveis(produto).length === 0) return null;
  const pizza = ehPizza(produto);
  return (
    <>
      <button type="button" tabIndex={-1} aria-hidden onClick={() => abrirMontador(produto.id)} className="absolute inset-0 rounded-3xl" />
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={() => abrirMontador(produto.id)}
        className={cn("absolute top-[78px] right-1.5 flex size-9 items-center justify-center rounded-full bg-marca-600 text-white ring-4 ring-white", "shadow-[0_4px_10px_-4px_rgb(201_53_26/0.8)]")}
        aria-label={`${pizza ? "Montar pizza com" : "Adicionar"} ${produto.nome}`}
      >
        <Plus className="size-4.5" strokeWidth={2.75} />
      </motion.button>
    </>
  );
}

/** Chips das categorias, fixos no topo, com destaque da seção visível. */
export function ChipsCategorias({ categorias }: { categorias: { id: string; nome: string }[] }) {
  const [ativa, setAtiva] = useState(categorias[0]?.id ?? "");
  const trilho = useRef<HTMLDivElement>(null);
  const reduzido = useReducedMotion();

  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      // Seção ativa: a última cujo topo já passou da barra (app + chips).
      let atual = categorias[0]?.id ?? "";
      for (const c of categorias) {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top <= 150) atual = c.id;
      }
      setAtiva(atual);
    };
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      window.removeEventListener("scroll", aoRolar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [categorias]);

  // Mantém o chip ativo visível no trilho horizontal.
  useEffect(() => {
    const chip = trilho.current?.querySelector<HTMLElement>(`[data-cat="${ativa}"]`);
    const t = trilho.current;
    if (!chip || !t) return;
    t.scrollTo({ left: chip.offsetLeft - t.clientWidth / 2 + chip.clientWidth / 2, behavior: reduzido ? "auto" : "smooth" });
  }, [ativa, reduzido]);

  return (
    <nav className="sticky top-16 z-30 -mx-4 mt-4 bg-[#f6f3ee]/90 backdrop-blur-xl" aria-label="Categorias">
      <div ref={trilho} className="sem-barra relative flex gap-2 overflow-x-auto px-4 py-2.5">
        {categorias.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            data-cat={c.id}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(c.id)?.scrollIntoView({ behavior: reduzido ? "auto" : "smooth", block: "start" });
              history.replaceState(null, "", `#${c.id}`);
            }}
            aria-current={ativa === c.id ? "true" : undefined}
            className={cn(
              "relative shrink-0 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
              ativa === c.id ? "text-white" : "bg-white text-stone-600 shadow-[0_1px_3px_rgb(0_0_0/0.06)] hover:text-stone-900"
            )}
          >
            {ativa === c.id && <motion.span layoutId="categoria-ativa" className="absolute inset-0 rounded-full bg-stone-900" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative">{c.nome}</span>
          </a>
        ))}
      </div>
    </nav>
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
        <div className="space-y-2">
          {preco && !preco.ok && <p className="text-sm font-medium text-marca-700">{preco.erro}</p>}
          <div className="flex items-center gap-3">
            <Quantidade valor={quantidade} aoMudar={setQuantidade} />
            <BotaoConfirmar disabled={!preco?.ok} onClick={() => aoAdicionar(item)} rotulo="Adicionar" valor={preco?.ok ? formatarReais(preco.subtotalCentavos) : "—"} />
          </div>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        {/* Sabor escolhido em destaque */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex -space-x-5">
            {produtosSabores.map((p) => (
              <Miniatura key={p.id} produto={p} className="size-16 ring-4 ring-white" />
            ))}
          </div>
          <div className="min-w-0">
            <p className="text-[15px] leading-snug font-extrabold tracking-tight">{produtosSabores.map((p) => p.nome).join(" + ")}</p>
            <p className="text-xs text-stone-500">
              {opcao.nome}
              {opcao.fatias ? ` · ${opcao.fatias} fatias` : ""}
            </p>
          </div>
        </div>

        <Bloco titulo="Tamanho" etiqueta={<Etiqueta tom="escuro">Obrigatório</Etiqueta>}>
          <div className="grid grid-cols-2 gap-2">
            {catalogo.opcoesTamanho.map((o) => {
              const marcada = mesmoNome(o.nome, tamanho);
              return (
                <button
                  key={o.nome}
                  type="button"
                  onClick={() => escolherTamanho(o.nome)}
                  aria-pressed={marcada}
                  className={cn("flex flex-col items-start rounded-2xl px-3.5 py-3 text-left transition", marcada ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200 hover:ring-stone-300")}
                >
                  <span className="font-extrabold tracking-tight">{o.nome}</span>
                  <span className={cn("text-[11.5px]", marcada ? "text-stone-300" : "text-stone-500")}>
                    {o.fatias ? `${o.fatias} fatias · ` : ""}
                    {o.maxSabores === 1 ? "1 sabor" : `até ${o.maxSabores} sabores`}
                  </span>
                  <span className={cn("mt-1 text-sm font-bold tabular", marcada ? "text-marca-200" : "text-marca-700")}>{formatarReais(o.aPartirDeCentavos)}</span>
                </button>
              );
            })}
          </div>
        </Bloco>

        <Bloco
          titulo="Sabores"
          detalhe={opcao.maxSabores > 1 ? "Misture sabores diferentes na mesma pizza" : undefined}
          etiqueta={<Etiqueta tom={cheio ? "ok" : "marca"}>{`${sabores.length}/${opcao.maxSabores}`}</Etiqueta>}
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            {produtosSabores.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-stone-900 py-1.5 pr-1.5 pl-3 text-[13px] font-bold text-white">
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
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-stone-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={cheio ? "Limite de sabores atingido" : "Buscar sabor ou ingrediente"} className={cn(CAMPO, "pl-10")} />
              </label>
              <div className="space-y-4">
                {catalogo.pizzas.map((categoria) => {
                  const lista = categoria.produtos.filter((p) => temTamanho(p, tamanho) && combina(p));
                  if (!lista.length) return null;
                  return (
                    <div key={categoria.nome}>
                      <p className="mb-1.5 px-1 text-[11px] font-extrabold tracking-wide text-stone-500 uppercase">{categoria.nome}</p>
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
                                <Miniatura produto={p} className="size-11" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold">{p.nome}</span>
                                  {p.descricao && <span className="line-clamp-1 text-xs text-stone-500">{p.descricao}</span>}
                                </span>
                                <span className="shrink-0 text-xs font-bold text-stone-600 tabular">
                                  {extra === null ? formatarReais(preco) : extra > 0 ? `+ ${formatarReais(extra)}` : ""}
                                </span>
                                <Marcador marcada={marcada} />
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
        </Bloco>

        {bordas.length > 0 && (
          <Bloco titulo="Borda recheada" etiqueta={<Etiqueta tom="claro">Opcional</Etiqueta>}>
            <div className="space-y-1.5">
              {[null, ...bordas.map((b) => b.nome)].map((nome) => {
                const b = bordas.find((x) => x.nome === nome);
                const marcada = borda === nome;
                return (
                  <button key={nome ?? "sem"} type="button" onClick={() => setBorda(nome)} className={cn(estiloOpcao(marcada), "py-3")} aria-pressed={marcada}>
                    <Marcador marcada={marcada} redondo />
                    <span className="flex-1 text-sm font-bold">{nome ?? "Sem borda"}</span>
                    {b && <span className="text-xs font-bold text-stone-600 tabular">+ {formatarReais(b.precoCentavos)}</span>}
                  </button>
                );
              })}
            </div>
          </Bloco>
        )}

        <Bloco titulo="Alguma observação?" etiqueta={<Etiqueta tom="claro">Opcional</Etiqueta>}>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value.slice(0, 200))} placeholder="Ex.: sem cebola, bem assada" className={CAMPO} />
        </Bloco>
      </div>
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
          <BotaoConfirmar disabled={!preco.ok} onClick={() => aoAdicionar(item)} rotulo="Adicionar" valor={preco.ok ? formatarReais(preco.subtotalCentavos) : "—"} />
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="flex items-center gap-3 px-1">
          <Miniatura produto={produto} className="size-20" />
          {produto.descricao ? <p className="text-sm text-stone-600">{produto.descricao}</p> : <p className="text-lg font-extrabold tabular">{preco.ok ? formatarReais(preco.precoUnitarioCentavos) : ""}</p>}
        </div>
        {opcoes.length > 1 && (
          <Bloco titulo="Escolha uma opção" etiqueta={<Etiqueta tom="escuro">Obrigatório</Etiqueta>}>
            <div className="space-y-1.5">
              {opcoes.map((v) => (
                <button key={v.id} type="button" onClick={() => setVariacao(v.id)} className={cn(estiloOpcao(variacao === v.id), "py-3")} aria-pressed={variacao === v.id}>
                  <Marcador marcada={variacao === v.id} redondo />
                  <span className="flex-1 text-sm font-bold">{v.nome}</span>
                  <span className="text-sm font-bold tabular">{formatarReais(v.precoCentavos)}</span>
                </button>
              ))}
            </div>
          </Bloco>
        )}
      </div>
    </Folha>
  );
}

// Carrinho ---------------------------------------------------------------------------

export function Carrinho({
  categorias,
  tamanhos,
  aberta,
  canais,
  linkWhatsapp,
  linkTelegram,
  nomeLoja,
  status,
  children,
}: {
  categorias: CategoriaCardapio[];
  tamanhos: TamanhoPizza[];
  aberta: boolean;
  /** Canais para onde o carrinho pode ser enviado (Telegram/WhatsApp configurados). */
  canais: Canal[];
  /** Botões de chat mostrados com o carrinho vazio. */
  linkWhatsapp: string | null;
  linkTelegram: string | null;
  nomeLoja: string;
  /** Situação da loja numa linha curta, para a barra do topo. */
  status: { texto: string; tom: "aberta" | "pausada" | "fechada" };
  children: ReactNode;
}) {
  const catalogo = useMemo(() => montarCatalogo(categorias, tamanhos), [categorias, tamanhos]);
  const [itens, setItens] = useState<ItemPedidoArgs[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [montando, setMontando] = useState<string | null>(null);
  const [sacolaAberta, setSacolaAberta] = useState(false);
  const [enviando, iniciarEnvio] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<{ canal: Canal; link: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pulo, setPulo] = useState(0);
  const reduzido = useReducedMotion();

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
  const habilitado = canais.length > 0;

  function adicionar(novo: ItemPedidoArgs) {
    setItens((atual) => {
      const igual = atual.findIndex((i) => assinatura(i) === assinatura(novo));
      if (igual === -1) return [...atual, novo];
      return atual.map((i, n) => (n === igual ? { ...i, quantidade: Math.min(50, i.quantidade + novo.quantidade) } : i));
    });
    setMontando(null);
    setEnviado(null);
    setAviso("Adicionado à sacola");
    setPulo((n) => n + 1);
  }

  function mudarQuantidade(indice: number, quantidade: number) {
    setItens((atual) => (quantidade <= 0 ? atual.filter((_, n) => n !== indice) : atual.map((i, n) => (n === indice ? { ...i, quantidade } : i))));
  }

  function enviar(canal: Canal) {
    setErro(null);
    iniciarEnvio(async () => {
      const r = await enviarCarrinhoAction(canal, itens);
      if (!r.ok) return setErro(r.erro);
      setEnviado({ canal, link: r.link });
      setItens([]);
      window.location.href = r.link;
    });
  }

  const produtoMontando = montando ? catalogo.produtos.get(montando) : undefined;
  const entrada = reduzido ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { y: 100 }, animate: { y: 0 }, exit: { y: 100 } };

  return (
    <ContextoCarrinho value={{ habilitado, abrirMontador: setMontando }}>
      {/* Barra do app */}
      <header className="sticky top-0 z-40 border-b border-black/[0.04] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-lg items-center gap-3 px-4">
          <Logo className="size-10 shrink-0 drop-shadow-[0_4px_8px_rgb(201_53_26/0.35)]" />
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-[15px] font-extrabold tracking-tight">{nomeLoja}</h1>
            <p
              className={cn(
                "flex items-center gap-1.5 truncate text-xs font-medium",
                status.tom === "aberta" ? "text-manjericao-600" : status.tom === "pausada" ? "text-amber-700" : "text-stone-500"
              )}
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", status.tom === "aberta" ? "bg-manjericao-500" : status.tom === "pausada" ? "bg-amber-400" : "bg-stone-400")} />
              {status.texto}
            </p>
          </div>
          {habilitado && (
            <motion.button
              key={pulo}
              type="button"
              onClick={() => setSacolaAberta(true)}
              initial={pulo && !reduzido ? { scale: 1.3 } : false}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 12 }}
              className={cn(
                "relative flex size-11 items-center justify-center rounded-2xl transition-colors",
                quantidadeTotal ? "bg-marca-600 text-white shadow-[0_6px_16px_-6px_rgb(201_53_26/0.7)]" : "bg-stone-100 text-stone-700"
              )}
              aria-label={`Sacola, ${quantidadeTotal} ${quantidadeTotal === 1 ? "item" : "itens"}`}
            >
              <ShoppingBag className="size-5" />
              {quantidadeTotal > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-900 px-1 text-[11px] font-bold text-white tabular ring-2 ring-white">
                  {quantidadeTotal}
                </span>
              )}
            </motion.button>
          )}
        </div>
      </header>

      {children}

      {/* Rodapé flutuante: sacola, pedido enviado ou atalhos para o chat */}
      <AnimatePresence mode="wait">
        {quantidadeTotal > 0 || enviado ? (
          <motion.div key="sacola" className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" {...entrada} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
            <button
              type="button"
              onClick={() => setSacolaAberta(true)}
              className={cn(
                "mx-auto flex h-14 w-full max-w-lg items-center gap-3 rounded-2xl px-4 font-bold text-white",
                quantidadeTotal > 0 ? cn("bg-marca-600", "shadow-[0_12px_28px_-10px_rgb(201_53_26/0.8)]") : "bg-stone-900 shadow-[0_12px_28px_-12px_rgb(0_0_0/0.6)]"
              )}
            >
              {quantidadeTotal > 0 ? (
                <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-white/20 px-1.5 text-sm tabular">{quantidadeTotal}</span>
              ) : (
                <span className="flex size-7 items-center justify-center rounded-lg bg-manjericao-500">
                  <Check className="size-4" strokeWidth={3} />
                </span>
              )}
              <span className="flex-1 text-left">{quantidadeTotal > 0 ? "Ver sacola" : "Pedido enviado"}</span>
              {quantidadeTotal > 0 && <span className="tabular">{formatarReais(subtotal)}</span>}
              <ChevronRight className="size-5" />
            </button>
          </motion.div>
        ) : (
          (linkWhatsapp || linkTelegram) && (
            <motion.div
              key="chat"
              className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#f6f3ee] via-[#f6f3ee]/90 to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
              {...entrada}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="mx-auto flex max-w-lg gap-2">
                {linkWhatsapp && (
                  <a href={linkWhatsapp} className={cn(estiloCanal.whatsapp, "flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl font-bold text-white transition hover:brightness-95 active:scale-[0.98]")}>
                    <MessageCircle className="size-5" /> {linkTelegram ? "WhatsApp" : "Pedir no WhatsApp"}
                  </a>
                )}
                {linkTelegram && (
                  <a href={linkTelegram} className={cn(estiloCanal.telegram, "flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl font-bold text-white transition hover:brightness-95 active:scale-[0.98]")}>
                    <Send className="size-5" /> {linkWhatsapp ? "Telegram" : "Pedir no Telegram"}
                  </a>
                )}
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aviso && (
          <motion.div
            key="aviso"
            role="status"
            className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"
            initial={{ opacity: 0, y: reduzido ? 0 : 12, scale: reduzido ? 1 : 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_28px_-12px_rgb(0_0_0/0.6)]">
              <span className="flex size-5 items-center justify-center rounded-full bg-manjericao-500">
                <Check className="size-3" strokeWidth={3.5} />
              </span>
              {aviso}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {produtoMontando &&
          (ehPizza(produtoMontando) ? (
            <MontadorPizza key={`pizza-${produtoMontando.id}`} catalogo={catalogo} produtoInicial={produtoMontando} aoAdicionar={adicionar} aoFechar={() => setMontando(null)} />
          ) : (
            <MontadorSimples key={`simples-${produtoMontando.id}`} catalogo={catalogo} produto={produtoMontando} aoAdicionar={adicionar} aoFechar={() => setMontando(null)} />
          ))}

        {sacolaAberta && (
          <Folha
            key="sacola"
            titulo={enviado ? "Pedido enviado" : "Sua sacola"}
            aoFechar={() => setSacolaAberta(false)}
            rodape={
              enviado ? (
                <a href={enviado.link} className={cn(estiloCanal[enviado.canal], "flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-bold text-white transition hover:brightness-95")}>
                  {enviado.canal === "whatsapp" ? <MessageCircle className="size-5" /> : <Send className="size-5" />} Abrir o {rotuloCanal[enviado.canal]}
                </a>
              ) : (
                itens.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-stone-500">Subtotal</span>
                      <span className="text-lg font-extrabold tabular">{formatarReais(subtotal)}</span>
                    </div>
                    {erro && (
                      <p role="alert" className="rounded-2xl bg-marca-50 px-3.5 py-2.5 text-sm font-semibold text-marca-700">
                        {erro}
                      </p>
                    )}
                    <div className="flex gap-2">
                      {canais.map((canal) => (
                        <motion.button
                          key={canal}
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => enviar(canal)}
                          disabled={enviando || !aberta || itens.length === 0}
                          className={cn(estiloCanal[canal], "flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl font-bold text-white transition hover:brightness-95 disabled:bg-stone-300 disabled:shadow-none")}
                        >
                          {canal === "whatsapp" ? <MessageCircle className="size-5" /> : <Send className="size-5" />}
                          {enviando ? "Enviando..." : canais.length > 1 ? rotuloCanal[canal] : `Enviar pelo ${rotuloCanal[canal]}`}
                        </motion.button>
                      ))}
                    </div>
                    <p className="text-center text-xs text-stone-500">
                      {aberta
                        ? `${canais.length > 1 ? "Escolha onde enviar. " : ""}Entrega ou retirada e pagamento você escolhe na conversa.`
                        : "Estamos fechados agora. Seu pedido fica salvo aqui para enviar quando abrirmos."}
                    </p>
                  </div>
                )
              )
            }
          >
            {enviado ? (
              <div className="py-8 text-center">
                <motion.span
                  initial={reduzido ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 18 }}
                  className="mx-auto flex size-16 items-center justify-center rounded-full bg-manjericao-500 text-white shadow-[0_12px_24px_-10px_rgb(47_158_85/0.8)]"
                >
                  <Check className="size-8" strokeWidth={3} />
                </motion.span>
                <p className="mt-4 text-xl font-extrabold tracking-tight">Pedido enviado!</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-stone-600">
                  {enviado.canal === "whatsapp" ? "No WhatsApp, toque em enviar na mensagem pronta e siga a conversa" : "Continue no Telegram"}: confirme entrega ou retirada e a forma de
                  pagamento. Se não abriu, toque no botão abaixo.
                </p>
              </div>
            ) : itens.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-4xl">🍕</p>
                <p className="mt-2 font-bold">Sua sacola está vazia</p>
                <p className="text-sm text-stone-500">Toque no + de um sabor para começar.</p>
              </div>
            ) : (
              <ul className="space-y-3 pb-2">
                {precificados.map(({ item, preco }, n) => (
                  <li key={n} className="flex gap-3 rounded-3xl bg-stone-50 p-3">
                    <Miniatura produto={catalogo.produtos.get(item.sabores[0]?.produto_id ?? "")} className="size-16 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] leading-snug font-bold">{preco.ok ? preco.descricao : "Item indisponível"}</p>
                      {item.observacao && <p className="mt-0.5 text-xs text-stone-500">Obs.: {item.observacao}</p>}
                      {!preco.ok && <p className="text-xs text-marca-700">{preco.erro}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="mr-auto text-[15px] font-extrabold tabular">{preco.ok ? formatarReais(preco.subtotalCentavos) : "—"}</span>
                        <div className="flex items-center rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.08)]">
                          <button
                            type="button"
                            onClick={() => mudarQuantidade(n, item.quantidade - 1)}
                            className="flex size-9 items-center justify-center text-marca-600"
                            aria-label={item.quantidade === 1 ? "Remover" : "Diminuir"}
                          >
                            {item.quantidade === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" strokeWidth={2.5} />}
                          </button>
                          <span className="w-5 text-center text-sm font-bold tabular">{item.quantidade}</span>
                          <button type="button" onClick={() => mudarQuantidade(n, Math.min(50, item.quantidade + 1))} className="flex size-9 items-center justify-center text-marca-600" aria-label="Aumentar">
                            <Plus className="size-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Folha>
        )}
      </AnimatePresence>
    </ContextoCarrinho>
  );
}
