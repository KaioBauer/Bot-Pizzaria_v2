"use client";

import { Bike, Check, Copy, PackageCheck, PartyPopper, Receipt, XCircle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatarReais, paraCentavos } from "@pizzaria/shared";
import { Pizza, VISUAIS, type Camada } from "../../../../components/pizza-builder";
import { cn } from "../../../../components/ui";
import { acompanharAction, type Acompanhamento as Dados } from "../../actions";

const INTERVALO_MS = 5000;

/** Pizza ilustrativa da cena "preparando": queijo, calabresa e orégano. */
const PIZZA_DA_CENA: Camada[] = (["mussarela", "calabresa", "oregano"] as const).map((chave) => ({ chave, nome: chave, visuais: [VISUAIS[chave]!] }));
const FINAIS = new Set(["concluido", "cancelado"]);

type Etapa = { chave: string; rotulo: string };

function etapas(tipo: Dados["tipo_entrega"]): Etapa[] {
  return [
    { chave: "novo", rotulo: "Recebido" },
    { chave: "em_preparo", rotulo: "Preparando e assando" },
    tipo === "entrega" ? { chave: "saiu_para_entrega", rotulo: "Saiu para entrega" } : { chave: "pronto_para_retirada", rotulo: "Pronto para retirar" },
    { chave: "concluido", rotulo: tipo === "entrega" ? "Entregue" : "Retirado" },
  ];
}

/** Posição na linha do tempo (-1 = fora dela: aguardando Pix ou cancelado). */
function posicao(status: string): number {
  switch (status) {
    case "novo":
      return 0;
    case "em_preparo":
      return 1;
    case "saiu_para_entrega":
    case "pronto_para_retirada":
      return 2;
    case "concluido":
      return 3;
    default:
      return -1;
  }
}

/**
 * Não existe status "no forno": durante em_preparo a cena alterna entre a
 * pizza sendo montada e a pizza no forno, só como animação.
 */
function useFornoAlternado(ativo: boolean) {
  const [forno, setForno] = useState(false);
  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => setForno((f) => !f), 4500);
    return () => clearInterval(id);
  }, [ativo]);
  return ativo && forno;
}

function Cena({ status, tipo }: { status: string; tipo: Dados["tipo_entrega"] }) {
  const reduzido = useReducedMotion() ?? false;
  const forno = useFornoAlternado(status === "em_preparo" && !reduzido);
  const loop = (duracao: number) => (reduzido ? { duration: 0 } : { duration: duracao, repeat: Infinity, ease: "easeInOut" as const });

  if (status === "aguardando_pagamento") return null;
  if (status === "cancelado") return <XCircle className="mx-auto size-24 text-marca-600" />;
  if (status === "concluido")
    return (
      <motion.div initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 10 }}>
        <PartyPopper className="mx-auto size-24 text-amber-500" />
      </motion.div>
    );
  if (status === "saiu_para_entrega")
    return (
      <div className="relative mx-auto h-28 w-full max-w-xs overflow-hidden">
        <motion.div className="absolute bottom-6 left-0" animate={reduzido ? {} : { x: ["-20%", "260%"] }} transition={loop(3.2)}>
          <Bike className="size-16 text-marca-600" />
        </motion.div>
        <div className="absolute inset-x-0 bottom-5 border-b-2 border-dashed border-stone-300" />
      </div>
    );
  if (status === "pronto_para_retirada")
    return (
      <motion.div animate={reduzido ? {} : { y: [0, -8, 0] }} transition={loop(1.4)}>
        <PackageCheck className="mx-auto size-24 text-manjericao-600" />
      </motion.div>
    );
  if (status === "novo")
    return (
      <motion.div animate={reduzido ? {} : { rotate: [-4, 4, -4] }} transition={loop(1.6)}>
        <Receipt className="mx-auto size-24 text-stone-700" />
      </motion.div>
    );
  // em_preparo: pizza sendo montada e depois "no forno" (brilho quente e massa assada).
  return (
    <div className="relative mx-auto w-44">
      {forno && (
        <motion.div
          className="absolute inset-[-12%] rounded-full bg-[radial-gradient(circle,rgb(255_140_40/0.55),transparent_70%)]"
          animate={reduzido ? {} : { opacity: [0.5, 1, 0.5], scale: [0.95, 1.05, 0.95] }}
          transition={loop(1.2)}
        />
      )}
      <motion.div animate={reduzido || forno ? {} : { rotate: [0, 360] }} transition={reduzido ? { duration: 0 } : { duration: 12, repeat: Infinity, ease: "linear" }}>
        <Pizza escala={1} fatias={[]} ingredientes={PIZZA_DA_CENA} borda={null} assada={forno} />
      </motion.div>
      <p className="mt-2 text-center text-xs text-stone-500">{forno ? "No forno 🔥" : tipo === "entrega" ? "Preparando para entregar..." : "Preparando sua pizza..."}</p>
    </div>
  );
}

