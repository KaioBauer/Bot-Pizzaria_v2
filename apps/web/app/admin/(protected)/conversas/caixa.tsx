"use client";

import { ArrowLeft, ArrowUp, Bot, Hand, MessageCircle, MessagesSquare, Send, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definirIaPausada,
  enviarMensagemAtendente,
  listarAtendimentos,
  marcarAtendido,
  mensagensDoChat,
  type AtendimentoPainel,
  type MensagemPainel,
} from "@pizzaria/db";
import { formatarTelefone, type Canal } from "@pizzaria/shared";
import { Botao, cn, Vazio } from "../../../../components/ui";
import { clienteNavegador } from "../../../../lib/supabase/navegador";

const chave = (a: { canal: Canal; chatId: string }) => `${a.canal}:${a.chatId}`;

const MOLA = { type: "spring", stiffness: 400, damping: 32 } as const;

function nomeDoChat(a: AtendimentoPainel) {
  return a.clienteNome || formatarTelefone(a.chatId);
}

/** Iniciais para o avatar; sem nome (só número) vira "#". */
function iniciais(a: AtendimentoPainel) {
  if (!a.clienteNome) return "#";
  const partes = a.clienteNome.trim().split(/\s+/).filter((p) => /\p{L}/u.test(p));
  if (partes.length === 0) return "#";
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

function hora(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function IconeCanal({ canal, className }: { canal: Canal; className?: string }) {
  return canal === "whatsapp" ? <MessageCircle className={cn("text-[#25D366]", className)} /> : <Send className={cn("text-[#229ED9]", className)} />;
}

function Avatar({ atendimento, tamanho = "md" }: { atendimento: AtendimentoPainel; tamanho?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-zinc-100 to-zinc-200/80 font-medium text-zinc-600 ring-1 ring-zinc-900/5 ring-inset",
        tamanho === "md" ? "size-9 text-[12.5px]" : "size-8 text-[12px]"
      )}
    >
      {iniciais(atendimento)}
      <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
        <IconeCanal canal={atendimento.canal} className="size-2.5" />
      </span>
    </span>
  );
}

const ROTULO_AUTOR = { ia: "IA", atendente: "Você", sistema: "Sistema", cliente: "Cliente" } as const;

