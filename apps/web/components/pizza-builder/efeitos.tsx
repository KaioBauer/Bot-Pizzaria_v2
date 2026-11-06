"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatarReais } from "@pizzaria/shared";

/** Pré-carrega imagens (camadas) para a queda não piscar ao tocar. */
export function usePrecarregar(urls: (string | null | undefined)[], adiado = false) {
  const chave = urls.filter(Boolean).join("|");
  useEffect(() => {
    const lista = chave ? chave.split("|") : [];
    if (!lista.length) return;
    const carregar = () => {
      for (const url of lista) {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      }
    };
    if (!adiado) return carregar();
    // Muitas imagens (todos os sabores): só quando o navegador estiver ocioso.
    const ocioso = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ocioso) ocioso(carregar);
    else setTimeout(carregar, 800);
  }, [chave, adiado]);
}

/** Valor em reais que "conta" até o novo total. */
export function TotalAnimado({ centavos, className }: { centavos: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anterior = useRef(centavos);
  const reduzido = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduzido) {
      el.textContent = formatarReais(centavos);
      anterior.current = centavos;
      return;
    }
    const controle = animate(anterior.current, centavos, {
      duration: 0.5,
      ease: "easeOut",
      onUpdate: (v) => (el.textContent = formatarReais(Math.round(v))),
    });
    anterior.current = centavos;
    return () => controle.stop();
  }, [centavos, reduzido]);
  return (
    <span ref={ref} className={`shrink-0 whitespace-nowrap tabular ${className ?? ""}`}>
      {formatarReais(centavos)}
    </span>
  );
}
