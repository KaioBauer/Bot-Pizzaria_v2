"use client";

import { Check, Minus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatarReais } from "@pizzaria/shared";
import { corDoNome } from "./geometria";

/**
 * Bandeja de opções embaixo da pizza: "toque para adicionar". Genérica
 * (ingredientes, sabores, bordas — e no futuro camadas de lanche).
 */

export interface OpcaoBandeja {
  chave: string;
  nome: string;
  /** Miniatura (camada ilustrada ou foto); sem imagem = inicial colorida. */
  imagemUrl: string | null;
  /** Imagem de cobertura (queijo ralado): aproxima para mostrar a textura. */
  aproximar?: boolean;
  /** Quanto essa opção acrescenta (0 = sem custo extra). */
  extraCentavos?: number;
  detalhe?: string | null;
  selecionada: boolean;
  /** Motivo para não poder tocar (ex.: "só na Grande"). */
  indisponivel?: string | null;
}

/** Vibração curtinha no celular (quando o aparelho permite). */
export function vibrar(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Sem vibração: segue normal.
  }
}

export function Bandeja({
  opcoes,
  aoTocar,
  aoRemover,
  colunas = "grid-cols-4 sm:grid-cols-5",
}: {
  opcoes: OpcaoBandeja[];
  aoTocar: (chave: string) => void;
  /** Botão "−" nas selecionadas (sem ele, tocar de novo remove). */
  aoRemover?: (chave: string) => void;
  colunas?: string;
}) {
  return (
    <ul className={`grid ${colunas} gap-x-1.5 gap-y-3`}>
      {opcoes.map((o) => (
        <li key={o.chave} className="relative">
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={() => {
              vibrar();
              aoTocar(o.chave);
            }}
            disabled={Boolean(o.indisponivel)}
            aria-pressed={o.selecionada}
            aria-label={`${o.nome}${o.extraCentavos ? `, mais ${formatarReais(o.extraCentavos)}` : ""}${o.selecionada ? ", na pizza" : ""}`}
            className="flex w-full flex-col items-center gap-1 text-center disabled:opacity-40"
          >
            <motion.span
              className={`relative block size-[60px] overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_30%,#fffaf0,#f1e4cc)] shadow-[inset_0_-3px_6px_rgb(120_80_30/0.12),0_1px_3px_rgb(60_40_20/0.12)] transition-[box-shadow] ${
                o.selecionada ? "ring-[2.5px] ring-marca-600" : "ring-1 ring-[#eadbc0]"
              }`}
              animate={o.selecionada ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={{ duration: 0.35 }}
            >
              {o.imagemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.imagemUrl}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className={`absolute inset-0 size-full object-contain ${o.aproximar ? "scale-[1.9]" : "scale-[0.92]"}`}
                />
              ) : (
                <span className="flex size-full items-center justify-center font-display text-xl font-semibold text-white" style={{ background: corDoNome(o.nome) }}>
                  {o.nome.slice(0, 1)}
                </span>
              )}
            </motion.span>
            <span className="line-clamp-2 text-[12.5px] leading-tight font-semibold text-stone-800">{o.nome}</span>
            {o.indisponivel ? (
              <span className="text-[11px] leading-tight text-stone-500">{o.indisponivel}</span>
            ) : o.extraCentavos ? (
              <span className={`text-[11.5px] font-semibold tabular ${o.selecionada ? "text-marca-600" : "text-stone-500"}`}>+ {formatarReais(o.extraCentavos)}</span>
            ) : o.detalhe ? (
              <span className="text-[11px] leading-tight text-stone-500">{o.detalhe}</span>
            ) : null}
          </motion.button>
          <AnimatePresence>
            {o.selecionada && (
              <motion.span
                key="marcado"
                className="pointer-events-none absolute top-0 left-1/2 ml-[14px] flex size-5 items-center justify-center rounded-full bg-marca-600 text-white shadow"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
              >
                <Check className="size-3.5" strokeWidth={3} />
              </motion.span>
            )}
            {o.selecionada && aoRemover && (
              <motion.button
                key="remover"
                type="button"
                onClick={() => {
                  vibrar();
                  aoRemover(o.chave);
                }}
                className="absolute top-0 right-1/2 mr-[14px] flex size-6 items-center justify-center rounded-full bg-stone-900 text-white shadow"
                aria-label={`Tirar ${o.nome}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
              >
                <Minus className="size-3.5" strokeWidth={3} />
              </motion.button>
            )}
          </AnimatePresence>
        </li>
      ))}
    </ul>
  );
}
