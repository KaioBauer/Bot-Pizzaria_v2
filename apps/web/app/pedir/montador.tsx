"use client";

import { Minus, Plus, Search, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { CatalogoPedir, IngredientePedir, ProdutoPedir } from "@pizzaria/db";
import { formatarReais, type ItemPedidoLinkArgs } from "@pizzaria/shared";
import {
  Bandeja,
  CAMADAS_BASE,
  escalaDoTamanho,
  Flutuantes,
  miniaturaDoSabor,
  Palco,
  TotalAnimado,
  useFlutuantes,
  usePrecarregar,
  vibrar,
  visuaisDaDescricao,
  visualDoNome,
  VISUAIS,
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
  const visuais: CamadaVisual[] = visuaisDaDescricao(`${p.descricao ?? ""}, ${p.nome}`).map((v) => ({ ...v }));
  return {
    chave: p.id,
    nome: p.nome,
    visuais: visuais.length ? visuais : [{ chave: "generico", url: null, tipo: "pedacos", quantidade: 9, tamanho: 10, ordem: 1 }],
  };
}

/** Imagem da borda: a enviada pelo painel ou o recheio equivalente da biblioteca. */
function imagemDaBorda(nome: string, camadasBorda: Record<string, string>): string | null {
  return camadasBorda[nome] ?? visualDoNome(nome.replace(/^borda\s+/i, ""))?.url ?? null;
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
  tocar,
}: {
  /** Montar do zero ou sabores da casa (a página troca e remonta o componente). */
  modo: Modo;
  catalogo: CatalogoPedir;
  precos: Precos;
  editando?: ItemPedidoLinkArgs;
  /** id do ícone do carrinho (destino da pizza voando). */
  alvoCarrinho: string;
  aoAdicionar: (item: ItemPedidoLinkArgs) => void;
  tocar: (som: "pop" | "sai" | "forno" | "sucesso") => void;
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
  const { flutuantes, mostrar } = useFlutuantes();

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

  /** Aplica a mudança e mostra o "+R$" do que ela acrescentou. */
  function alterar(novo: Estado) {
    const delta = unitario(novo) - unitario(estado);
    if (delta > 0) mostrar(delta);
    tocar(delta < 0 ? "sai" : "pop");
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
  const opcoesBorda: OpcaoBandeja[] = [
    { chave: "", nome: "Tradicional", imagemUrl: CAMADAS_BASE.massaAssada, selecionada: estado.borda === null, detalhe: "Sem recheio" },
    ...nomesBorda.map(([nome, preco]) => {
      const imagem = imagemDaBorda(nome, catalogo.camadasBorda);
      return { chave: nome, nome: nome.replace(/^Borda\s+/i, ""), imagemUrl: imagem, aproximar: Boolean(imagem && URLS_COBERTURA.has(imagem)), extraCentavos: preco, selecionada: estado.borda === nome };
    }),
  ];

  // Camadas da pizza --------------------------------------------------------------------------

  const fatiasVisuais: (Camada | null)[] = estado.modo === "livre" ? [] : estado.fatias.map((id) => (id ? (camadasSabores.get(id) ?? null) : null));
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
    tocar("forno");
    setAssando(true);
  }

  function aoSairDoForno() {
    aoAdicionar(item);
    tocar("sucesso");
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

  return (
    <div className="pb-32">
      {/* Pizza fixa no topo: o cliente vê cada ingrediente cair enquanto rola a lista. */}
      <div className="sticky top-14 z-20 -mx-4 bg-[#f8f3ea] px-4 pt-2 pb-1">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-display text-[26px] leading-none font-semibold tracking-tight">{estado.modo === "livre" ? "Monte sua pizza" : "Escolha os sabores"}</h1>
          <span className="text-xs text-stone-500">
            {tamanhoAtual?.fatias} fatias{maxSabores > 1 ? ` · até ${maxSabores} sabores` : ""}
          </span>
        </div>
        <div className="sem-barra -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4" role="radiogroup" aria-label="Tamanho">
          {tamanhos.map((t) => (
            <button
              key={t.nome}
              type="button"
              role="radio"
              aria-checked={t.nome === estado.tamanho}
              onClick={() => trocarTamanho(t.nome)}
              className={cn(
                "relative h-8 shrink-0 rounded-full px-3.5 text-[13px] font-bold transition",
                t.nome === estado.tamanho ? "text-white" : "bg-white text-stone-700 ring-1 ring-[#e3d3b6]"
              )}
            >
              {t.nome === estado.tamanho && <motion.span layoutId="tamanho-ativo" className="absolute inset-0 rounded-full bg-marca-600 shadow-elevada" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              <span className="relative">{t.nome}</span>
            </button>
          ))}
        </div>

        <div className="relative mx-auto mt-1 w-[min(72vw,36dvh,330px)]">
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
            molhoAnimado
            assar={assando}
            alvoId={alvoCarrinho}
            aoTerminar={aoSairDoForno}
            sobreposicao={<Flutuantes itens={flutuantes} />}
          />
          <AnimatePresence>
            {conquista && (
              <motion.div className="absolute inset-0 z-30 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Confete />
                <motion.div
                  className="rounded-3xl bg-white px-5 py-3 text-center shadow-elevada ring-1 ring-creme-200"
                  initial={{ scale: 0.5, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16 }}
                  role="status"
                >
                  <Sparkles className="mx-auto size-6 text-amber-500" />
                  <p className="font-display text-lg font-semibold">Saiu do forno!</p>
                  <p className="text-sm text-stone-600">Pizza no carrinho 🍕</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
          {estado.modo === "sabores" && maxSabores > 1 && (
            <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
              {Array.from({ length: maxSabores }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => trocarQuantidadeSabores(n)}
                  aria-pressed={estado.fatias.length === n}
                  className={cn(
                    "rounded-full px-3 py-1 text-[13px] font-semibold transition",
                    estado.fatias.length === n ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-[#e3d3b6]"
                  )}
                >
                  {n === 1 ? "1 sabor" : n === 2 ? "Meio a meio" : `${n} sabores`}
                </button>
              ))}
            </div>
          )}
        {estado.modo === "sabores" && estado.fatias.length > 1 && (
          <p className="mt-1 text-center text-[13px] text-stone-600">
            Toque na pizza para trocar a fatia · escolhendo a <strong>fatia {estado.fatiaAtiva + 1}</strong>
          </p>
        )}
      </div>

      {estado.modo === "sabores" && (
        <section className="mt-3">
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar sabor ou ingrediente"
              className="h-11 w-full rounded-2xl bg-white pr-3 pl-9 text-[15px] ring-1 ring-[#e3d3b6] outline-none focus:ring-2 focus:ring-marca-400"
            />
          </label>
          <div className="sem-barra -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
            {[null, ...categorias].map((c) => (
              <button
                key={c ?? "todas"}
                type="button"
                onClick={() => setCategoria(c)}
                className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", categoria === c ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-[#e3d3b6]")}
              >
                {c ?? "Todas"}
              </button>
            ))}
          </div>
          {opcoesSabores.length ? <Bandeja opcoes={opcoesSabores} aoTocar={tocarSabor} /> : <p className="py-6 text-center text-sm text-stone-500">Nenhum sabor encontrado.</p>}
        </section>
      )}

      <section className="mt-5">
        <h2 className="mb-0.5 font-display text-lg font-semibold">{estado.modo === "livre" ? "Ingredientes" : "Turbine sua pizza"}</h2>
        <p className="mb-3 text-[13px] text-stone-500">Toque num ingrediente para adicionar · vale para a pizza inteira</p>
        {opcoesIngredientes.length ? (
          <Bandeja opcoes={opcoesIngredientes} aoTocar={tocarIngrediente} aoRemover={tocarIngrediente} />
        ) : (
          <p className="py-6 text-center text-sm text-stone-500">Nenhum ingrediente disponível agora.</p>
        )}
      </section>

      {nomesBorda.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-lg font-semibold">Borda recheada</h2>
          <Bandeja opcoes={opcoesBorda} aoTocar={(nome) => alterar({ ...estado, borda: nome || null })} />
        </section>
      )}

      <label className="mt-6 block">
        <span className="text-sm font-semibold text-stone-700">Alguma observação?</span>
        <input
          value={estado.observacao}
          onChange={(e) => setEstado({ ...estado, observacao: e.target.value.slice(0, 200) })}
          placeholder="Ex.: bem assada, sem cebola"
          className="mt-1 h-11 w-full rounded-2xl bg-white px-3 text-[15px] ring-1 ring-[#e3d3b6] outline-none focus:ring-2 focus:ring-marca-400"
        />
      </label>

      {/* Rodapé fixo: um polegar só */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#eadbc0] bg-[#f8f3ea]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex items-center rounded-full bg-white ring-1 ring-[#e3d3b6]">
            <button type="button" onClick={() => setEstado({ ...estado, quantidade: Math.max(1, estado.quantidade - 1) })} className="flex size-11 items-center justify-center" aria-label="Diminuir quantidade">
              <Minus className="size-4" />
            </button>
            <span className="w-5 text-center font-semibold tabular">{estado.quantidade}</span>
            <button type="button" onClick={() => setEstado({ ...estado, quantidade: Math.min(50, estado.quantidade + 1) })} className="flex size-11 items-center justify-center" aria-label="Aumentar quantidade">
              <Plus className="size-4" />
            </button>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={adicionar}
            disabled={!previa?.ok || assando}
            className="relative flex h-13 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full bg-marca-600 px-4 py-3.5 font-semibold text-white shadow-elevada transition disabled:bg-stone-400"
          >
            {mensagemBotao ? (
              <span className="truncate text-sm">
                {mensagemBotao}
                {estado.modo === "livre" && !completo && <span className="ml-1 opacity-80">· {formatarReais(totalCentavos)}</span>}
              </span>
            ) : (
              <>
                {editando ? "Salvar pizza" : "Adicionar ao pedido"} <TotalAnimado centavos={totalCentavos} />
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
