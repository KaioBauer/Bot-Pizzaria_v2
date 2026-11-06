"use client";

import { Check, Minus, Plus, Search, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import type { CatalogoPedir, IngredientePedir, ProdutoPedir } from "@pizzaria/db";
import { formatarReais, type ItemPedidoLinkArgs } from "@pizzaria/shared";
import {
  AnelDeRecheio,
  Bandeja,
  CAMADAS_BASE,
  ehDoce,
  escalaDoTamanho,
  miniaturaDoSabor,
  Palco,
  TotalAnimado,
  usePrecarregar,
  vibrar,
  visuaisDoSabor,
  visualDoNome,
  VISUAIS,
  type BaseSabor,
  type Camada,
  type CamadaVisual,
  type OpcaoBandeja,
} from "../../components/pizza-builder";
import { cn } from "../../components/ui";
import { previaItem, variacaoNoTamanho, type Precos } from "./modelo";

type Modo = "livre" | "sabores";

interface Estado {
  modo: Modo;
  tamanho: string;
  /** Sabor (produto) de cada fatia no modo "sabores"; o tamanho do array é o nº de sabores. */
  fatias: (string | null)[];
  fatiaAtiva: number;
  ingredientes: string[];
  borda: string | null;
  quantidade: number;
  observacao: string;
}

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const URLS_COBERTURA = new Set(Object.values(VISUAIS).filter((v) => v.tipo === "cobertura").map((v) => v.url));

// Camadas visuais --------------------------------------------------------------------------

function camadaDoIngrediente(i: IngredientePedir): Camada {
  const visual = visualDoNome(i.nome);
  const url = i.camadaUrl ?? visual?.url ?? null;
  return {
    chave: i.id,
    nome: i.nome,
    visuais: [
      {
        chave: i.id,
        url,
        assadaUrl: visual && url === visual.url ? visual.assadaUrl : undefined,
        tipo: i.camadaTipo,
        quantidade: visual?.tipo === "pedacos" ? visual.quantidade : 10,
        tamanho: visual?.tipo === "pedacos" ? visual.tamanho : 12,
        ordem: i.camadaTipo === "cobertura" ? (visual?.ordem ?? 0) : 1,
      },
    ],
  };
}

function camadaDoSabor(p: ProdutoPedir): Camada {
  // Imagem própria enviada pelo painel: vale como cobertura da fatia inteira.
  if (p.camadaUrl) return { chave: p.id, nome: p.nome, visuais: [{ chave: "camada", url: p.camadaUrl, tipo: "cobertura", quantidade: 1, tamanho: 100, ordem: 0 }] };
  // A muçarela não entra aqui: nas salgadas ela já vem na base, nas doces não vai.
  const visuais: CamadaVisual[] = visuaisDoSabor(p.descricao, p.nome).map((v) => ({ ...v }));
  return {
    chave: p.id,
    nome: p.nome,
    visuais: visuais.length ? visuais : [{ chave: "generico", url: null, tipo: "pedacos", quantidade: 9, tamanho: 10, ordem: 1 }],
  };
}

/**
 * Escolha da borda em carrossel: cada opção é uma mini pizza assada com o
 * recheio aplicado em volta (ou a imagem do anel enviada pelo painel).
 */
function EscolhaBorda({
  opcoes,
  selecionada,
  camadasBorda,
  aoEscolher,
}: {
  opcoes: [string, number][];
  selecionada: string | null;
  camadasBorda: Record<string, string>;
  aoEscolher: (nome: string | null) => void;
}) {
  const itens: { nome: string | null; rotulo: string; preco: number }[] = [{ nome: null, rotulo: "Tradicional", preco: 0 }, ...opcoes.map(([nome, preco]) => ({ nome, rotulo: nome.replace(/^Borda\s+/i, ""), preco }))];
  return (
    <div className="sem-barra -mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pt-1 pb-1">
      {itens.map((o) => {
        const ativa = o.nome === selecionada;
        const anel = o.nome ? camadasBorda[o.nome] : undefined;
        return (
          <motion.button
            key={o.nome ?? "tradicional"}
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              vibrar();
              aoEscolher(o.nome);
            }}
            aria-pressed={ativa}
            className={cn(
              "relative w-[124px] shrink-0 snap-start rounded-3xl p-2.5 text-left transition-colors",
              ativa ? "bg-marca-50 ring-2 ring-marca-500" : "bg-stone-50 ring-1 ring-black/[0.04]"
            )}
          >
            <span className="relative mx-auto block aspect-square w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={CAMADAS_BASE.massaAssada} alt="" className="absolute inset-0 size-full" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={CAMADAS_BASE.molho} alt="" className="absolute inset-0 size-full" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={VISUAIS.mussarela!.assadaUrl} alt="" className="absolute inset-0 size-full" />
              {anel ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={anel}
                  alt=""
                  className="absolute inset-0 size-full object-contain"
                  style={{ maskImage: "radial-gradient(circle, transparent 41%, #000 43%)", WebkitMaskImage: "radial-gradient(circle, transparent 41%, #000 43%)" }}
                />
              ) : (
                o.nome && <AnelDeRecheio key={ativa ? "ativa" : "parada"} nome={o.nome} animar={false} />
              )}
            </span>
            <span className="mt-2 block text-[13px] leading-tight font-extrabold">{o.rotulo}</span>
            <span className={cn("block text-xs font-bold tabular", ativa ? "text-marca-600" : "text-stone-500")}>{o.preco ? `+ ${formatarReais(o.preco)}` : "Sem recheio"}</span>
            {ativa && (
              <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-marca-600 text-white shadow">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

function estadoInicial(catalogo: CatalogoPedir, tamanhos: string[], modo: Modo, item?: ItemPedidoLinkArgs): Estado {
  const livre = catalogo.pizzas.find((p) => p.montagemLivre);
  if (item) {
    const variacoes = catalogo.pizzas.flatMap((p) => p.variacoes);
    const primeiro = variacoes.find((v) => v.id === item.sabores[0]?.variacao_id);
    const ehLivre = item.sabores[0]?.produto_id === livre?.id;
    return {
      modo: ehLivre ? "livre" : "sabores",
      tamanho: primeiro?.nome ?? tamanhos[0]!,
      fatias: ehLivre ? [null] : item.sabores.map((s) => s.produto_id),
      fatiaAtiva: 0,
      ingredientes: item.ingredientes,
      borda: variacoes.find((v) => v.tipo === "borda" && item.adicionais.includes(v.id))?.nome ?? null,
      quantidade: item.quantidade,
      observacao: item.observacao ?? "",
    };
  }
  // Tamanho do meio para começar (nem o menor, nem o maior).
  return {
    modo: livre ? modo : "sabores",
    tamanho: tamanhos[Math.floor((tamanhos.length - 1) / 2)] ?? "",
    fatias: [null],
    fatiaAtiva: 0,
    ingredientes: [],
    borda: null,
    quantidade: 1,
    observacao: "",
  };
}

// Confete da conquista -------------------------------------------------------------------------

function Confete() {
  const cores = ["#e94b27", "#f6c22e", "#2f9e55", "#fbf4dd", "#c9351a"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => {
        const angulo = (i / 18) * Math.PI * 2;
        const distancia = 90 + (i % 3) * 30;
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 block h-2.5 w-1.5 rounded-sm"
            style={{ background: cores[i % cores.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: Math.cos(angulo) * distancia, y: Math.sin(angulo) * distancia + 40, opacity: 0, rotate: 360 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

export function Montador({
  modo,
  catalogo,
  precos,
  editando,
  alvoCarrinho,
  aoAdicionar,
}: {
  /** Montar do zero ou sabores da casa (a página troca e remonta o componente). */
  modo: Modo;
  catalogo: CatalogoPedir;
  precos: Precos;
  editando?: ItemPedidoLinkArgs;
  /** id do ícone do carrinho (destino da pizza voando). */
  alvoCarrinho: string;
  aoAdicionar: (item: ItemPedidoLinkArgs) => void;
}) {
  const produtos = useMemo(() => new Map(catalogo.pizzas.map((p) => [p.id, p])), [catalogo.pizzas]);
  const livre = catalogo.pizzas.find((p) => p.montagemLivre);
  // Tamanhos oferecidos por alguma pizza, na ordem cadastrada.
  const tamanhos = useMemo(
    () => catalogo.tamanhos.filter((t) => catalogo.pizzas.some((p) => variacaoNoTamanho(p, t.nome))),
    [catalogo.tamanhos, catalogo.pizzas]
  );
  const [estado, setEstado] = useState<Estado>(() => estadoInicial(catalogo, tamanhos.map((t) => t.nome), modo, editando));
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [assando, setAssando] = useState(false);
  const [conquista, setConquista] = useState(false);

  const tamanhoAtual = tamanhos.find((t) => t.nome === estado.tamanho) ?? tamanhos[0];
  const indiceTamanho = tamanhoAtual ? tamanhos.indexOf(tamanhoAtual) : 0;
  const maxSabores = tamanhoAtual?.maxSabores ?? 1;
  const camadasIngredientes = useMemo(() => new Map(catalogo.ingredientes.map((i) => [i.id, camadaDoIngrediente(i)])), [catalogo.ingredientes]);
  const camadasSabores = useMemo(() => new Map(catalogo.pizzas.map((p) => [p.id, camadaDoSabor(p)])), [catalogo.pizzas]);

  // Pré-carrega as camadas: as dos ingredientes já; as dos sabores quando o navegador estiver ocioso.
  usePrecarregar([...catalogo.ingredientes.map((i) => camadasIngredientes.get(i.id)?.visuais[0]?.url), ...Object.values(catalogo.camadasBorda)]);
  usePrecarregar(Object.values(VISUAIS).flatMap((v) => [v.url, v.assadaUrl]), true);

  /** Fatias efetivas: no modo livre, o sabor é o "Monte a sua". */
  const fatiasDoEstado = (e: Estado) => (e.modo === "livre" ? [livre?.id ?? null] : e.fatias);

  function montarItem(e: Estado): ItemPedidoLinkArgs {
    const fatias = fatiasDoEstado(e);
    const sabores = fatias.flatMap((id) => {
      const p = id ? produtos.get(id) : undefined;
      const v = p && variacaoNoTamanho(p, e.tamanho);
      return p && v ? [{ produto_id: p.id, variacao_id: v.id }] : [];
    });
    // A borda é variação de cada sabor (mesmo nome): usa a do primeiro que a oferece.
    const borda = e.borda
      ? fatias
          .map((id) => (id ? produtos.get(id) : undefined))
          .flatMap((p) => p?.variacoes ?? [])
          .find((v) => v.tipo === "borda" && v.nome === e.borda)
      : undefined;
    return { sabores, adicionais: borda ? [borda.id] : [], ingredientes: e.ingredientes, quantidade: e.quantidade, observacao: e.observacao.trim() || null };
  }

  const item = montarItem(estado);
  const fatiasEfetivas = fatiasDoEstado(estado);
  const completo = item.sabores.length === fatiasEfetivas.length && item.sabores.length > 0 && (estado.modo === "sabores" || estado.ingredientes.length > 0);
  const previa = completo ? previaItem(item, precos) : null;
  const unitario = (e: Estado) => {
    const i = montarItem({ ...e, quantidade: 1 });
    // Prévia parcial (fatia vazia, sem ingrediente): soma o que já dá para somar.
    const base = tamanhos.find((t) => t.nome === e.tamanho)?.precoBaseCentavos ?? 0;
    if (!i.sabores.length || (e.modo === "livre" && !i.ingredientes.length)) return base;
    const p = previaItem(i, precos);
    return p.ok ? p.precoUnitarioCentavos : base;
  };
  const totalCentavos = unitario(estado) * estado.quantidade;

  function alterar(novo: Estado) {
    setEstado(novo);
  }

  // Opções das bandejas --------------------------------------------------------------------

  const categorias = useMemo(() => [...new Set(catalogo.pizzas.filter((p) => !p.montagemLivre).map((p) => p.categoria))], [catalogo.pizzas]);
  const baseDoTamanho = tamanhoAtual?.precoBaseCentavos ?? 0;
  const fatiaSabor = estado.fatias[estado.fatiaAtiva];

  const opcoesSabores: OpcaoBandeja[] = catalogo.pizzas
    .filter((p) => !p.montagemLivre)
    .filter((p) => !categoria || p.categoria === categoria)
    .filter((p) => !busca || normalizar(`${p.nome} ${p.descricao ?? ""}`).includes(normalizar(busca)))
    .map((p) => {
      const v = variacaoNoTamanho(p, estado.tamanho);
      const repetido = estado.fatias.some((id, i) => id === p.id && i !== estado.fatiaAtiva);
      const imagem = p.camadaUrl ?? miniaturaDoSabor(p.descricao, p.nome) ?? p.imagemUrl;
      return {
        chave: p.id,
        nome: p.nome,
        imagemUrl: imagem,
        aproximar: Boolean(p.camadaUrl || (imagem && URLS_COBERTURA.has(imagem))),
        extraCentavos: v ? Math.max(0, v.precoCentavos - baseDoTamanho) : 0,
        selecionada: fatiaSabor === p.id,
        indisponivel: !v ? `Sem ${estado.tamanho}` : repetido ? "Já na pizza" : null,
      };
    });

  const opcoesIngredientes: OpcaoBandeja[] = catalogo.ingredientes.map((i) => {
    const preco = i.precosCentavos[estado.tamanho];
    const selecionada = estado.ingredientes.includes(i.id);
    const cheio = !selecionada && estado.ingredientes.length >= precos.maxIngredientes;
    return {
      chave: i.id,
      nome: i.nome,
      imagemUrl: camadasIngredientes.get(i.id)?.visuais[0]?.url ?? null,
      aproximar: i.camadaTipo === "cobertura",
      extraCentavos: preco ?? 0,
      selecionada,
      indisponivel: preco === undefined ? `Sem ${estado.tamanho}` : cheio ? `Máx. ${precos.maxIngredientes}` : null,
    };
  });

  // Bordas oferecidas pelos sabores da pizza (no livre, as do "Monte a sua").
  const nomesBorda = useMemo(() => {
    const escolhidos = fatiasEfetivas.flatMap((id) => (id ? [produtos.get(id)] : [])).filter((p): p is ProdutoPedir => Boolean(p));
    const fonte = escolhidos.length ? escolhidos : catalogo.pizzas;
    const mapa = new Map<string, number>();
    for (const v of fonte.flatMap((p) => p.variacoes)) if (v.tipo === "borda" && !mapa.has(v.nome)) mapa.set(v.nome, v.precoCentavos);
    return [...mapa];
  }, [fatiasEfetivas, produtos, catalogo.pizzas]);

  // Camadas da pizza --------------------------------------------------------------------------

  const fatiasVisuais: (Camada | null)[] = estado.modo === "livre" ? [] : estado.fatias.map((id) => (id ? (camadasSabores.get(id) ?? null) : null));
  // Base de cada fatia: doce só com a massa; salgada (e fatia ainda vazia) com molho e muçarela.
  const bases: BaseSabor[] =
    estado.modo === "livre" ? ["salgada"] : estado.fatias.map((id) => (id && ehDoce(produtos.get(id)?.categoria ?? "") ? "doce" : "salgada"));
  const ingredientesVisuais = estado.ingredientes.flatMap((id) => camadasIngredientes.get(id) ?? []);
  const borda: Camada | null = estado.borda
    ? { chave: estado.borda, nome: estado.borda, visuais: catalogo.camadasBorda[estado.borda] ? [{ chave: "b", url: catalogo.camadasBorda[estado.borda]!, tipo: "cobertura", quantidade: 1, tamanho: 100, ordem: 0 }] : [] }
    : null;

  // Ações -----------------------------------------------------------------------------------------

  function trocarTamanho(nome: string) {
    const t = tamanhos.find((x) => x.nome === nome);
    if (!t) return;
    vibrar();
    // Corta sabores acima do limite e o que não existe no novo tamanho.
    const fatias = estado.fatias.slice(0, t.maxSabores).map((id) => (id && produtos.get(id) && variacaoNoTamanho(produtos.get(id)!, nome) ? id : null));
    const ingredientes = estado.ingredientes.filter((id) => catalogo.ingredientes.find((i) => i.id === id)?.precosCentavos[nome] !== undefined);
    alterar({ ...estado, tamanho: nome, fatias, fatiaAtiva: Math.min(estado.fatiaAtiva, fatias.length - 1), ingredientes });
  }

  function trocarQuantidadeSabores(n: number) {
    vibrar();
    const fatias = Array.from({ length: n }, (_, i) => estado.fatias[i] ?? null);
    const vazia = fatias.findIndex((f) => f === null);
    alterar({ ...estado, fatias, fatiaAtiva: vazia >= 0 ? vazia : 0 });
  }

  function tocarSabor(id: string) {
    const fatias = [...estado.fatias];
    fatias[estado.fatiaAtiva] = fatias[estado.fatiaAtiva] === id ? null : id;
    // Vai sozinho para a próxima fatia vazia.
    const proxima = fatias.findIndex((f) => f === null);
    alterar({ ...estado, fatias, fatiaAtiva: fatias[estado.fatiaAtiva] && proxima >= 0 ? proxima : estado.fatiaAtiva });
  }

  function tocarIngrediente(id: string) {
    const tem = estado.ingredientes.includes(id);
    alterar({ ...estado, ingredientes: tem ? estado.ingredientes.filter((x) => x !== id) : [...estado.ingredientes, id] });
  }

  function adicionar() {
    if (!previa?.ok || assando) return;
    vibrar(20);
    setAssando(true);
  }

  function aoSairDoForno() {
    aoAdicionar(item);
    vibrar(30);
    setAssando(false);
    setConquista(true);
    setTimeout(() => setConquista(false), 1900);
    setEstado({ ...estadoInicial(catalogo, tamanhos.map((t) => t.nome), estado.modo), tamanho: estado.tamanho });
  }

  const mensagemBotao = !completo
    ? estado.modo === "livre"
      ? "Toque num ingrediente"
      : estado.fatias.length > 1
        ? `Escolha o sabor da fatia ${estado.fatias.findIndex((f) => f === null) + 1}`
        : "Escolha o sabor"
    : previa && !previa.ok
      ? previa.erro
      : null;

  const livreModo = estado.modo === "livre";
  const saboresFaltando = estado.fatias.filter((f) => f === null).length;

  return (
    <div className="pb-36">
      <div className="mt-5 mb-1">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">{livreModo ? "Monte sua pizza" : "Sabores da casa"}</h1>
        <p className="text-sm text-stone-500">
          {livreModo ? "Toque nos ingredientes e veja sua pizza ganhar forma" : maxSabores > 1 ? `Até ${maxSabores} sabores na ${tamanhoAtual?.nome}` : "Escolha o sabor"}
        </p>
      </div>

      {/* Palco fixo: o cliente vê cada ingrediente cair enquanto rola a lista. */}
      <div className="sticky top-16 z-20 -mx-4 bg-[#f6f3ee] px-4 pt-3 pb-2 [transform:translateZ(0)]">
        <div
          className="grid gap-1 rounded-2xl bg-white p-1 shadow-[0_1px_3px_rgb(0_0_0/0.06)]"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, tamanhos.length)}, minmax(0, 1fr))` }}
          role="radiogroup"
          aria-label="Tamanho"
        >
          {tamanhos.map((t) => {
            const ativo = t.nome === estado.tamanho;
            return (
              <button
                key={t.nome}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => trocarTamanho(t.nome)}
                className={cn("relative flex flex-col items-center rounded-xl py-1.5 transition-colors", ativo ? "text-white" : "text-stone-600")}
              >
                {ativo && <motion.span layoutId="tamanho-ativo" className="absolute inset-0 rounded-xl bg-marca-600 shadow-[0_6px_14px_-6px_rgb(201_53_26/0.8)]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                <span className="relative text-[13px] leading-tight font-bold">{t.nome}</span>
                <span className={cn("relative text-[10.5px] leading-tight", ativo ? "text-white/80" : "text-stone-400")}>{t.fatias} fatias</span>
              </button>
            );
          })}
        </div>

        <div className="relative mx-auto mt-4 mb-3 w-[min(70vw,34svh,320px)]">
          <Palco
            escala={escalaDoTamanho(indiceTamanho, tamanhos.length)}
            fatias={fatiasVisuais}
            fatiaAtiva={estado.fatiaAtiva}
            aoEscolherFatia={(i) => {
              vibrar();
              setEstado({ ...estado, fatiaAtiva: i });
            }}
            ingredientes={ingredientesVisuais}
            borda={borda}
            bases={bases}
            assar={assando}
            alvoId={alvoCarrinho}
            aoTerminar={aoSairDoForno}
          />
          <AnimatePresence>
            {conquista && (
              <motion.div className="absolute inset-0 z-30 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Confete />
                <motion.div
                  className="rounded-3xl bg-white px-5 py-3 text-center shadow-[0_20px_40px_-12px_rgb(0_0_0/0.3)]"
                  initial={{ scale: 0.5, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16 }}
                  role="status"
                >
                  <Sparkles className="mx-auto size-6 text-amber-500" />
                  <p className="text-lg font-extrabold tracking-tight">Pizza adicionada!</p>
                  <p className="text-sm text-stone-500">Pizza na sacola 🍕</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!livreModo && maxSabores > 1 && (
          <div className="mx-auto flex w-fit gap-1 rounded-full bg-white p-1 shadow-[0_1px_3px_rgb(0_0_0/0.06)]">
            {Array.from({ length: maxSabores }, (_, i) => i + 1).map((n) => {
              const ativo = estado.fatias.length === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => trocarQuantidadeSabores(n)}
                  aria-pressed={ativo}
                  className={cn("relative rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors", ativo ? "text-white" : "text-stone-500")}
                >
                  {ativo && <motion.span layoutId="qtd-sabores" className="absolute inset-0 rounded-full bg-stone-900" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <span className="relative">{n === 1 ? "1 sabor" : n === 2 ? "Meio a meio" : `${n} sabores`}</span>
                </button>
              );
            })}
          </div>
        )}
        {!livreModo && estado.fatias.length > 1 && (
          <p className="mt-1.5 text-center text-xs text-stone-500">
            Toque na pizza para trocar · escolhendo a <strong className="text-stone-800">fatia {estado.fatiaAtiva + 1}</strong>
          </p>
        )}
      </div>

      {!livreModo && (
        <Secao
          titulo={estado.fatias.length > 1 ? `Sabor da fatia ${estado.fatiaAtiva + 1}` : "Sabor"}
          detalhe="Os especiais mostram o valor a mais"
          etiqueta={saboresFaltando ? <Etiqueta tom="escuro">Obrigatório</Etiqueta> : <Etiqueta tom="ok">Pronto</Etiqueta>}
        >
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar sabor ou ingrediente"
              className="h-11 w-full rounded-2xl bg-stone-100 pr-3 pl-10 text-[15px] outline-none placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-marca-400"
            />
          </label>
          <div className="sem-barra -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4">
            {[null, ...categorias].map((c) => (
              <button
                key={c ?? "todas"}
                type="button"
                onClick={() => setCategoria(c)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                  categoria === c ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                )}
              >
                {c ?? "Todas"}
              </button>
            ))}
          </div>
          {opcoesSabores.length ? <Bandeja opcoes={opcoesSabores} aoTocar={tocarSabor} /> : <p className="py-6 text-center text-sm text-stone-500">Nenhum sabor encontrado.</p>}
        </Secao>
      )}

      <Secao
        titulo={livreModo ? "Ingredientes" : "Turbine sua pizza"}
        detalhe="Toque para adicionar · vale para a pizza inteira"
        etiqueta={
          livreModo && !estado.ingredientes.length ? (
            <Etiqueta tom="escuro">Obrigatório</Etiqueta>
          ) : (
            <Etiqueta tom={estado.ingredientes.length ? "marca" : "claro"}>
              {estado.ingredientes.length}/{precos.maxIngredientes}
            </Etiqueta>
          )
        }
      >
        {opcoesIngredientes.length ? (
          <Bandeja opcoes={opcoesIngredientes} aoTocar={tocarIngrediente} aoRemover={tocarIngrediente} />
        ) : (
          <p className="py-6 text-center text-sm text-stone-500">Nenhum ingrediente disponível agora.</p>
        )}
      </Secao>

      {nomesBorda.length > 0 && (
        <Secao titulo="Borda recheada" detalhe="Recheio cremoso em toda a volta da pizza" etiqueta={<Etiqueta tom="claro">Opcional</Etiqueta>}>
          <EscolhaBorda opcoes={nomesBorda} selecionada={estado.borda} camadasBorda={catalogo.camadasBorda} aoEscolher={(nome) => alterar({ ...estado, borda: nome })} />
        </Secao>
      )}

      <Secao titulo="Alguma observação?" etiqueta={<Etiqueta tom="claro">Opcional</Etiqueta>}>
        <textarea
          value={estado.observacao}
          onChange={(e) => setEstado({ ...estado, observacao: e.target.value.slice(0, 200) })}
          placeholder="Ex.: bem assada, sem cebola"
          rows={2}
          className="w-full resize-none rounded-2xl bg-stone-100 px-3.5 py-3 text-[15px] outline-none placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-marca-400"
        />
        <p className="mt-1 text-right text-[11px] text-stone-400 tabular">{estado.observacao.length}/200</p>
      </Secao>

      {/* Rodapé fixo: um polegar só */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white shadow-[0_-10px_30px_-18px_rgb(0_0_0/0.35)] [transform:translateZ(0)]">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <div className="flex h-14 items-center rounded-2xl bg-stone-100">
            <button
              type="button"
              onClick={() => setEstado({ ...estado, quantidade: Math.max(1, estado.quantidade - 1) })}
              disabled={estado.quantidade <= 1}
              className="flex size-11 items-center justify-center text-marca-600 disabled:text-stone-300"
              aria-label="Diminuir quantidade"
            >
              <Minus className="size-4" strokeWidth={2.75} />
            </button>
            <span className="w-5 text-center font-extrabold tabular">{estado.quantidade}</span>
            <button
              type="button"
              onClick={() => setEstado({ ...estado, quantidade: Math.min(50, estado.quantidade + 1) })}
              className="flex size-11 items-center justify-center text-marca-600"
              aria-label="Aumentar quantidade"
            >
              <Plus className="size-4" strokeWidth={2.75} />
            </button>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={adicionar}
            disabled={!previa?.ok || assando}
            className="relative flex h-14 flex-1 items-center justify-between gap-2 overflow-hidden rounded-2xl bg-marca-600 px-4 font-bold sm:px-5 text-white shadow-[0_12px_24px_-12px_rgb(201_53_26/0.9)] transition disabled:bg-stone-300 disabled:shadow-none"
          >
            {mensagemBotao ? (
              <>
                <span className="line-clamp-2 min-w-0 text-left text-[13px] leading-tight sm:text-sm">{mensagemBotao}</span>
                {livreModo && !completo && <span className="shrink-0 text-sm whitespace-nowrap opacity-90 tabular">{formatarReais(totalCentavos)}</span>}
              </>
            ) : (
              <>
                <span>{editando ? "Salvar" : "Adicionar"}</span>
                <TotalAnimado centavos={totalCentavos} />
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/** Seção em cartão branco, como os grupos de opções de um app de delivery. */
function Secao({ titulo, detalhe, etiqueta, children }: { titulo: string; detalhe?: string; etiqueta?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-3xl bg-white p-4 shadow-[0_1px_3px_rgb(0_0_0/0.06)]">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] leading-tight font-extrabold tracking-tight">{titulo}</h2>
          {detalhe && <p className="mt-0.5 text-[12.5px] text-stone-500">{detalhe}</p>}
        </div>
        {etiqueta}
      </div>
      {children}
    </section>
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