export function Caixa({ inicial }: { inicial: AtendimentoPainel[] }) {
  const [atendimentos, setAtendimentos] = useState(inicial);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemPainel[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "atencao">(inicial.some((a) => a.precisaAtencao) ? "atencao" : "todas");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const reduzido = useReducedMotion() ?? false;
  const fim = useRef<HTMLDivElement>(null);
  const selecionadoRef = useRef(selecionado);
  selecionadoRef.current = selecionado;
  // Mensagens já mostradas: só as que chegam depois da primeira carga animam a entrada.
  const vistas = useRef(new Set<string>());
  const carregouConversa = useRef(false);

  const atual = atendimentos.find((a) => chave(a) === selecionado) ?? null;
  const lista = useMemo(
    () =>
      [...atendimentos]
        .filter((a) => filtro === "todas" || a.precisaAtencao)
        .sort((a, b) => Number(b.precisaAtencao) - Number(a.precisaAtencao) || b.ultimaMensagemEm.localeCompare(a.ultimaMensagemEm)),
    [atendimentos, filtro]
  );
  const pendentes = atendimentos.filter((a) => a.precisaAtencao).length;

  const recarregarLista = useCallback(async () => {
    const novos = await listarAtendimentos(clienteNavegador()).catch(() => null);
    if (novos) setAtendimentos(novos);
  }, []);

  const recarregarMensagens = useCallback(async (alvo: string | null = selecionadoRef.current) => {
    if (!alvo) return;
    const [canal, ...resto] = alvo.split(":");
    const lidas = await mensagensDoChat(clienteNavegador(), canal as Canal, resto.join(":")).catch(() => null);
    if (lidas && selecionadoRef.current === alvo) setMensagens(lidas);
  }, []);

  // Realtime: qualquer mudança recarrega a lista e a conversa aberta (consultas pequenas).
  useEffect(() => {
    const supabase = clienteNavegador();
    let cancelado = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const agendar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => {
        void recarregarLista();
        void recarregarMensagens();
      }, 250);
    };
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelado) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      canal = supabase
        .channel("painel-conversas")
        .on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, agendar)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversa_mensagens" }, agendar)
        .on("postgres_changes", { event: "*", schema: "public", table: "mensagens_atendente" }, agendar)
        .subscribe((estado) => estado === "SUBSCRIBED" && agendar());
    });
    const recarga = setInterval(agendar, 30_000);
    return () => {
      cancelado = true;
      clearInterval(recarga);
      if (espera) clearTimeout(espera);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [recarregarLista, recarregarMensagens]);

  useEffect(() => {
    if (!selecionado) return;
    vistas.current = new Set();
    carregouConversa.current = false;
    setCarregando(true);
    setMensagens([]);
    void recarregarMensagens(selecionado).finally(() => setCarregando(false));
  }, [selecionado, recarregarMensagens]);

  // Chaves de propósito: no Chrome novo scrollIntoView devolve Promise, e o efeito não pode retornar nada.
  useEffect(() => {
    // Na primeira carga pula direto para o fim; depois rola suave até a mensagem nova.
    fim.current?.scrollIntoView({ block: "end", behavior: carregouConversa.current && !reduzido ? "smooth" : "auto" });
  }, [mensagens.length, selecionado, reduzido]);

  useEffect(() => {
    for (const m of mensagens) vistas.current.add(m.chave);
    if (mensagens.length > 0) carregouConversa.current = true;
  }, [mensagens]);

  async function acao(fn: () => Promise<void>) {
    setErro(null);
    try {
      await fn();
      await Promise.all([recarregarLista(), recarregarMensagens()]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir");
    }
  }

  async function enviar() {
    if (!atual || !texto.trim() || enviando) return;
    setEnviando(true);
    await acao(async () => {
      await enviarMensagemAtendente(clienteNavegador(), atual.canal, atual.chatId, texto);
      setTexto("");
    });
    setEnviando(false);
  }

  return (
    <main className="flex h-[calc(100dvh-7.5rem)] bg-white md:h-dvh">
      {/* Lista */}
      <section className={cn("flex w-full flex-col border-r border-zinc-200/80 bg-white md:w-80 lg:w-[22rem]", atual && "hidden md:flex")}>
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Conversas</h1>
            <span className="text-[12px] text-zinc-400 tabular">{atendimentos.length}</span>
          </div>
          <div className="mt-3 flex rounded-lg bg-zinc-100/80 p-0.5 ring-1 ring-zinc-200/60 ring-inset" role="tablist" aria-label="Filtro de conversas">
            {(["atencao", "todas"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filtro === f}
                onClick={() => setFiltro(f)}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-zinc-900",
                  filtro === f ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800"
                )}
              >
                {filtro === f && (
                  <motion.span
                    layoutId="filtro-conversas"
                    aria-hidden
                    className="absolute inset-0 rounded-md bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)]"
                    transition={reduzido ? { duration: 0 } : MOLA}
                  />
                )}
                <span className="relative">{f === "atencao" ? "Precisam de você" : "Todas"}</span>
                {f === "atencao" && pendentes > 0 && (
                  <span className="relative rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800 tabular">{pendentes}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <ul className="sem-barra flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {lista.length === 0 && (
            <li>
              <Vazio
                icone={<MessagesSquare className="size-5" />}
                titulo={filtro === "atencao" ? "Ninguém esperando atendimento" : "Nenhuma conversa ainda"}
                descricao={filtro === "atencao" ? "Quando um cliente precisar de uma pessoa, a conversa aparece aqui." : undefined}
              />
            </li>
          )}
          <AnimatePresence initial={false}>
            {lista.map((a) => {
              const ativo = chave(a) === selecionado;
              return (
                <motion.li
                  key={chave(a)}
                  layout={reduzido ? false : "position"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    type="button"
                    onClick={() => setSelecionado(chave(a))}
                    aria-current={ativo ? "true" : undefined}
                    className={cn(
                      "relative flex w-full gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900",
                      ativo ? "bg-zinc-100" : "hover:bg-zinc-50"
                    )}
                  >
                    <Avatar atendimento={a} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate text-[13.5px]", a.precisaAtencao ? "font-semibold text-zinc-900" : "font-medium text-zinc-800")}>{nomeDoChat(a)}</span>
                        <span className={cn("ml-auto shrink-0 text-[11.5px] tabular", a.precisaAtencao ? "text-amber-700" : "text-zinc-400")}>{hora(a.ultimaMensagemEm)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", a.precisaAtencao ? "text-zinc-700" : "text-zinc-500")}>
                          {a.ultimaMensagemAutor === "ia" ? <span className="text-zinc-400">IA: </span> : a.ultimaMensagemAutor === "atendente" ? <span className="text-zinc-400">Você: </span> : ""}
                          {a.ultimaMensagem ?? ""}
                        </span>
                        {a.iaPausada && (
                          <span title="Atendente no comando (IA pausada)" className="shrink-0">
                            <Hand className="size-3.5 text-zinc-400" aria-label="Atendente no comando" />
                          </span>
                        )}
                        {a.precisaAtencao && (
                          <span className="relative flex size-2 shrink-0" title="Precisa de atendimento" aria-label="Precisa de atendimento">
                            <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-60 motion-safe:animate-ping" />
                            <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </section>

      {/* Conversa */}
      <section className={cn("flex min-w-0 flex-1 flex-col bg-zinc-50/60", !atual && "hidden md:flex")}>
        {!atual ? (
          <div className="m-auto motion-safe:animate-[entrada_0.4s_ease-out_both]">
            <Vazio icone={<MessagesSquare className="size-5" />} titulo="Escolha uma conversa" descricao="As conversas que precisam de você aparecem primeiro, com aviso sonoro." />
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200/80 bg-white/85 px-4 py-2.5 backdrop-blur">
              <button
                type="button"
                onClick={() => setSelecionado(null)}
                className="-ml-1 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 md:hidden"
                aria-label="Voltar"
              >
                <ArrowLeft className="size-4.5" />
              </button>
              <Avatar atendimento={atual} tamanho="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold tracking-tight text-zinc-900">{nomeDoChat(atual)}</p>
                <p className="flex items-center gap-1.5 text-[12px] text-zinc-500">
                  <span className={cn("size-1.5 rounded-full", atual.iaPausada ? "bg-zinc-400" : "bg-emerald-500")} />
                  WhatsApp · <span className="tabular">{formatarTelefone(atual.chatId)}</span>{" "}
                  · {atual.iaPausada ? "IA pausada — você responde" : "IA respondendo"}
                </p>
              </div>
              {atual.iaPausada ? (
                <Botao tamanho="sm" variante="secundario" onClick={() => void acao(() => definirIaPausada(clienteNavegador(), atual.canal, atual.chatId, false))}>
                  <Bot className="size-3.5" /> Devolver para a IA
                </Botao>
              ) : (
                <Botao tamanho="sm" variante="escuro" onClick={() => void acao(() => definirIaPausada(clienteNavegador(), atual.canal, atual.chatId, true))}>
                  <Hand className="size-3.5" /> Assumir conversa
                </Botao>
              )}
            </header>

            <AnimatePresence initial={false}>
              {atual.precisaAtencao && (
                <motion.div
                  key="aviso"
                  initial={reduzido ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={reduzido ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2.5 border-b border-amber-200/70 bg-amber-50/80 px-4 py-2.5 text-[13px] text-amber-900">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    <p className="flex-1">
                      <b className="font-medium">{atual.pausadaPor === "ia" ? "A IA chamou um atendente" : "O cliente está esperando resposta"}</b>
                      {atual.motivo ? <span className="text-amber-800"> — {atual.motivo}</span> : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => void acao(() => marcarAtendido(clienteNavegador(), atual.canal, atual.chatId))}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-amber-800 transition-colors hover:bg-amber-100"
                    >
                      <X className="size-3" /> Dispensar aviso
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
              {carregando && mensagens.length === 0 && (
                <div className="space-y-3" aria-label="Carregando mensagens">
                  {[56, 40, 64, 32].map((w, i) => (
                    <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                      <div className="h-9 animate-pulse rounded-2xl bg-zinc-200/60" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              )}
              <div className="mx-auto flex max-w-3xl flex-col">
                {mensagens.map((m, i) => {
                  const doCliente = m.autor === "cliente";
                  const anterior = mensagens[i - 1];
                  const agrupada = anterior?.autor === m.autor;
                  const nova = carregouConversa.current && !vistas.current.has(m.chave);

                  if (m.autor === "sistema") {
                    return (
                      <motion.div
                        key={m.chave}
                        initial={nova && !reduzido ? { opacity: 0, y: 6 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        className="my-3 flex justify-center"
                      >
                        <p className="max-w-[85%] rounded-full bg-zinc-100 px-3 py-1 text-center text-[12px] text-zinc-500 ring-1 ring-zinc-200/60 ring-inset">{m.texto}</p>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={m.chave}
                      initial={nova && !reduzido ? { opacity: 0, y: 8, scale: 0.98 } : false}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={MOLA}
                      className={cn("flex flex-col", doCliente ? "items-start" : "items-end", agrupada ? "mt-1" : "mt-4 first:mt-0")}
                    >
                      {!agrupada && !doCliente && (
                        <span className="mb-1 flex items-center gap-1 px-1 text-[11.5px] font-medium text-zinc-400">
                          {m.autor === "ia" && <Bot className="size-3" />}
                          {ROTULO_AUTOR[m.autor]}
                        </span>
                      )}
                      <div
                        className={cn(
                          "max-w-[85%] origin-bottom rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed sm:max-w-[68%]",
                          doCliente && "bg-zinc-200/60 text-zinc-900",
                          doCliente && agrupada && "rounded-tl-md",
                          m.autor === "ia" && "bg-white text-zinc-800 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-zinc-200/80",
                          m.autor === "atendente" && "bg-zinc-900 text-white shadow-[0_1px_2px_rgb(0_0_0/0.15)]",
                          !doCliente && agrupada && "rounded-tr-md",
                          m.envio === "falhou" && "ring-1 ring-red-300"
                        )}
                      >
                        <p className="break-words whitespace-pre-wrap">{m.texto}</p>
                      </div>
                      <span
                        className={cn(
                          "mt-1 px-1 text-[11px] tabular",
                          m.envio === "falhou" ? "text-red-600" : m.envio === "enviando" ? "text-zinc-400 motion-safe:animate-pulse" : "text-zinc-400"
                        )}
                      >
                        {m.envio === "enviando" ? "enviando..." : m.envio === "falhou" ? `não enviada${m.erro ? `: ${m.erro.slice(0, 60)}` : ""}` : hora(m.em)}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
              <div ref={fim} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enviar();
              }}
              className="bg-gradient-to-t from-white via-white to-white/0 px-4 pt-2 pb-3 sm:px-6"
            >
              <div className="mx-auto max-w-3xl">
                <AnimatePresence>
                  {erro && (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mb-2 text-[13px] font-medium text-red-600"
                    >
                      {erro}
                    </motion.p>
                  )}
                </AnimatePresence>
                <div className="flex items-end gap-2 rounded-xl bg-white p-1.5 pl-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-16px_rgb(0_0_0/0.2)] ring-1 ring-zinc-200 transition-shadow focus-within:ring-2 focus-within:ring-zinc-900/80">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviar();
                      }
                    }}
                    rows={1}
                    maxLength={4000}
                    aria-label="Mensagem"
                    placeholder={atual.iaPausada ? "Escreva sua resposta..." : "Responder (a IA será pausada nesta conversa)"}
                    className="field-sizing-content max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] text-zinc-900 outline-none placeholder:text-zinc-400"
                  />
                  <motion.button
                    type="submit"
                    disabled={!texto.trim() || enviando}
                    aria-label="Enviar"
                    whileTap={reduzido ? undefined : { scale: 0.92 }}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
                      texto.trim() && !enviando ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-zinc-100 text-zinc-400"
                    )}
                  >
                    <ArrowUp className="size-4" />
                  </motion.button>
                </div>
                <p className="mt-1.5 px-1 text-[11.5px] text-zinc-400">
                  <kbd className="font-sans">Enter</kbd> envia · <kbd className="font-sans">Shift+Enter</kbd> quebra a linha
                </p>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
