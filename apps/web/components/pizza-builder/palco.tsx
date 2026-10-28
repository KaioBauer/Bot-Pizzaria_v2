"use client";

import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pizza, type PizzaProps } from "./pizza";

/**
 * Palco da pizza com o final "vai pro forno": a pizza entra no forno, sai
 * assada (crossfade da massa crua para a assada) e voa até o elemento
 * `alvoId` (ícone do carrinho). Depois chama `aoTerminar`.
 */
export function Palco({
  assar,
  alvoId,
  aoTerminar,
  sobreposicao,
  ...pizza
}: PizzaProps & {
  /** Muda para true para disparar a sequência do forno. */
  assar: boolean;
  alvoId: string;
  aoTerminar: () => void;
  /** Camada extra sobre o palco (ex.: "+R$" flutuando). */
  sobreposicao?: ReactNode;
}) {
  const [escopo, animar] = useAnimate<HTMLDivElement>();
  const reduzido = useReducedMotion() ?? false;
  const [assada, setAssada] = useState(false);
  const [forno, setForno] = useState<"fechado" | "aberto" | null>(null);
  const [vapor, setVapor] = useState(false);
  const terminar = useRef(aoTerminar);
  useEffect(() => {
    terminar.current = aoTerminar;
  });

  useEffect(() => {
    if (!assar) return;
    let cancelado = false;
    const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    void (async () => {
      const pizzaEl = escopo.current?.querySelector<HTMLElement>("[data-pizza]");
      if (!pizzaEl) return;
      if (reduzido) {
        setAssada(true);
        await espera(500);
      } else {
        setForno("aberto");
        await animar(pizzaEl, { scale: 0.55, y: "8%" }, { duration: 0.45, ease: [0.4, 0, 0.2, 1] });
        if (cancelado) return;
        setForno("fechado");
        await espera(900);
        setAssada(true);
        setForno("aberto");
        await animar(pizzaEl, { scale: 1, y: 0 }, { type: "spring", stiffness: 220, damping: 16 });
        setForno(null);
        // Sai fumegando: o cliente vê a pizza assada antes de ela ir para o carrinho.
        setVapor(true);
        await espera(1100);
        setVapor(false);
        if (cancelado) return;
        const alvo = document.getElementById(alvoId)?.getBoundingClientRect();
        const origem = pizzaEl.getBoundingClientRect();
        if (alvo) {
          await animar(
            pizzaEl,
            {
              x: alvo.left + alvo.width / 2 - (origem.left + origem.width / 2),
              y: alvo.top + alvo.height / 2 - (origem.top + origem.height / 2),
              scale: 0.08,
              rotate: 200,
              opacity: 0.4,
            },
            { duration: 0.6, ease: [0.5, 0, 0.75, 0] }
          );
        }
      }
      if (cancelado) return;
      terminar.current();
      // Volta ao estado inicial para a próxima pizza.
      setAssada(false);
      setForno(null);
      await animar(pizzaEl, { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }, { duration: 0 });
    })();
    return () => {
      cancelado = true;
    };
  }, [assar, alvoId, animar, escopo, reduzido]);

  return (
    <div ref={escopo} className="relative mx-auto w-full max-w-[min(82vw,380px)]">
      <AnimatePresence>
        {forno && (
          <motion.div
            className="absolute inset-[-6%] z-10 overflow-hidden rounded-[38%] bg-gradient-to-b from-stone-800 to-stone-950 shadow-elevada"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            aria-hidden
          >
            {/* Brasa no fundo do forno. */}
            <motion.div
              className="absolute inset-x-[15%] bottom-[12%] h-[30%] rounded-full bg-[radial-gradient(ellipse,rgb(255_140_40/0.9),rgb(200_50_10/0.5)_55%,transparent_75%)]"
              animate={{ opacity: [0.6, 1, 0.7, 1] }}
              transition={{ duration: 0.9, repeat: Infinity }}
            />
            {/* Porta: fecha durante o assado. */}
            <motion.div
              className="absolute inset-x-0 top-0 z-20 h-full origin-top rounded-[38%] border-4 border-stone-700 bg-stone-900/95"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: forno === "fechado" ? 1 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="absolute inset-x-[20%] top-[40%] h-[14%] rounded-full bg-[linear-gradient(90deg,transparent,rgb(255_160_60/0.5),transparent)]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div data-pizza className="relative z-[15]">
        <Pizza {...pizza} assada={assada || pizza.assada} />
        <AnimatePresence>{vapor && <Vapor />}</AnimatePresence>
      </div>
      {sobreposicao}
    </div>
  );
}

/** Fiozinhos de vapor subindo (só transform/opacity). */
function Vapor() {
  return (
    <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} aria-hidden>
      {[18, 34, 50, 66, 80].map((x, i) => (
        <motion.span
          key={x}
          className="absolute top-[30%] h-[28%] w-[9%] rounded-full bg-white/70 blur-md"
          style={{ left: `${x}%` }}
          initial={{ opacity: 0, y: 0, scaleX: 0.6 }}
          animate={{ opacity: [0, 0.8, 0], y: "-120%", scaleX: [0.6, 1.2, 1.6], x: i % 2 ? 8 : -8 }}
          transition={{ duration: 1.3, delay: i * 0.12, ease: "easeOut" }}
        />
      ))}
    </motion.div>
  );
}
