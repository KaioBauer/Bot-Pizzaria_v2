"use client";

import { useEffect } from "react";

const DURACAO_FIM_MS = 520;

/**
 * Completa a barra de progresso dos botões (estilo em globals.css): quando um
 * botão deixa de estar aria-busy="true", marca data-progresso-fim por um
 * instante para a barra ir a 100% e sumir, em vez de desaparecer no meio.
 */
export function IndicadorProgresso() {
  useEffect(() => {
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const obs = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        const el = m.target as Element;
        const agora = el.getAttribute("aria-busy");
        if (m.oldValue === "true" && agora !== "true") {
          el.setAttribute("data-progresso-fim", "");
          clearTimeout(timers.get(el));
          timers.set(
            el,
            setTimeout(() => {
              el.removeAttribute("data-progresso-fim");
              timers.delete(el);
            }, DURACAO_FIM_MS)
          );
        } else if (agora === "true" && el.hasAttribute("data-progresso-fim")) {
          clearTimeout(timers.get(el));
          timers.delete(el);
          el.removeAttribute("data-progresso-fim");
        }
      }
    });
    obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-busy"], attributeOldValue: true });
    return () => {
      obs.disconnect();
      for (const t of timers.values()) clearTimeout(t);
    };
  }, []);
  return null;
}
