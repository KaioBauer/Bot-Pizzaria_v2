"use client";

import { useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { Pizza, type PizzaProps } from "./pizza";

/**
 * Palco da pizza: ao adicionar, a pizza dá um pulinho e voa até `alvoId`
 * (o carrinho). Só transform/opacity; com "reduzir movimento" vira um fade.
 */
export function Palco({
  assar,
  alvoId,
  aoTerminar,
  sobreposicao,
  ...pizza
}: PizzaProps & {
  /** Muda para true para disparar a ida ao carrinho. */
  assar: boolean;
  alvoId: string;
  aoTerminar: () => void;
  /** Camada extra sobre o palco. */
  sobreposicao?: ReactNode;
}) {
  const [escopo, animar] = useAnimate<HTMLDivElement>();
  const reduzido = useReducedMotion() ?? false;
  const terminar = useRef(aoTerminar);
  useEffect(() => {
    terminar.current = aoTerminar;
  });

  useEffect(() => {
    if (!assar) return;
    let cancelado = false;
    void (async () => {
      const conjunto = escopo.current?.querySelector<HTMLElement>("[data-conjunto]");
      if (!conjunto) return;
      if (reduzido) {
        await animar(conjunto, { opacity: 0 }, { duration: 0.2 });
      } else {
        await animar(conjunto, { scale: 1.06 }, { duration: 0.14, ease: "easeOut" });
        await animar(conjunto, { scale: 0.96 }, { duration: 0.12 });
        const alvo = document.getElementById(alvoId)?.getBoundingClientRect();
        const origem = conjunto.getBoundingClientRect();
        if (alvo && !cancelado) {
          await animar(
            conjunto,
            {
              x: alvo.left + alvo.width / 2 - (origem.left + origem.width / 2),
              y: alvo.top + alvo.height / 2 - (origem.top + origem.height / 2),
              scale: 0.08,
              rotate: -12,
              opacity: 0.5,
            },
            { duration: 0.55, ease: [0.5, 0, 0.75, 0] }
          );
        }
      }
      if (cancelado) return;
      // Volta ao início escondido (sem mostrar os ingredientes antigos) e reaparece.
      await animar(conjunto, { opacity: 0 }, { duration: 0 });
      terminar.current();
      await animar(conjunto, { x: 0, y: 0, scale: 1, rotate: 0 }, { duration: 0 });
      await new Promise((ok) => setTimeout(ok, 300));
      await animar(conjunto, { opacity: 1 }, { duration: 0.3 });
    })();
    return () => {
      cancelado = true;
    };
  }, [assar, alvoId, animar, escopo, reduzido]);

  return (
    <div ref={escopo} className="relative mx-auto w-full">
      <div data-conjunto className="relative z-[15]">
        <Pizza {...pizza} />
      </div>
      {sobreposicao}
    </div>
  );
}
