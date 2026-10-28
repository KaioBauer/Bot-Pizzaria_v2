"use client";

import { ArrowRight, Banknote, Bike, Clock, CreditCard, Link2, Printer, QrCode, Store } from "lucide-react";
import type { PedidoPainel } from "@pizzaria/db";
import { formatarReais, ROTULO_STATUS, type StatusPedido } from "@pizzaria/shared";
import { cn, Selo } from "../../../../components/ui";
import { acaoPrincipal, impressaoPendente, minutosDesde, nivelAtraso, rotuloCanal } from "../../../../lib/quadro";

const ESTILO_ATRASO = {
  ok: "bg-stone-100 text-stone-600",
  atencao: "bg-amber-100 text-amber-800",
  atrasado: "bg-red-100 text-red-700",
};

const PAGAMENTO = {
  pix: { Icone: QrCode, rotulo: "Pix" },
  dinheiro: { Icone: Banknote, rotulo: "Dinheiro" },
  cartao: { Icone: CreditCard, rotulo: "Cartão" },
} as const;

/** Cor do botão de acordo com a próxima etapa. */
const ESTILO_ACAO: Partial<Record<StatusPedido, string>> = {
  novo: "bg-violet-600 hover:bg-violet-700",
  em_preparo: "bg-marca-600 hover:bg-marca-700",
  saiu_para_entrega: "bg-amber-500 hover:bg-amber-600",
  pronto_para_retirada: "bg-amber-500 hover:bg-amber-600",
  concluido: "bg-manjericao-600 hover:bg-manjericao-700",
};

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
  const pagamento = PAGAMENTO[pedido.formaPagamento];

  if (props.compacto) {
    return (
      <button
        onClick={props.aoAbrir}
        className="flex w-full items-center gap-3 rounded-2xl bg-white px-3.5 py-3 text-left shadow-suave ring-1 ring-stone-900/5 transition hover:ring-stone-300"
      >
        <span className="font-display text-lg font-semibold tabular">#{pedido.numero}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-stone-600">{pedido.clienteNome}</span>
        {pedido.canal === "link" && (
          <Selo tom="violeta" title="Pedido feito pelo link">
            <Link2 className="size-3.5" /> {rotuloCanal(pedido.canal)}
          </Selo>
        )}
        <Selo tom={pedido.status === "cancelado" ? "perigo" : "sucesso"}>{ROTULO_STATUS[pedido.status]}</Selo>
      </button>
    );
  }

  return (
    <article
      className={cn(
        "animate-entrada overflow-hidden rounded-2xl bg-white shadow-suave ring-1 transition",
        props.destacado ? "animate-alerta ring-2 ring-marca-500" : "ring-stone-900/5 hover:shadow-elevada",
        props.ocupado && "opacity-60"
      )}
    >
      <button onClick={props.aoAbrir} className="block w-full p-4 text-left">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-3xl leading-none font-semibold tabular">#{pedido.numero}</p>
            <p className="mt-1.5 truncate font-medium text-stone-800">{pedido.clienteNome}</p>
          </div>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold tabular", ESTILO_ATRASO[atraso])}>
            <Clock className="size-3.5" /> {minutos} min
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Selo tom={pedido.tipoEntrega === "entrega" ? "info" : "violeta"}>
            {pedido.tipoEntrega === "entrega" ? <Bike className="size-3.5" /> : <Store className="size-3.5" />}
            {pedido.tipoEntrega === "entrega" ? "Entrega" : "Retirada"}
          </Selo>
          <Selo>
            <pagamento.Icone className="size-3.5" /> {pagamento.rotulo}
          </Selo>
          {pedido.canal === "link" && (
            <Selo tom="violeta" title="Pedido feito pelo link (sem conversa com o bot)">
              <Link2 className="size-3.5" /> {rotuloCanal(pedido.canal)}
            </Selo>
          )}
          {pedido.status === "saiu_para_entrega" && <Selo tom="sucesso">A caminho</Selo>}
          {pedido.status === "pronto_para_retirada" && <Selo tom="sucesso">Pronto</Selo>}
          {semImpressao && (
            <Selo tom="perigo">
              <Printer className="size-3.5" /> Não impresso
            </Selo>
          )}
        </div>

        <ul className="mt-3 space-y-1 border-t border-dashed border-stone-200 pt-3 text-sm text-stone-700">
          {pedido.itens.slice(0, 4).map((item) => (
            <li key={item.id} className="flex gap-2">
              <span className="font-semibold text-stone-900 tabular">{item.quantidade}×</span>
              <span className="line-clamp-2">
                {item.descricao}
                {item.observacao && <span className="font-medium text-marca-700"> · {item.observacao}</span>}
              </span>
            </li>
          ))}
          {pedido.itens.length > 4 && <li className="text-stone-400">+ {pedido.itens.length - 4} itens</li>}
        </ul>
        {pedido.observacoes && (
          <p className="mt-2 line-clamp-2 rounded-lg bg-marca-50 px-2.5 py-1.5 text-xs font-medium text-marca-800">{pedido.observacoes}</p>
        )}

        <p className="mt-3 text-right font-display text-xl font-semibold tabular">{formatarReais(pedido.totalCentavos)}</p>
      </button>

      {acao && props.aoAvancar && (
        <div className="px-3 pb-3">
          <button
            disabled={props.ocupado}
            onClick={() => props.aoAvancar?.(acao.para)}
            className={cn(
              "flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60",
              ESTILO_ACAO[acao.para] ?? "bg-stone-900"
            )}
          >
            {props.ocupado ? "Salvando..." : acao.rotulo}
            {!props.ocupado && <ArrowRight className="size-4" />}
          </button>
        </div>
      )}
    </article>
  );
}
