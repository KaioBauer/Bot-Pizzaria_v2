"use client";

import { ArrowLeft, Bot, Hand, MessageCircle, MessagesSquare, Send, TriangleAlert, UserRound } from "lucide-react";
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

function nomeDoChat(a: AtendimentoPainel) {
  return a.clienteNome || (a.canal === "whatsapp" ? formatarTelefone(a.chatId) : `Telegram ${a.chatId}`);
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

export function Caixa({ inicial }: { inicial: AtendimentoPainel[] }) {
  const [atendimentos, setAtendimentos] = useState(inicial);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemPainel[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "atencao">(inicial.some((a) => a.precisaAtencao) ? "atencao" : "todas");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const selecionadoRef = useRef(selecionado);
  selecionadoRef.current = selecionado;

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
    setCarregando(true);
    setMensagens([]);
    void recarregarMensagens(selecionado).finally(() => setCarregando(false));
  }, [selecionado, recarregarMensagens]);

  // Chaves de propósito: no Chrome novo scrollIntoView devolve Promise, e o efeito não pode retornar nada.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, selecionado]);

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
    <main className="flex h-[calc(100dvh-7.5rem)] md:h-dvh">
      {/* Lista */}
      <section className={cn("flex w-full flex-col border-r border-stone-200 bg-white md:w-80 lg:w-96", atual && "hidden md:flex")}>
        <div className="border-b border-stone-100 p-4">
          <h1 className="font-display text-2xl font-semibold">Conversas</h1>
          <div className="mt-3 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm font-semibold">
            {(["atencao", "todas"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFiltro(f)} className={cn("flex-1 rounded-lg px-3 py-1.5", filtro === f ? "bg-white shadow-suave" : "text-stone-500")}>
                {f === "atencao" ? `Precisam de você${pendentes ? ` (${pendentes})` : ""}` : "Todas"}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 divide-y divide-stone-100 overflow-y-auto">
          {lista.length === 0 && (
            <li className="p-8 text-center text-sm text-stone-500">{filtro === "atencao" ? "Ninguém esperando atendimento 🎉" : "Nenhuma conversa ainda."}</li>
          )}
          {lista.map((a) => (
            <li key={chave(a)}>
              <button
                type="button"
                onClick={() => setSelecionado(chave(a))}
                className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-stone-50", chave(a) === selecionado && "bg-marca-50/60", a.precisaAtencao && "bg-amber-50")}
              >
                <span className="relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-100">
                  <UserRound className="size-5 text-stone-500" />
                  <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-white p-0.5">
                    <IconeCanal canal={a.canal} className="size-3.5" />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-semibold">{nomeDoChat(a)}</span>
                    <span className="ml-auto shrink-0 text-xs text-stone-400 tabular">{hora(a.ultimaMensagemEm)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-stone-500">
                    {a.ultimaMensagemAutor === "ia" ? "IA: " : a.ultimaMensagemAutor === "atendente" ? "Você: " : ""}
                    {a.ultimaMensagem ?? ""}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {a.precisaAtencao && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-amber-950">Precisa de atendimento</span>}
                    {a.iaPausada && <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[11px] font-semibold text-white">Atendente no comando</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Conversa */}
      <section className={cn("flex min-w-0 flex-1 flex-col bg-creme-50", !atual && "hidden md:flex")}>
        {!atual ? (
          <div className="m-auto">
            <Vazio icone={<MessagesSquare className="size-6" />} titulo="Escolha uma conversa" descricao="As conversas que precisam de você aparecem primeiro, com aviso sonoro." />
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
              <button type="button" onClick={() => setSelecionado(null)} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 md:hidden" aria-label="Voltar">
                <ArrowLeft className="size-5" />
              </button>
              <IconeCanal canal={atual.canal} className="size-5" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{nomeDoChat(atual)}</p>
                <p className="text-xs text-stone-500">
                  {atual.canal === "whatsapp" ? `WhatsApp · ${formatarTelefone(atual.chatId)}` : "Telegram"} ·{" "}
                  {atual.iaPausada ? "IA pausada — você responde" : "IA respondendo"}
                </p>
              </div>
              {atual.iaPausada ? (
                <Botao tamanho="sm" variante="secundario" onClick={() => void acao(() => definirIaPausada(clienteNavegador(), atual.canal, atual.chatId, false))}>
                  <Bot className="size-4" /> Devolver para a IA
                </Botao>
              ) : (
                <Botao tamanho="sm" variante="escuro" onClick={() => void acao(() => definirIaPausada(clienteNavegador(), atual.canal, atual.chatId, true))}>
                  <Hand className="size-4" /> Assumir conversa
                </Botao>
              )}
            </header>

            {atual.precisaAtencao && (
              <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p className="flex-1">
                  <b>{atual.pausadaPor === "ia" ? "A IA chamou um atendente" : "O cliente está esperando resposta"}</b>
                  {atual.motivo ? ` — ${atual.motivo}` : ""}
                </p>
                <button type="button" onClick={() => void acao(() => marcarAtendido(clienteNavegador(), atual.canal, atual.chatId))} className="shrink-0 font-semibold underline">
                  Dispensar aviso
                </button>
              </div>
            )}

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {carregando && <p className="text-center text-sm text-stone-400">Carregando...</p>}
              {mensagens.map((m) => {
                const doCliente = m.autor === "cliente";
                return (
                  <div key={m.chave} className={cn("flex", doCliente ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-suave sm:max-w-[70%]",
                        doCliente && "rounded-bl-md bg-white text-stone-900 ring-1 ring-stone-900/5",
                        m.autor === "ia" && "rounded-br-md bg-stone-200 text-stone-800",
                        m.autor === "atendente" && "rounded-br-md bg-marca-600 text-white",
                        m.autor === "sistema" && "bg-stone-100 text-stone-500 italic"
                      )}
                    >
                      {!doCliente && (
                        <p className={cn("mb-0.5 text-[11px] font-bold tracking-wide uppercase", m.autor === "atendente" ? "text-marca-100" : "text-stone-500")}>
                          {m.autor === "ia" ? "IA" : m.autor === "atendente" ? "Atendente" : "Sistema"}
                        </p>
                      )}
                      <p className="break-words whitespace-pre-wrap">{m.texto}</p>
                      <p className={cn("mt-1 text-right text-[11px]", m.autor === "atendente" ? "text-marca-100" : "text-stone-400")}>
                        {m.envio === "enviando" ? "enviando..." : m.envio === "falhou" ? `não enviada${m.erro ? `: ${m.erro.slice(0, 60)}` : ""}` : hora(m.em)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={fim} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enviar();
              }}
              className="border-t border-stone-200 bg-white p-3"
            >
              {erro && <p role="alert" className="mb-2 text-sm font-medium text-red-700">{erro}</p>}
              <div className="flex items-end gap-2">
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
                  placeholder={atual.iaPausada ? "Escreva sua resposta..." : "Responder (a IA será pausada nesta conversa)"}
                  className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl bg-stone-100 px-4 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-marca-600"
                />
                <Botao type="submit" disabled={!texto.trim() || enviando} className="h-11 rounded-2xl" aria-label="Enviar">
                  <Send className="size-4" />
                </Botao>
              </div>
              <p className="mt-1.5 text-xs text-stone-400">Enter envia · Shift+Enter quebra a linha</p>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
