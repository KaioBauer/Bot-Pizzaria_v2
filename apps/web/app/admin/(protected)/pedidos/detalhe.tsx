"use client";

import { useEffect, useState } from "react";
import { historicoStatusPedido, type PedidoPainel } from "@pizzaria/db";
import {
  formatarReais,
  formatarTelefone,
  ROTULO_PAGAMENTO,
  ROTULO_STATUS,
  statusFinal,
  type StatusPedido,
} from "@pizzaria/shared";
import { acaoPrincipal } from "../../../../lib/quadro";
import { clienteNavegador } from "../../../../lib/supabase/navegador";

const MOTIVOS = [
  "Cliente desistiu",
  "Endereço fora da área de entrega",
  "Item em falta",
  "Pagamento não confirmado",
  "Pedido duplicado",
];

type Historico = Awaited<ReturnType<typeof historicoStatusPedido>>;

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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

  useEffect(() => {
    historicoStatusPedido(clienteNavegador(), pedido.id).then(setHistorico).catch(() => setHistorico([]));
  }, [pedido.id, pedido.status]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && props.aoFechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [props]);

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/40" onClick={props.aoFechar}>
      <aside
        role="dialog"
        aria-label={`Pedido ${pedido.numero}`}
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-2xl font-black">Pedido #{pedido.numero}</h2>
            <p className="text-sm text-stone-500">
              {ROTULO_STATUS[pedido.status]} · feito às {hora(pedido.criadoEm)} · {pedido.canal}
            </p>
          </div>
          <button onClick={props.aoFechar} aria-label="Fechar" className="rounded-full p-2 text-2xl leading-none hover:bg-stone-100">
            ×
          </button>
        </header>

        <div className="space-y-5 p-5">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Cliente</h3>
            <p className="text-lg font-semibold">{pedido.clienteNome}</p>
            {telefone && (
              <div className="mt-1 flex gap-2">
                <a href={`tel:${telefone}`} className="rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium">
                  📞 {formatarTelefone(telefone)}
                </a>
                <a href={`https://wa.me/55${telefone.replace(/^55/, "")}`} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800">
                  WhatsApp
                </a>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">
              {pedido.tipoEntrega === "entrega" ? "🛵 Entrega" : "🏪 Retirada no balcão"}
            </h3>
            {pedido.enderecoTexto && <p className="font-medium">{pedido.enderecoTexto}</p>}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Itens</h3>
            <ul className="divide-y divide-stone-100">
              {pedido.itens.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2">
                  <span>
                    <b>{item.quantidade}x</b> {item.descricao}
                    {item.observacao && <span className="block text-sm font-medium text-red-700">Obs.: {item.observacao}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatarReais(item.subtotalCentavos)}</span>
                </li>
              ))}
            </ul>
            {pedido.observacoes && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">Obs. do pedido: {pedido.observacoes}</p>}
            <dl className="mt-3 space-y-1 border-t border-stone-200 pt-3 tabular-nums">
              {pedido.taxaEntregaCentavos > 0 && (
                <>
                  <div className="flex justify-between text-stone-600"><dt>Subtotal</dt><dd>{formatarReais(pedido.subtotalCentavos)}</dd></div>
                  <div className="flex justify-between text-stone-600"><dt>Taxa de entrega</dt><dd>{formatarReais(pedido.taxaEntregaCentavos)}</dd></div>
                </>
              )}
              <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{formatarReais(pedido.totalCentavos)}</dd></div>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Pagamento</h3>
            <p className="font-medium">{ROTULO_PAGAMENTO[pedido.formaPagamento]}</p>
            {pedido.trocoParaCentavos !== null && (
              <p className="text-sm">
                Troco para {formatarReais(pedido.trocoParaCentavos)} —{" "}
                <b>levar {formatarReais(pedido.trocoParaCentavos - pedido.totalCentavos)}</b>
              </p>
            )}
          </section>

          {pedido.motivoCancelamento && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Cancelado: {pedido.motivoCancelamento}</p>
          )}

          {historico.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Histórico</h3>
              <ol className="mt-1 space-y-1 text-sm">
                {historico.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-12 tabular-nums text-stone-500">{hora(h.em)}</span>
                    <span>{ROTULO_STATUS[h.para]}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <footer className="sticky bottom-0 mt-auto space-y-2 border-t border-stone-200 bg-white p-4">
          {cancelando ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Motivo do cancelamento (o cliente recebe esta mensagem):</p>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS.map((m) => (
                  <button key={m} onClick={() => setMotivo(m)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${motivo === m ? "bg-red-600 text-white ring-red-600" : "ring-stone-300"}`}>
                    {m}
                  </button>
                ))}
              </div>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={200}
                placeholder="Ou escreva o motivo"
                className="w-full rounded-lg border border-stone-300 px-3 py-2"
              />
              <div className="flex gap-2">
                <button onClick={() => setCancelando(false)} className="flex-1 rounded-lg py-3 font-medium ring-1 ring-stone-300">
                  Voltar
                </button>
                <button
                  disabled={!motivo.trim() || props.ocupado}
                  onClick={() => {
                    props.aoCancelar(motivo.trim());
                    setCancelando(false);
                  }}
                  className="flex-1 rounded-lg bg-red-600 py-3 font-semibold text-white disabled:opacity-50"
                >
                  Confirmar cancelamento
                </button>
              </div>
            </div>
          ) : (
            <>
              {acao && (
                <button
                  disabled={props.ocupado}
                  onClick={() => props.aoAvancar(acao.para)}
                  className="w-full rounded-lg bg-marca-600 py-3.5 text-lg font-semibold text-white disabled:opacity-60"
                >
                  {props.ocupado ? "Salvando..." : acao.rotulo}
                </button>
              )}
              <div className="flex gap-2">
                <button
                  disabled={props.ocupado || pedido.status === "aguardando_pagamento"}
                  onClick={props.aoReimprimir}
                  className="flex-1 rounded-lg py-3 font-medium ring-1 ring-stone-300 disabled:opacity-50"
                >
                  🖨 Reimprimir
                </button>
                {!statusFinal(pedido.status) && (
                  <button onClick={() => setCancelando(true)} className="flex-1 rounded-lg py-3 font-medium text-red-700 ring-1 ring-red-200">
                    Cancelar pedido
                  </button>
                )}
              </div>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
