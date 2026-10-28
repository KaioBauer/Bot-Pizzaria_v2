"use client";

import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/** Folha de baixo para cima (celular) / modal (computador). */
export function Folha({ titulo, aoFechar, children, rodape }: { titulo: string; aoFechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  const reduzido = useReducedMotion();
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  });
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar.current();
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", tecla);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={titulo}>
      <motion.div className="absolute inset-0 bg-stone-950/50" onClick={aoFechar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden />
      <motion.div
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-[#fffcf7] shadow-elevada sm:rounded-3xl"
        initial={reduzido ? { opacity: 0 } : { y: "100%" }}
        animate={reduzido ? { opacity: 1 } : { y: 0 }}
        exit={reduzido ? { opacity: 0 } : { y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
      >
        <div className="flex items-center gap-3 border-b border-creme-200 px-5 py-4">
          <h2 className="flex-1 font-display text-xl font-semibold">{titulo}</h2>
          <button type="button" onClick={aoFechar} className="flex size-10 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200/60" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {rodape && <div className="border-t border-creme-200 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{rodape}</div>}
      </motion.div>
    </div>
  );
}
