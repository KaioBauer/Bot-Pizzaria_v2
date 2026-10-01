"use client";

import { ArrowRight, Ban, Banknote, Bike, CreditCard, MapPin, MessageCircle, Phone, Printer, QrCode, Store, X } from "lucide-react";
import { useEffect, useState } from "react";
import { historicoStatusPedido, type PedidoPainel } from "@pizzaria/db";
import { formatarReais, formatarTelefone, ROTULO_PAGAMENTO, ROTULO_STATUS, statusFinal, type StatusPedido } from "@pizzaria/shared";
import { Botao, cn, estiloEntrada, Selo } from "../../../../components/ui";
import { acaoPrincipal } from "../../../../lib/quadro";
import { clienteNavegador } from "../../../../lib/supabase/navegador";

const MOTIVOS = ["Cliente desistiu", "Endereço fora da área de entrega", "Item em falta", "Pagamento não confirmado", "Pedido duplicado"];

const ICONE_PAGAMENTO = { pix: QrCode, dinheiro: Banknote, cartao: CreditCard } as const;

type Historico = Awaited<ReturnType<typeof historicoStatusPedido>>;

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wider text-stone-400 uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

export function DetalhePedido(props: {
  pedido: PedidoPainel;
  ocupado: boolean;
  aoFechar: () => void;
  aoAvancar: (para: StatusPedido) => void;
  aoCancelar: (motivo: string) => void;
  aoReimprimir: () => void;
}) {
  const { pedido } = props;
  const [historico, setHistorico] = useState<Historico>([]);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const acao = acaoPrincipal(pedido.status, pedido.tipoEntrega);
  const telefone = pedido.clienteTelefone?.replace(/\D/g, "");
  const IconePagamento = ICONE_PAGAMENTO[pedido.formaPagamento];

  useEffect(() => {
    historicoStatusPedido(clienteNavegador(), pedido.id).then(setHistorico).catch(() => setHistorico([]));
  }, [pedido.id, pedido.status]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && props.aoFechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [props]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-stone-950/40 backdrop-blur-[2px]" onClick={props.aoFechar}>
      <aside
        role="dialog"
        aria-label={`Pedido ${pedido.numero}`}
        className="flex h-full w-full max-w-lg animate-entrada flex-col bg-creme-50 shadow-elevada"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-stone-200 bg-white px-6 py-5">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-3xl font-semibold tabular">Pedido #{pedido.numero}</h2>
              <Selo tom={pedido.status === "cancelado" ? "perigo" : statusFinal(pedido.status) ? "sucesso" : "marca"}>
                {ROTULO_STATUS[pedido.status]}
              </Selo>
            </div>
            <p className="mt-1 text-sm text-stone-500">
              Feito às {hora(pedido.criadoEm)} pelo {pedido.canal === "whatsapp" ? "WhatsApp" : "Telegram"}
            </p>
          </div>
          <button onClick={props.aoFechar} aria-label="Fechar" className="rounded-xl p-2 text-stone-500 hover:bg-stone-100">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <Bloco titulo="Cliente">
            <p className="text-lg font-semibold">{pedido.clienteNome}</p>
            {telefone && (
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${telefone}`} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-50">
                  <Phone className="size-4 text-stone-500" /> {formatarTelefone(telefone)}
                </a>
                <a
                  href={`https://wa.me/55${telefone.replace(/^55/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-manjericao-50 px-3 py-2 text-sm font-medium text-manjericao-700 ring-1 ring-manjericao-100"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </div>
            )}
          </Bloco>

          <Bloco titulo={pedido.tipoEntrega === "entrega" ? "Entrega" : "Retirada"}>
            <div className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              {pedido.tipoEntrega === "entrega" ? <Bike className="mt-0.5 size-5 shrink-0 text-sky-600" /> : <Store className="mt-0.5 size-5 shrink-0 text-violet-600" />}
              <p className="font-medium">{pedido.enderecoTexto ?? "Cliente retira no balcão"}</p>
            </div>
            {pedido.enderecoTexto && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.enderecoTexto)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-marca-700 hover:underline"
              >
                <MapPin className="size-4" /> Abrir no mapa
              </a>
            )}
          </Bloco>

          <Bloco titulo="Itens">
            <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
              {pedido.itens.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 px-4 py-3">
                  <div>
                    <p>
                      <span className="font-semibold tabular">{item.quantidade}×</span> {item.descricao}
                    </p>
                    {item.observacao && <p className="mt-0.5 text-sm font-medium text-marca-700">{item.observacao}</p>}
                  </div>
                  <span className="shrink-0 tabular text-stone-700">{formatarReais(item.subtotalCentavos)}</span>
                </div>
              ))}
              <dl className="space-y-1 bg-stone-50/60 px-4 py-3 text-sm tabular">
                {pedido.taxaEntregaCentavos > 0 && (
                  <>
                    <div className="flex justify-between text-stone-500"><dt>Subtotal</dt><dd>{formatarReais(pedido.subtotalCentavos)}</dd></div>
                    <div className="flex justify-between text-stone-500"><dt>Taxa de entrega</dt><dd>{formatarReais(pedido.taxaEntregaCentavos)}</dd></div>
                  </>
                )}
                <div className="flex justify-between pt-1 font-display text-lg font-semibold text-stone-900"><dt>Total</dt><dd>{formatarReais(pedido.totalCentavos)}</dd></div>
              </dl>
            </div>
            {pedido.observacoes && <p className="rounded-xl bg-marca-50 px-4 py-3 text-sm font-medium text-marca-800 ring-1 ring-marca-100">Observação: {pedido.observacoes}</p>}
          </Bloco>

          <Bloco titulo="Pagamento">
            <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <IconePagamento className="size-5 text-stone-500" />
              <div>
                <p className="font-medium">{ROTULO_PAGAMENTO[pedido.formaPagamento]}</p>
                {pedido.trocoParaCentavos !== null && (
                  <p className="text-sm text-stone-600">
                    Troco para {formatarReais(pedido.trocoParaCentavos)} · <b className="text-stone-900">levar {formatarReais(pedido.trocoParaCentavos - pedido.totalCentavos)}</b>
                  </p>
                )}
              </div>
            </div>
          </Bloco>

          {pedido.motivoCancelamento && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">Cancelado: {pedido.motivoCancelamento}</p>}

          {historico.length > 0 && (
            <Bloco titulo="Histórico">
              <ol className="relative space-y-3 border-l-2 border-stone-200 pl-5">
                {historico.map((h, i) => (
                  <li key={i} className="relative text-sm">
                    <span className={cn("absolute top-1 -left-[1.6rem] size-3 rounded-full ring-4 ring-creme-50", i === historico.length - 1 ? "bg-marca-500" : "bg-stone-300")} />
                    <span className="font-medium text-stone-800">{ROTULO_STATUS[h.para]}</span>
                    <span className="ml-2 tabular text-stone-400">{hora(h.em)}</span>
                  </li>
                ))}
              </ol>
            </Bloco>
          )}
        </div>

        <footer className="space-y-2 border-t border-stone-200 bg-white p-4">
          {cancelando ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Motivo do cancelamento <span className="font-normal text-stone-500">(o cliente recebe esta mensagem)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMotivo(m)}
                    className={cn("rounded-full px-3 py-1.5 text-sm ring-1 ring-inset", motivo === m ? "bg-red-600 text-white ring-red-600" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50")}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ou escreva o motivo" className={estiloEntrada} />
              <div className="flex gap-2">
                <Botao variante="secundario" tamanho="lg" className="flex-1" onClick={() => setCancelando(false)}>
                  Voltar
                </Botao>
                <Botao
                  tamanho="lg"
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
            </div>
          ) : (
            <>
              {acao && (
                <Botao tamanho="lg" className="w-full" disabled={props.ocupado} onClick={() => props.aoAvancar(acao.para)}>
                  {props.ocupado ? "Salvando..." : acao.rotulo} {!props.ocupado && <ArrowRight className="size-4" />}
                </Botao>
              )}
              <div className="flex gap-2">
                <Botao variante="secundario" className="flex-1" disabled={props.ocupado || pedido.status === "aguardando_pagamento"} onClick={props.aoReimprimir}>
                  <Printer className="size-4" /> Reimprimir
                </Botao>
                {!statusFinal(pedido.status) && (
                  <Botao variante="perigo" className="flex-1" onClick={() => setCancelando(true)}>
                    <Ban className="size-4" /> Cancelar pedido
                  </Botao>
                )}
              </div>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
