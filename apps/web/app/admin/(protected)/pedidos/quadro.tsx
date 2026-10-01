"use client";

import { Bell, BellRing, CircleAlert, History, Wifi, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listarPedidosPainel, obterPedidoPainel, type PedidoPainel } from "@pizzaria/db";
import type { StatusPedido } from "@pizzaria/shared";
import { Botao, cn, Selo } from "../../../../components/ui";
import { ativarSom, somAtivo, tocarAlerta } from "../../../../lib/alerta-sonoro";
import { COLUNAS, colunaDoStatus, type ColunaQuadro } from "../../../../lib/quadro";
import { clienteNavegador } from "../../../../lib/supabase/navegador";
import { alterarStatusAction, reimprimirAction } from "./actions";
import { CartaoPedido } from "./cartao";
import { JANELA_FINALIZADOS_MS, RECARGA_MS, REPETIR_ALERTA_MS } from "./constantes";
import { DetalhePedido } from "./detalhe";

type Conexao = "conectando" | "conectado" | "instavel";
const CHAVE_VISTOS = "painel:pedidos-vistos";

function lerVistos(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_VISTOS) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function gravarVistos(vistos: Set<string>) {
  try {
    localStorage.setItem(CHAVE_VISTOS, JSON.stringify([...vistos].slice(-500)));
  } catch {
    // modo privado / armazenamento bloqueado: só não persiste
  }
}

