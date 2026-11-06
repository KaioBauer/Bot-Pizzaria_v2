"use client";

import { ArrowRight, Banknote, Bike, CreditCard, Link2, Printer, QrCode, Store } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { PedidoPainel } from "@pizzaria/db";
import { formatarReais, ROTULO_STATUS, type StatusPedido } from "@pizzaria/shared";
import { cn, Selo } from "../../../../components/ui";
import { acaoPrincipal, impressaoPendente, minutosDesde, nivelAtraso, rotuloCanal } from "../../../../lib/quadro";

const ESTILO_ATRASO = {
  ok: { ponto: "bg-emerald-500", barra: "bg-emerald-500", texto: "text-zinc-500" },
  atencao: { ponto: "bg-amber-500", barra: "bg-amber-500", texto: "text-amber-700" },
  atrasado: { ponto: "bg-red-500", barra: "bg-red-500", texto: "text-red-600" },
};

/** Referência visual da barra de tempo (a régua de atraso de verdade fica em nivelAtraso). */
const MINUTOS_BARRA_CHEIA = 45;

const PAGAMENTO = {
  pix: { Icone: QrCode, rotulo: "Pix" },
  dinheiro: { Icone: Banknote, rotulo: "Dinheiro" },
  cartao: { Icone: CreditCard, rotulo: "Cartão" },
} as const;

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500">{children}</span>;
}

export function CartaoPedido(props: {
  pedido: PedidoPainel;
  agora: number;
  destacado?: boolean;
  ocupado?: boolean;
  compacto?: boolean;
  aoAbrir: () => void;
  aoAvancar?: (para: StatusPedido) => void;
  /** Arrastar entre raias (quadro). */
  arrastando?: boolean;
  aoIniciarArrasto?: (e: React.PointerEvent<HTMLElement>) => void;
  aoBloquearClique?: (e: React.MouseEvent) => void;
}) {
  const { pedido, agora } = props;
  const reduzido = useReducedMotion() ?? false;
  const minutos = minutosDesde(pedido.criadoEm, agora);
  const atraso = ESTILO_ATRASO[nivelAtraso(pedido.status, minutos)];
  const acao = acaoPrincipal(pedido.status, pedido.tipoEntrega);
  const semImpressao = impressaoPendente(pedido, agora);
  const pagamento = PAGAMENTO[pedido.formaPagamento];

  if (props.compacto) {
    return (
      <motion.button
        layout="position"
        onClick={props.aoAbrir}
        className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-zinc-200/80 transition hover:ring-zinc-300"
      >
        <span className="text-[13px] font-semibold tabular">#{pedido.numero}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-600">{pedido.clienteNome}</span>
        {pedido.canal === "link" && (
          <Selo tom="violeta" title="Pedido feito pelo link">
            <Link2 className="size-3" /> {rotuloCanal(pedido.canal)}
          </Selo>
        )}
        <Selo tom={pedido.status === "cancelado" ? "perigo" : "sucesso"}>{ROTULO_STATUS[pedido.status]}</Selo>
      </motion.button>
    );
  }

  return (
    <motion.article
      layout
      layoutId={pedido.id}
      initial={reduzido ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: props.arrastando ? 0.35 : props.ocupado ? 0.55 : 1, y: 0, scale: 1 }}
      onPointerDown={props.aoIniciarArrasto}
      onClickCapture={props.aoBloquearClique}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={reduzido ? { duration: 0.15 } : { type: "spring", stiffness: 380, damping: 32 }}
      className={cn(
        "group relative overflow-hidden rounded-xl bg-white ring-1 transition-[box-shadow,ring-color] duration-200",
        props.aoIniciarArrasto && "cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] active:cursor-grabbing",
        props.destacado
          ? "animate-brilho-novo ring-marca-300"
          : "shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-zinc-200/80 hover:shadow-[0_10px_28px_-14px_rgb(0_0_0/0.25)] hover:ring-zinc-300"
      )}
    >
      <button onClick={props.aoAbrir} className="block w-full px-3.5 pt-3 pb-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight tabular">#{pedido.numero}</span>
          {props.destacado && (
            <span className="inline-flex items-center gap-1 rounded-full bg-marca-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-marca-700 ring-1 ring-marca-200/70">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-marca-500 opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-marca-500" />
              </span>
              Novo
            </span>
          )}
          <span className={cn("ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium tabular", atraso.texto)} title="Tempo desde o pedido">
            <span className={cn("size-1.5 rounded-full", atraso.ponto)} />
            {minutos} min
          </span>
        </div>
        <p className="mt-0.5 truncate text-[13px] font-medium text-zinc-700">{pedido.clienteNome}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Meta>
            {pedido.tipoEntrega === "entrega" ? <Bike className="size-3.5" /> : <Store className="size-3.5" />}
            {pedido.tipoEntrega === "entrega" ? "Entrega" : "Retirada"}
          </Meta>
          <Meta>
            <pagamento.Icone className="size-3.5" /> {pagamento.rotulo}
          </Meta>
          {pedido.canal === "link" && (
            <Meta>
              <Link2 className="size-3.5 text-violet-500" /> <span className="text-violet-600">{rotuloCanal(pedido.canal)}</span>
            </Meta>
          )}
          {pedido.status === "saiu_para_entrega" && <Selo tom="sucesso">A caminho</Selo>}
          {pedido.status === "pronto_para_retirada" && <Selo tom="sucesso">Pronto</Selo>}
        </div>

        <ul className="mt-2.5 space-y-1 border-t border-zinc-100 pt-2.5 text-[13px] text-zinc-700">
          {pedido.itens.slice(0, 4).map((item) => (
            <li key={item.id} className="flex gap-2">
              <span className="text-zinc-400 tabular">{item.quantidade}×</span>
              <span className="line-clamp-2">
                {item.descricao}
                {item.observacao && <span className="text-marca-700"> · {item.observacao}</span>}
              </span>
            </li>
          ))}
          {pedido.itens.length > 4 && <li className="text-zinc-400">+ {pedido.itens.length - 4} itens</li>}
        </ul>
        {pedido.observacoes && <p className="mt-2 line-clamp-2 rounded-md bg-amber-50 px-2 py-1 text-[12px] text-amber-900 ring-1 ring-amber-200/60">{pedido.observacoes}</p>}

        <div className="mt-2.5 flex items-center justify-between">
          {semImpressao ? (
            <Selo tom="perigo">
              <Printer className="size-3" /> Não impresso
            </Selo>
          ) : (
            <span />
          )}
          <span className="text-[14px] font-semibold tabular">{formatarReais(pedido.totalCentavos)}</span>
        </div>
      </button>

      {acao && props.aoAvancar && (
        <div className="px-3 pb-3">
          <button
            data-sem-arrasto
            aria-busy={props.ocupado} disabled={props.ocupado}
            onClick={() => props.aoAvancar?.(acao.para)}
            className={cn(
              "group/acao flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-white shadow-[0_1px_2px_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.12)] transition active:scale-[0.98] disabled:opacity-60",
              acao.para === "concluido" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-zinc-900 hover:bg-zinc-800"
            )}
          >
            {props.ocupado ? "Salvando..." : acao.rotulo}
            {!props.ocupado && <ArrowRight className="size-3.5 transition-transform group-hover/acao:translate-x-0.5" />}
          </button>
        </div>
      )}

      {/* Régua de tempo: enche conforme o pedido espera. */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-100">
        <motion.div
          className={cn("h-full", atraso.barra)}
          initial={false}
          animate={{ width: `${Math.min(100, (minutos / MINUTOS_BARRA_CHEIA) * 100)}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </motion.article>
  );
}
