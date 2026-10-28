"use client";

import { ArrowRight, ArrowUpRight, Ban, Banknote, Bike, CreditCard, Link2, MapPin, MessageCircle, Phone, Printer, QrCode, Store, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { entregaDoPedido, historicoStatusPedido, type EntregaDoPedido, type PedidoPainel } from "@pizzaria/db";
import { formatarReais, formatarTelefone, ROTULO_PAGAMENTO, ROTULO_STATUS, statusFinal, type StatusPedido } from "@pizzaria/shared";
import { Botao, cn, estiloEntrada, Selo } from "../../../../components/ui";
import { acaoPrincipal, rotuloCanal } from "../../../../lib/quadro";
import { clienteNavegador } from "../../../../lib/supabase/navegador";

const MOTIVOS = ["Cliente desistiu", "Endereço fora da área de entrega", "Item em falta", "Pagamento não confirmado", "Pedido duplicado"];

const ICONE_PAGAMENTO = { pix: QrCode, dinheiro: Banknote, cartao: CreditCard } as const;

const MOLA = { type: "spring", stiffness: 400, damping: 36 } as const;

type Historico = Awaited<ReturnType<typeof historicoStatusPedido>>;

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Secao({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="px-6 py-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-medium text-zinc-500">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Linha "rótulo: valor" da lista de metadados. */
function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-start gap-3 py-1.5 text-[13px]">
      <dt className="text-zinc-500">{rotulo}</dt>
      <dd className="min-w-0 text-zinc-900">{children}</dd>
    </div>
  );
}

const estiloLinkSutil =
  "inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-zinc-600 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

export function DetalhePedido(props: {
  pedido: PedidoPainel;
  ocupado: boolean;
  aoFechar: () => void;
  aoAvancar: (para: StatusPedido) => void;
  aoCancelar: (motivo: string) => void;
  aoReimprimir: () => void;
}) {
  const { pedido } = props;
  const reduzido = useReducedMotion() ?? false;
  const [historico, setHistorico] = useState<Historico>([]);
  const [entrega, setEntrega] = useState<EntregaDoPedido | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const fechar = useRef<HTMLButtonElement>(null);
  const acao = acaoPrincipal(pedido.status, pedido.tipoEntrega);
  const telefone = pedido.clienteTelefone?.replace(/\D/g, "");
  const IconePagamento = ICONE_PAGAMENTO[pedido.formaPagamento];
  const tomStatus = pedido.status === "cancelado" ? "perigo" : statusFinal(pedido.status) ? "sucesso" : "marca";

  useEffect(() => {
    historicoStatusPedido(clienteNavegador(), pedido.id).then(setHistorico).catch(() => setHistorico([]));
    if (pedido.tipoEntrega === "entrega") entregaDoPedido(clienteNavegador(), pedido.id).then(setEntrega).catch(() => setEntrega(null));
  }, [pedido.id, pedido.status, pedido.tipoEntrega]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && props.aoFechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [props]);

  // Foco no painel ao abrir (teclado e leitor de tela).
  useEffect(() => {
    fechar.current?.focus({ preventScroll: true });
  }, [pedido.id]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-zinc-950/25 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={props.aoFechar}
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`Pedido ${pedido.numero}`}
        initial={reduzido ? { opacity: 0 } : { x: "100%" }}
        animate={reduzido ? { opacity: 1 } : { x: 0 }}
        transition={reduzido ? { duration: 0.15 } : MOLA}
        className="relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06),-24px_0_60px_-20px_rgb(0_0_0/0.25)] sm:m-2 sm:h-[calc(100%-1rem)] sm:rounded-2xl"
      >
        {/* Cabeçalho */}
        <header className="flex items-start gap-3 border-b border-zinc-100 px-6 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
                Pedido <span className="tabular">#{pedido.numero}</span>
              </h2>
              <Selo tom={tomStatus}>
                <span className={cn("size-1.5 rounded-full", tomStatus === "perigo" ? "bg-red-500" : tomStatus === "sucesso" ? "bg-emerald-500" : "bg-marca-500")} />
                {ROTULO_STATUS[pedido.status]}
              </Selo>
              {pedido.canal === "link" && (
                <Selo tom="violeta">
                  <Link2 className="size-3" /> {rotuloCanal(pedido.canal)}
                </Selo>
              )}
            </div>
            <p className="mt-1 text-[13px] text-zinc-500">
              Feito às <span className="tabular">{hora(pedido.criadoEm)}</span>{" "}
              {pedido.canal === "link" ? "pelo link (cliente montou na página)" : `pelo ${rotuloCanal(pedido.canal)}`}
            </p>
          </div>
          <button
            ref={fechar}
            onClick={props.aoFechar}
            aria-label="Fechar"
            className="-mr-2 inline-flex items-center gap-1.5 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-900"
          >
            <kbd className="hidden rounded border border-zinc-200 px-1 font-sans text-[10.5px] text-zinc-400 sm:inline">Esc</kbd>
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 divide-y divide-zinc-100 overflow-y-auto overscroll-contain">
          {/* Metadados */}
          <section className="px-6 py-4 motion-safe:animate-[entrada_0.35s_ease-out_both]">
            <dl>
              <Linha rotulo="Cliente">
                <span className="font-medium">{pedido.clienteNome}</span>
              </Linha>
              {telefone && (
                <Linha rotulo="Telefone">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <a href={`tel:${telefone}`} className={cn(estiloLinkSutil, "text-[13px] text-zinc-900 tabular")}>
                      <Phone className="size-3.5 text-zinc-400" /> {formatarTelefone(telefone)}
                    </a>
                    <a href={`https://wa.me/55${telefone.replace(/^55/, "")}`} target="_blank" rel="noreferrer" className={cn(estiloLinkSutil, "text-emerald-700 hover:text-emerald-800")}>
                      <MessageCircle className="size-3.5" /> WhatsApp
                    </a>
                  </div>
                </Linha>
              )}
              <Linha rotulo={pedido.tipoEntrega === "entrega" ? "Entrega" : "Retirada"}>
                <span className="flex items-start gap-1.5">
                  {pedido.tipoEntrega === "entrega" ? <Bike className="mt-0.5 size-3.5 shrink-0 text-zinc-400" /> : <Store className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />}
                  <span>{pedido.enderecoTexto ?? "Cliente retira no balcão"}</span>
                </span>
                {pedido.enderecoTexto && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.enderecoTexto)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(estiloLinkSutil, "mt-1")}
                  >
                    <MapPin className="size-3.5" /> Abrir no mapa <ArrowUpRight className="size-3" />
                  </a>
                )}
              </Linha>
              <Linha rotulo="Pagamento">
                <span className="flex items-center gap-1.5">
                  <IconePagamento className="size-3.5 text-zinc-400" /> {ROTULO_PAGAMENTO[pedido.formaPagamento]}
                </span>
                {pedido.trocoParaCentavos !== null && (
                  <span className="mt-0.5 block text-zinc-500">
                    Troco para <span className="tabular">{formatarReais(pedido.trocoParaCentavos)}</span> ·{" "}
                    <b className="font-medium text-zinc-900">
                      levar <span className="tabular">{formatarReais(pedido.trocoParaCentavos - pedido.totalCentavos)}</span>
                    </b>
                  </span>
                )}
              </Linha>
            </dl>

            {pedido.motivoCancelamento && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800 ring-1 ring-red-200/70 ring-inset">Cancelado: {pedido.motivoCancelamento}</p>
            )}
          </section>

          {entrega && (
            <Secao titulo="Motoboy">
              <div className="space-y-3 rounded-xl bg-zinc-50/70 p-3.5 ring-1 ring-zinc-200/70 ring-inset">
                <p className="text-[13px] text-zinc-700">
                  <b className="font-medium text-zinc-900">{entrega.entregadorNome ?? "Motoboy"}</b>
                  {entrega.iniciadaEm && (
                    <>
                      {" "}saiu às <span className="tabular">{hora(entrega.iniciadaEm)}</span>
                    </>
                  )}
                  {entrega.entregueEm && (
                    <>
                      {" "}· entregou às <span className="tabular">{hora(entrega.entregueEm)}</span>
                    </>
                  )}
                </p>
                {entrega.valorRecebidoCentavos !== null && (
                  <p className="text-[13px] text-zinc-500">
                    Recebeu <span className="tabular text-zinc-900">{formatarReais(entrega.valorRecebidoCentavos)}</span>
                    {pedido.formaPagamento === "dinheiro" &&
                      entrega.valorRecebidoCentavos > pedido.totalCentavos &&
                      ` · troco de ${formatarReais(entrega.valorRecebidoCentavos - pedido.totalCentavos)}`}
                  </p>
                )}
                {entrega.fotoUrl && (
                  <a href={entrega.fotoUrl} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg ring-1 ring-zinc-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entrega.fotoUrl} alt="Foto da entrega" className="max-h-64 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                  </a>
                )}
                {entrega.local && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${entrega.local.lat},${entrega.local.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className={estiloLinkSutil}
                  >
                    <MapPin className="size-3.5" /> Onde a foto foi tirada{entrega.local.precisaoM ? ` (±${Math.round(entrega.local.precisaoM)} m)` : ""}
                  </a>
                )}
              </div>
            </Secao>
          )}

          <Secao titulo={`Itens · ${pedido.itens.length}`}>
            <ul className="space-y-2.5">
              {pedido.itens.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 text-[13.5px]">
                  <div className="flex min-w-0 gap-2">
                    <span className="w-6 shrink-0 text-zinc-400 tabular">{item.quantidade}×</span>
                    <div className="min-w-0">
                      <p className="text-zinc-900">{item.descricao}</p>
                      {item.observacao && <p className="mt-0.5 text-[12.5px] text-marca-700">{item.observacao}</p>}
                    </div>
                  </div>
                  <span className="shrink-0 text-zinc-700 tabular">{formatarReais(item.subtotalCentavos)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-dashed border-zinc-200 pt-3 text-[13px]">
              {pedido.taxaEntregaCentavos > 0 && (
                <>
                  <div className="flex justify-between text-zinc-500">
                    <dt>Subtotal</dt>
                    <dd className="tabular">{formatarReais(pedido.subtotalCentavos)}</dd>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <dt>Taxa de entrega</dt>
                    <dd className="tabular">{formatarReais(pedido.taxaEntregaCentavos)}</dd>
                  </div>
                </>
              )}
              <div className="flex items-baseline justify-between pt-1 text-zinc-900">
                <dt className="font-medium">Total</dt>
                <dd className="text-lg font-semibold tracking-tight tabular">{formatarReais(pedido.totalCentavos)}</dd>
              </div>
            </dl>
            {pedido.observacoes && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 ring-1 ring-amber-200/70 ring-inset">
                <span className="font-medium">Observação:</span> {pedido.observacoes}
              </p>
            )}
          </Secao>

          {historico.length > 0 && (
            <Secao titulo="Atividade">
              <ol className="relative">
                {historico.map((h, i) => {
                  const ultimo = i === historico.length - 1;
                  return (
                    <motion.li
                      key={i}
                      initial={reduzido ? false : { opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: reduzido ? 0 : i * 0.04, duration: 0.25, ease: "easeOut" }}
                      className="relative flex items-center gap-3 pb-4 pl-6 text-[13px] last:pb-0"
                    >
                      {!ultimo && <span aria-hidden className="absolute top-3 bottom-[-4px] left-[5px] w-px bg-zinc-200" />}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-1/2 left-0 size-[11px] -translate-y-1/2 rounded-full ring-[3px] ring-white",
                          ultimo ? "bg-zinc-900" : "border border-zinc-300 bg-white"
                        )}
                      />
                      <span className={cn(ultimo ? "font-medium text-zinc-900" : "text-zinc-600")}>{ROTULO_STATUS[h.para]}</span>
                      <span className="ml-auto text-[12px] text-zinc-400 tabular">{hora(h.em)}</span>
                    </motion.li>
                  );
                })}
              </ol>
            </Secao>
          )}
        </div>

        {/* Rodapé fixo com as ações */}
        <footer className="border-t border-zinc-100 bg-white/90 p-4 backdrop-blur sm:rounded-b-2xl">
          <AnimatePresence mode="wait" initial={false}>
            {cancelando ? (
              <motion.div
                key="cancelar"
                initial={reduzido ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduzido ? 0 : 4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-3"
              >
                <p className="text-[13px] font-medium text-zinc-900">
                  Motivo do cancelamento <span className="font-normal text-zinc-500">· o cliente recebe esta mensagem</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMotivo(m)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[12.5px] ring-1 ring-inset transition-colors active:scale-[0.98]",
                        motivo === m ? "bg-red-50 text-red-700 ring-red-300" : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ou escreva o motivo" className={estiloEntrada} />
                <div className="flex gap-2">
                  <Botao variante="secundario" className="flex-1" onClick={() => setCancelando(false)}>
                    Voltar
                  </Botao>
                  <Botao
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    disabled={!motivo.trim() || props.ocupado}
                    onClick={() => {
                      props.aoCancelar(motivo.trim());
                      setCancelando(false);
                    }}
                  >
                    Confirmar cancelamento
                  </Botao>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="acoes"
                initial={reduzido ? { opacity: 0 } : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-2"
              >
                {acao && (
                  <Botao tamanho="lg" className="group w-full" disabled={props.ocupado} onClick={() => props.aoAvancar(acao.para)}>
                    {props.ocupado ? "Salvando..." : acao.rotulo}
                    {!props.ocupado && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
                  </Botao>
                )}
                <div className="flex gap-2">
                  <Botao variante="secundario" className="flex-1" disabled={props.ocupado || pedido.status === "aguardando_pagamento"} onClick={props.aoReimprimir}>
                    <Printer className="size-4 text-zinc-500" /> Reimprimir
                  </Botao>
                  {!statusFinal(pedido.status) && (
                    <Botao variante="fantasma" className="flex-1 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setCancelando(true)}>
                      <Ban className="size-4" /> Cancelar pedido
                    </Botao>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </footer>
      </motion.aside>
    </div>
  );
}
