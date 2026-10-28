"use client";

import { Bell, BellRing, Bike, CircleAlert, Flame, History, Hourglass, Inbox, Wifi, WifiOff, X } from "lucide-react";
import { animate, AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listarPedidosPainel, obterPedidoPainel, type PedidoPainel } from "@pizzaria/db";
import { formatarReais, ROTULO_STATUS, type StatusPedido } from "@pizzaria/shared";
import { useAvisos } from "../../../../components/painel/avisos";
import { Botao, cn } from "../../../../components/ui";
import { ativarSom, somAtivo, tocarAlerta } from "../../../../lib/alerta-sonoro";
import { COLUNAS, colunaDoStatus, minutosDesde, type ColunaQuadro } from "../../../../lib/quadro";
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
  useEffect(() => {
    setVistos(lerVistos());
  }, []);

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
  const { mostrar } = useAvisos();
  useEffect(() => {
    if (naoVistos.length > quantosNaoVistos.current) {
      tocarAlerta();
      const ultimo = naoVistos[naoVistos.length - 1];
      if (ultimo) mostrar({ tom: "novo", titulo: `Novo pedido #${ultimo.numero}`, descricao: `${ultimo.clienteNome} · ${formatarReais(ultimo.totalCentavos)}` });
    }
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

  async function executar(id: string, acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, sucesso?: string) {
    marcarVisto(id);
    setOcupados((s) => new Set(s).add(id));
    try {
      const resultado = await acao();
      if (!resultado.ok) setAviso(resultado.erro);
      else if (sucesso) mostrar({ tom: "sucesso", titulo: sucesso });
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
    executar(p.id, () => alterarStatusAction({ pedidoId: p.id, de: p.status, para }), `#${p.numero} · ${ROTULO_STATUS[para]}`);
  const cancelar = (p: PedidoPainel, motivo: string) =>
    executar(p.id, () => alterarStatusAction({ pedidoId: p.id, de: p.status, para: "cancelado", motivo }), `#${p.numero} cancelado`);
  const reimprimir = (p: PedidoPainel) => executar(p.id, () => reimprimirAction(p.id), `#${p.numero} enviado para a impressora`);

  const colunasVisiveis = COLUNAS.filter((c) => c.id !== "pagamento" || (porColuna.get("pagamento")?.length ?? 0) > 0);
  const finalizados = porColuna.get("finalizados") ?? [];
  const pedidoSelecionado = selecionado ? pedidos.get(selecionado) : undefined;

  const ativos = lista.filter((p) => colunaDoStatus(p.status) !== "finalizados");
  const emAndamento = ativos.length;
  const tempoMedio = ativos.length ? Math.round(ativos.reduce((s, p) => s + minutosDesde(p.criadoEm, agora), 0) / ativos.length) : 0;
  const hoje = new Date(agora).toDateString();
  const faturamentoHoje = lista
    .filter((p) => new Date(p.criadoEm).toDateString() === hoje && p.status !== "cancelado" && p.status !== "aguardando_pagamento")
    .reduce((s, p) => s + p.totalCentavos, 0);

  return (
    <div className="flex h-[calc(100dvh-8.75rem)] flex-col md:h-dvh">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-5 sm:px-6 sm:pt-6">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Pedidos</h1>
          <p className="text-sm text-zinc-500">
            {emAndamento === 0 ? "Nenhum pedido em andamento" : `${emAndamento} em andamento`}
            {naoVistos.length > 0 && <span className="font-medium text-marca-600"> · {naoVistos.length} novo(s) aguardando</span>}
          </p>
        </div>
        <StatusConexao conexao={conexao} />
        {!somLiberado ? (
          <Botao variante="secundario" tamanho="sm" onClick={async () => setSomLiberado((await ativarSom()) || somAtivo())}>
            <BellRing className="size-3.5" /> Ativar som
          </Botao>
        ) : (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-zinc-500">
            <Bell className="size-3.5" /> Som ativo
          </span>
        )}
        <Botao variante={mostrarFinalizados ? "escuro" : "secundario"} tamanho="sm" onClick={() => setMostrarFinalizados((v) => !v)}>
          <History className="size-3.5" /> Finalizados <span className="opacity-60 tabular">{finalizados.length}</span>
        </Botao>
      </div>

      {/* Números do momento */}
      <div className="sem-barra flex gap-3 overflow-x-auto px-4 pt-4 sm:px-6">
        <Numero rotulo="Em andamento" valor={emAndamento} />
        <Numero rotulo="Novos aguardando" valor={naoVistos.length} destaque={naoVistos.length > 0} />
        <Numero rotulo="Tempo médio" valor={tempoMedio} sufixo=" min" />
        <Numero rotulo="Faturamento hoje" valor={faturamentoHoje} formatar={formatarReais} />
      </div>

      <AnimatePresence>
        {aviso && (
          <motion.div className="px-4 pt-3 sm:px-6" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <button onClick={() => setAviso(null)} className="flex w-full items-center gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-left text-[13px] text-red-800 ring-1 ring-red-200/70">
              <CircleAlert className="size-4 shrink-0" /> <span className="flex-1">{aviso}</span> <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <LayoutGroup>
        <div className="sem-barra flex flex-1 snap-x gap-3 overflow-x-auto p-4 sm:px-6">
          {colunasVisiveis.map((coluna) => {
            const itens = porColuna.get(coluna.id) ?? [];
            const estilo = ESTILO_COLUNA[coluna.id];
            return (
              <section key={coluna.id} className="flex w-[86vw] max-w-sm shrink-0 snap-start flex-col rounded-2xl bg-zinc-100/60 ring-1 ring-zinc-200/50 sm:w-80 lg:w-auto lg:max-w-none lg:min-w-0 lg:flex-1">
                <h2 className="flex items-center gap-2 px-3.5 pt-3 pb-2 text-[13px] font-medium text-zinc-700">
                  <span className={cn("size-2 rounded-full", estilo.ponto)} />
                  {coluna.titulo}
                  <motion.span
                    key={itens.length}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 24 }}
                    className="ml-auto rounded-md bg-white px-1.5 py-0.5 text-[11.5px] font-medium text-zinc-500 tabular shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-zinc-200/70"
                  >
                    {itens.length}
                  </motion.span>
                </h2>
                <div className="sem-barra flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {itens.length === 0 && (
                    <div className="mt-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300/80 px-4 py-10 text-center">
                      <estilo.Icone className="size-5 text-zinc-300" />
                      <span className="text-[13px] text-zinc-400">{coluna.vaziaTexto}</span>
                    </div>
                  )}
                  <AnimatePresence mode="popLayout">
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
                  </AnimatePresence>
                </div>
              </section>
            );
          })}

          <AnimatePresence>
            {mostrarFinalizados && (
              <motion.section
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ type: "spring", stiffness: 400, damping: 36 }}
                className="flex w-[86vw] max-w-sm shrink-0 snap-start flex-col rounded-2xl bg-zinc-100/60 ring-1 ring-zinc-200/50 sm:w-80"
              >
                <h2 className="flex items-center gap-2 px-3.5 pt-3 pb-2 text-[13px] font-medium text-zinc-500">
                  <History className="size-3.5" /> Finalizados · últimas 12h
                </h2>
                <div className="sem-barra flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
                  {finalizados.length === 0 && <p className="py-10 text-center text-[13px] text-zinc-400">Nada por aqui ainda</p>}
                  {finalizados.map((p) => (
                    <CartaoPedido key={p.id} pedido={p} agora={agora} compacto aoAbrir={() => setSelecionado(p.id)} />
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      <AnimatePresence>
      {pedidoSelecionado && (
        <DetalhePedido
          key={pedidoSelecionado.id}
          pedido={pedidoSelecionado}
          ocupado={ocupados.has(pedidoSelecionado.id)}
          aoFechar={() => setSelecionado(null)}
          aoAvancar={(para) => void avancar(pedidoSelecionado, para)}
          aoCancelar={(motivo) => void cancelar(pedidoSelecionado, motivo)}
          aoReimprimir={() => void reimprimir(pedidoSelecionado)}
        />
      )}
      </AnimatePresence>
    </div>
  );
}

const ESTILO_COLUNA: Record<ColunaQuadro, { ponto: string; Icone: typeof Bell }> = {
  pagamento: { ponto: "bg-violet-500", Icone: Hourglass },
  novos: { ponto: "bg-marca-500", Icone: Inbox },
  preparo: { ponto: "bg-amber-500", Icone: Flame },
  saida: { ponto: "bg-emerald-500", Icone: Bike },
  finalizados: { ponto: "bg-zinc-400", Icone: History },
};

/** Número que conta até o valor novo (sem animação com "reduzir movimento"). */
function Numero({ rotulo, valor, sufixo = "", destaque, formatar }: { rotulo: string; valor: number; sufixo?: string; destaque?: boolean; formatar?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anterior = useRef(valor);
  const reduzido = useReducedMotion();
  const texto = (v: number) => (formatar ? formatar(Math.round(v)) : `${Math.round(v)}${sufixo}`);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduzido) {
      el.textContent = texto(valor);
      anterior.current = valor;
      return;
    }
    const controle = animate(anterior.current, valor, { duration: 0.8, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => (el.textContent = texto(v)) });
    anterior.current = valor;
    return () => controle.stop();
  }, [valor, reduzido]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      className={cn(
        "min-w-[150px] flex-1 rounded-xl bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 transition-colors",
        destaque ? "ring-marca-200" : "ring-zinc-200/80"
      )}
    >
      <p className="text-[12px] text-zinc-500">{rotulo}</p>
      <span ref={ref} className={cn("text-xl font-semibold tracking-tight tabular", destaque && "text-marca-600")}>
        {texto(valor)}
      </span>
    </div>
  );
}

function StatusConexao({ conexao }: { conexao: Conexao }) {
  const estilo = {
    conectado: { cor: "bg-emerald-500", texto: "Ao vivo", Icone: null },
    conectando: { cor: "bg-zinc-400", texto: "Conectando...", Icone: Wifi },
    instavel: { cor: "bg-red-500", texto: "Conexão instável", Icone: WifiOff },
  }[conexao];
  return (
    <span
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-zinc-600"
      title={conexao === "instavel" ? "Atualizando a cada minuto até a conexão voltar" : undefined}
    >
      {estilo.Icone ? (
        <estilo.Icone className="size-3.5" />
      ) : (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
      )}
      {estilo.texto}
    </span>
  );
}