export function QuadroPedidos({ inicial }: { inicial: PedidoPainel[] }) {
  const [pedidos, setPedidos] = useState(() => new Map(inicial.map((p) => [p.id, p])));
  const [agora, setAgora] = useState(() => Date.now());
  const [conexao, setConexao] = useState<Conexao>("conectando");
  const [somLiberado, setSomLiberado] = useState(false);
  const [vistos, setVistos] = useState<Set<string>>(() => new Set());
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);
  const [ocupados, setOcupados] = useState<Set<string>>(() => new Set());
  const conexaoAnterior = useRef<Conexao>("conectando");

  // Vistos persistem por aparelho (localStorage), lidos só no cliente.
  useEffect(() => setVistos(lerVistos()), []);

  const atualizar = useCallback((pedido: PedidoPainel) => {
    setPedidos((atual) => new Map(atual).set(pedido.id, pedido));
  }, []);

  const recarregarTudo = useCallback(async () => {
    try {
      const lista = await listarPedidosPainel(clienteNavegador(), new Date(Date.now() - JANELA_FINALIZADOS_MS));
      setPedidos(new Map(lista.map((p) => [p.id, p])));
    } catch {
      setConexao("instavel");
    }
  }, []);

  const recarregarUm = useCallback(
    async (id: string) => {
      const pedido = await obterPedidoPainel(clienteNavegador(), id).catch(() => null);
      if (pedido) atualizar(pedido);
      else setPedidos((atual) => {
        const novo = new Map(atual);
        novo.delete(id);
        return novo;
      });
    },
    [atualizar]
  );

  // Realtime + recarga periódica + ao voltar para a aba.
  useEffect(() => {
    const supabase = clienteNavegador();
    let cancelado = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;

    // O Realtime precisa do token do usuário ANTES de assinar: sem ele entra
    // como anônimo e o RLS não entrega nenhum evento de pedidos.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelado) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      canal = assinar();
    });

    const assinar = () => supabase
      .channel("painel-pedidos")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, (evento) => {
        const id = (evento.new as { id?: string }).id ?? (evento.old as { id?: string }).id;
        if (id) void recarregarUm(id);
      })
      .subscribe((estado) => {
        const nova: Conexao = estado === "SUBSCRIBED" ? "conectado" : estado === "CLOSED" ? "conectando" : "instavel";
        // Reconectou depois de uma queda: pode ter perdido eventos.
        if (nova === "conectado" && conexaoAnterior.current !== "conectando") void recarregarTudo();
        conexaoAnterior.current = nova;
        setConexao(nova);
      });

    const recarga = setInterval(() => void recarregarTudo(), RECARGA_MS);
    const relogio = setInterval(() => setAgora(Date.now()), 15_000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void recarregarTudo();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      cancelado = true;
      clearInterval(recarga);
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [recarregarTudo, recarregarUm]);

  // Tela sempre acesa (tablet no balcão), quando o navegador suporta.
  useEffect(() => {
    let trava: WakeLockSentinel | null = null;
    const pedir = () => {
      if (document.visibilityState === "visible" && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then((t) => (trava = t)).catch(() => undefined);
      }
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("visibilitychange", pedir);
      void trava?.release();
    };
  }, []);

  const lista = useMemo(
    () => [...pedidos.values()].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [pedidos]
  );
  const porColuna = useMemo(() => {
    const mapa = new Map<ColunaQuadro, PedidoPainel[]>();
    for (const p of lista) {
      const coluna = colunaDoStatus(p.status);
      mapa.set(coluna, [...(mapa.get(coluna) ?? []), p]);
    }
    mapa.set("finalizados", (mapa.get("finalizados") ?? []).reverse());
    return mapa;
  }, [lista]);

  const naoVistos = useMemo(
    () => lista.filter((p) => p.status === "novo" && !vistos.has(p.id)),
    [lista, vistos]
  );

  // Alerta sonoro: ao chegar pedido novo e repetindo até alguém ver.
  const quantosNaoVistos = useRef(0);
  useEffect(() => {
    if (naoVistos.length > quantosNaoVistos.current) tocarAlerta();
    quantosNaoVistos.current = naoVistos.length;
    document.title = naoVistos.length ? `(${naoVistos.length}) Novo pedido!` : "Pedidos · Vianna Pizzaria";
    if (!naoVistos.length) return;
    const repetir = setInterval(tocarAlerta, REPETIR_ALERTA_MS);
    return () => clearInterval(repetir);
  }, [naoVistos.length]);

  const marcarVisto = useCallback((id: string) => {
    setVistos((atual) => {
      if (atual.has(id)) return atual;
      const novo = new Set(atual).add(id);
      gravarVistos(novo);
      return novo;
    });
  }, []);

  async function executar(id: string, acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    marcarVisto(id);
    setOcupados((s) => new Set(s).add(id));
    try {
      const resultado = await acao();
      if (!resultado.ok) setAviso(resultado.erro);
    } catch {
      setAviso("Sem conexão com o servidor. Tente de novo.");
    } finally {
      await recarregarUm(id);
      setOcupados((s) => {
        const novo = new Set(s);
        novo.delete(id);
        return novo;
      });
    }
  }

  const avancar = (p: PedidoPainel, para: StatusPedido) =>
    executar(p.id, () => alterarStatusAction({ pedidoId: p.id, de: p.status, para }));
  const cancelar = (p: PedidoPainel, motivo: string) =>
    executar(p.id, () => alterarStatusAction({ pedidoId: p.id, de: p.status, para: "cancelado", motivo }));
  const reimprimir = (p: PedidoPainel) => executar(p.id, () => reimprimirAction(p.id));

  const colunasVisiveis = COLUNAS.filter((c) => c.id !== "pagamento" || (porColuna.get("pagamento")?.length ?? 0) > 0);
  const finalizados = porColuna.get("finalizados") ?? [];
  const pedidoSelecionado = selecionado ? pedidos.get(selecionado) : undefined;

  const emAndamento = lista.filter((p) => colunaDoStatus(p.status) !== "finalizados").length;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col md:h-dvh">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="mr-auto">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Pedidos</h1>
          <p className="text-sm text-stone-500">
            {emAndamento === 0 ? "Nenhum pedido em andamento" : `${emAndamento} em andamento`}
            {naoVistos.length > 0 && <span className="font-semibold text-marca-700"> · {naoVistos.length} novo(s) aguardando</span>}
          </p>
        </div>
        <StatusConexao conexao={conexao} />
        {!somLiberado ? (
          <Botao variante="secundario" tamanho="sm" onClick={async () => setSomLiberado((await ativarSom()) || somAtivo())} className="ring-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100">
            <BellRing className="size-4" /> Ativar som
          </Botao>
        ) : (
          <Selo tom="sucesso" className="h-8 px-3">
            <Bell className="size-3.5" /> Som ativo
          </Selo>
        )}
        <Botao variante={mostrarFinalizados ? "escuro" : "secundario"} tamanho="sm" onClick={() => setMostrarFinalizados((v) => !v)}>
          <History className="size-4" /> Finalizados <span className="tabular opacity-70">{finalizados.length}</span>
        </Botao>
      </div>

      {aviso && (
        <div className="px-4 pt-3 sm:px-6">
          <button onClick={() => setAviso(null)} className="flex w-full items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-left text-sm text-red-800 ring-1 ring-red-200">
            <CircleAlert className="size-4 shrink-0" /> <span className="flex-1">{aviso}</span> <X className="size-4" />
          </button>
        </div>
      )}

      <div className="sem-barra flex flex-1 snap-x gap-4 overflow-x-auto p-4 sm:px-6">
        {colunasVisiveis.map((coluna) => {
          const itens = porColuna.get(coluna.id) ?? [];
          const estilo = ESTILO_COLUNA[coluna.id];
          return (
            <section key={coluna.id} className="flex w-[86vw] max-w-sm shrink-0 snap-start flex-col rounded-3xl bg-stone-900/[0.035] sm:w-80 lg:w-auto lg:max-w-none lg:flex-1">
              <h2 className="flex items-center gap-2 px-4 pt-4 pb-2 text-sm font-semibold text-stone-700">
                <span className={cn("size-2 rounded-full", estilo.ponto)} />
                {coluna.titulo}
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular text-stone-600 shadow-suave">{itens.length}</span>
              </h2>
              <div className="sem-barra flex-1 space-y-3 overflow-y-auto px-3 pb-3">
                {itens.length === 0 && (
                  <div className="mt-2 rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-400">{coluna.vaziaTexto}</div>
                )}
                {itens.map((p) => (
                  <CartaoPedido
                    key={p.id}
                    pedido={p}
                    agora={agora}
                    destacado={p.status === "novo" && !vistos.has(p.id)}
                    ocupado={ocupados.has(p.id)}
                    aoAbrir={() => {
                      marcarVisto(p.id);
                      setSelecionado(p.id);
                    }}
                    aoAvancar={(para) => void avancar(p, para)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {mostrarFinalizados && (
          <section className="flex w-[86vw] max-w-sm shrink-0 snap-start flex-col rounded-3xl bg-stone-900/[0.035] sm:w-80">
            <h2 className="flex items-center gap-2 px-4 pt-4 pb-2 text-sm font-semibold text-stone-500">
              <History className="size-4" /> Finalizados nas últimas 12h
            </h2>
            <div className="sem-barra flex-1 space-y-2 overflow-y-auto px-3 pb-3">
              {finalizados.length === 0 && <p className="py-10 text-center text-sm text-stone-400">Nada por aqui ainda</p>}
              {finalizados.map((p) => (
                <CartaoPedido key={p.id} pedido={p} agora={agora} compacto aoAbrir={() => setSelecionado(p.id)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {pedidoSelecionado && (
        <DetalhePedido
          pedido={pedidoSelecionado}
          ocupado={ocupados.has(pedidoSelecionado.id)}
          aoFechar={() => setSelecionado(null)}
          aoAvancar={(para) => void avancar(pedidoSelecionado, para)}
          aoCancelar={(motivo) => void cancelar(pedidoSelecionado, motivo)}
          aoReimprimir={() => void reimprimir(pedidoSelecionado)}
        />
      )}
    </div>
  );
}

const ESTILO_COLUNA: Record<ColunaQuadro, { ponto: string }> = {
  pagamento: { ponto: "bg-violet-500" },
  novos: { ponto: "bg-marca-500" },
  preparo: { ponto: "bg-amber-500" },
  saida: { ponto: "bg-manjericao-500" },
  finalizados: { ponto: "bg-stone-400" },
};

function StatusConexao({ conexao }: { conexao: Conexao }) {
  const estilo = {
    conectado: { Icone: Wifi, tom: "sucesso" as const, texto: "Ao vivo" },
    conectando: { Icone: Wifi, tom: "neutro" as const, texto: "Conectando..." },
    instavel: { Icone: WifiOff, tom: "perigo" as const, texto: "Conexão instável" },
  }[conexao];
  return (
    <Selo tom={estilo.tom} className="h-8 px-3" title={conexao === "instavel" ? "Atualizando a cada minuto até a conexão voltar" : undefined}>
      {conexao === "conectado" ? (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-manjericao-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-manjericao-500" />
        </span>
      ) : (
        <estilo.Icone className="size-3.5" />
      )}
      {estilo.texto}
    </Selo>
  );
}