function Pix({ pix, total }: { pix: NonNullable<Dados["pix"]>; total: number }) {
  const [copiado, setCopiado] = useState(false);
  const validade = new Date(pix.expira_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="rounded-3xl bg-white p-5 text-center shadow-suave ring-1 ring-creme-200">
      <p className="font-display text-xl font-semibold">Pague {formatarReais(total)} no Pix</p>
      <p className="text-sm text-stone-600">até as {validade}. O preparo começa assim que o pagamento cair.</p>
      {pix.qr_base64 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`data:image/png;base64,${pix.qr_base64}`} alt="QR Code do Pix" className="mx-auto my-4 size-56 rounded-xl" />
      )}
      {pix.copia_e_cola && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(pix.copia_e_cola!).then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            });
          }}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-stone-900 px-5 font-semibold text-white"
        >
          {copiado ? <Check className="size-5" /> : <Copy className="size-5" />}
          {copiado ? "Copiado!" : "Copiar Pix copia e cola"}
        </button>
      )}
    </div>
  );
}

export function Acompanhamento({ token, inicial }: { token: string; inicial: Dados }) {
  const [pedido, setPedido] = useState(inicial);

  // Consulta periódica (o anônimo não recebe Realtime de pedidos); para nos status finais.
  useEffect(() => {
    if (FINAIS.has(pedido.status)) return;
    const id = setInterval(async () => {
      try {
        const novo = await acompanharAction(token);
        if (novo) setPedido(novo);
      } catch {
        // Falha momentânea: tenta de novo no próximo ciclo.
      }
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, [token, pedido.status]);

  const lista = etapas(pedido.tipo_entrega);
  const atual = posicao(pedido.status);
  const total = paraCentavos(pedido.valor_total);
  const titulo =
    pedido.status === "aguardando_pagamento"
      ? "Aguardando o Pix"
      : pedido.status === "cancelado"
        ? "Pedido cancelado"
        : (lista[atual]?.rotulo ?? "Pedido recebido");

  return (
    <div className="min-h-dvh bg-[#f8f3ea] px-4 pt-6 pb-10 text-stone-900">
      <div className="mx-auto max-w-md space-y-5">
        <header className="text-center">
          <p className="text-sm font-semibold tracking-wide text-marca-700 uppercase">Pedido #{pedido.numero}</p>
          <AnimatePresence mode="wait">
            <motion.h1
              key={titulo}
              className="font-display text-3xl font-semibold"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              aria-live="polite"
            >
              {titulo}
            </motion.h1>
          </AnimatePresence>
        </header>

        <div className="flex min-h-40 items-center justify-center">
          <Cena status={pedido.status} tipo={pedido.tipo_entrega} />
        </div>

        {pedido.status === "aguardando_pagamento" && pedido.pix && <Pix pix={pedido.pix} total={total} />}
        {pedido.status === "cancelado" && (
          <p className="rounded-2xl bg-white p-4 text-center text-sm shadow-suave">
            {pedido.motivo_cancelamento ?? "Seu pedido foi cancelado."} Se tiver dúvidas, fale com a pizzaria.
          </p>
        )}

        {atual >= 0 && (
          <ol className="space-y-0 rounded-3xl bg-white p-5 shadow-suave ring-1 ring-creme-200">
            {lista.map((etapa, i) => {
              // Concluído: todas as etapas, inclusive a última, aparecem feitas.
              const feita = i < atual || pedido.status === "concluido";
              return (
              <li key={etapa.chave} className="flex items-center gap-3 py-1.5">
                <motion.span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    feita ? "bg-manjericao-500 text-white" : i === atual ? "bg-marca-600 text-white" : "bg-creme-200 text-stone-500"
                  )}
                  animate={i === atual && !feita ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                  transition={i === atual && !feita ? { duration: 1.4, repeat: Infinity } : {}}
                >
                  {feita ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </motion.span>
                <span className={cn("font-semibold", i > atual && "text-stone-400")}>{etapa.rotulo}</span>
              </li>
              );
            })}
          </ol>
        )}

        <section className="rounded-3xl bg-white p-5 shadow-suave ring-1 ring-creme-200">
          <h2 className="mb-2 font-display text-lg font-semibold">Seu pedido</h2>
          <ul className="space-y-1.5 text-sm">
            {pedido.itens.map((item, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {item.quantidade}x {item.descricao}
                </span>
                <span className="shrink-0 tabular">{formatarReais(paraCentavos(item.subtotal))}</span>
              </li>
            ))}
            {pedido.taxa_entrega > 0 && (
              <li className="flex justify-between text-stone-600">
                <span>Entrega</span>
                <span className="tabular">{formatarReais(paraCentavos(pedido.taxa_entrega))}</span>
              </li>
            )}
            <li className="flex justify-between border-t border-creme-200 pt-2 text-base font-bold">
              <span>Total</span>
              <span className="tabular">{formatarReais(total)}</span>
            </li>
          </ul>
        </section>

        <p className="text-center text-sm text-stone-500">
          Esta página se atualiza sozinha. Guarde o link para acompanhar.{" "}
          <Link href="/pedir" className="font-semibold text-marca-700 underline">
            Fazer outro pedido
          </Link>
        </p>
      </div>
    </div>
  );
}
