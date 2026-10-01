"use client";

import type { PedidoPainel } from "@pizzaria/db";
import { formatarReais, ROTULO_STATUS, type StatusPedido } from "@pizzaria/shared";
import { acaoPrincipal, impressaoPendente, minutosDesde, nivelAtraso } from "../../../../lib/quadro";

const COR_ATRASO = {
  ok: "text-stone-500",
  atencao: "text-amber-700 font-semibold",
  atrasado: "text-red-700 font-bold",
};

const PAGAMENTO_CURTO = { pix: "Pix", dinheiro: "Dinheiro", cartao: "Cartão" } as const;

export function CartaoPedido(props: {
  pedido: PedidoPainel;
  agora: number;
  destacado?: boolean;
  ocupado?: boolean;
  compacto?: boolean;
  aoAbrir: () => void;
  aoAvancar?: (para: StatusPedido) => void;
}) {
  const { pedido, agora } = props;
  const minutos = minutosDesde(pedido.criadoEm, agora);
  const atraso = nivelAtraso(pedido.status, minutos);
  const acao = acaoPrincipal(pedido.status, pedido.tipoEntrega);
  const semImpressao = impressaoPendente(pedido, agora);

  if (props.compacto) {
    return (
      <button onClick={props.aoAbrir} className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm ring-1 ring-stone-200">
        <span>
          <b>#{pedido.numero}</b> {pedido.clienteNome}
        </span>
        <span className={pedido.status === "cancelado" ? "text-red-700" : "text-emerald-700"}>
          {ROTULO_STATUS[pedido.status]}
        </span>
      </button>
    );
  }

  return (
    <article
      className={`rounded-xl bg-white shadow-sm ring-1 transition ${
        props.destacado ? "animate-pulse ring-2 ring-marca-500" : "ring-stone-200"
      } ${props.ocupado ? "opacity-60" : ""}`}
    >
      <button onClick={props.aoAbrir} className="block w-full p-3 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-black">#{pedido.numero}</span>
          <span className={`text-sm ${COR_ATRASO[atraso]}`}>{minutos} min</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className={`rounded-full px-2 py-0.5 ${pedido.tipoEntrega === "entrega" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>
            {pedido.tipoEntrega === "entrega" ? "🛵 Entrega" : "🏪 Retirada"}
          </span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">{PAGAMENTO_CURTO[pedido.formaPagamento]}</span>
          {pedido.status === "pronto_para_retirada" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Pronto</span>}
          {pedido.status === "saiu_para_entrega" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Saiu</span>}
          {semImpressao && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">⚠ Não impresso</span>}
        </div>
        <p className="mt-2 truncate font-medium">{pedido.clienteNome}</p>
        <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
          {pedido.itens.slice(0, 4).map((item) => (
            <li key={item.id} className="line-clamp-2">
              <b>{item.quantidade}x</b> {item.descricao}
              {item.observacao && <span className="text-red-700"> ({item.observacao})</span>}
            </li>
          ))}
          {pedido.itens.length > 4 && <li className="text-stone-500">+ {pedido.itens.length - 4} itens...</li>}
        </ul>
        {pedido.observacoes && <p className="mt-1 line-clamp-2 text-sm text-red-700">Obs.: {pedido.observacoes}</p>}
        <p className="mt-2 text-right font-bold">{formatarReais(pedido.totalCentavos)}</p>
      </button>
      {acao && props.aoAvancar && (
        <div className="border-t border-stone-100 p-2">
          <button
            disabled={props.ocupado}
            onClick={() => props.aoAvancar?.(acao.para)}
            className="w-full rounded-lg bg-marca-600 py-3 font-semibold text-white active:scale-[0.99] disabled:opacity-60"
          >
            {props.ocupado ? "Salvando..." : acao.rotulo}
          </button>
        </div>
      )}
    </article>
  );
}
