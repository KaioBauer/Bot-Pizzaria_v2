"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as PointerReact, type RefObject } from "react";
import type { ColunaQuadro } from "../../../../lib/quadro";

/** Mouse: começa a arrastar depois de mover alguns pixels (clique continua sendo clique). */
const LIMIAR_MOUSE_PX = 6;
/** Dedo: segurar parado antes de arrastar (senão é rolagem da tela). */
const SEGURAR_TOQUE_MS = 280;
const TOLERANCIA_TOQUE_PX = 10;
/** Rolagem automática do quadro perto das bordas. */
const BORDA_ROLAGEM_PX = 56;
const VELOCIDADE_ROLAGEM = 14;

export interface Arrasto {
  pedidoId: string;
  x: number;
  y: number;
  /** Deslocamento do ponteiro dentro do cartão (o fantasma não "pula"). */
  dx: number;
  dy: number;
  largura: number;
  coluna: ColunaQuadro | null;
}

function colunaNoPonto(x: number, y: number): ColunaQuadro | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-coluna]");
  return (el?.dataset.coluna as ColunaQuadro | undefined) ?? null;
}

/**
 * Arrastar cartões entre as raias com pointer events (mouse, caneta e toque).
 * No toque é preciso segurar o cartão um instante; enquanto arrasta, a rolagem
 * da página fica travada e o quadro rola sozinho perto das bordas.
 */
export function useArrastarPedidos(quadro: RefObject<HTMLElement | null>, aoSoltar: (pedidoId: string, coluna: ColunaQuadro) => void) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const ativo = useRef<Arrasto | null>(null);
  const cliqueBloqueado = useRef(false);
  const soltar = useRef(aoSoltar);
  useEffect(() => {
    soltar.current = aoSoltar;
  });

  // Toque: impede a rolagem enquanto arrasta (precisa ser listener não passivo).
  useEffect(() => {
    const travar = (e: TouchEvent) => {
      if (ativo.current && e.cancelable) e.preventDefault();
    };
    window.addEventListener("touchmove", travar, { passive: false });
    return () => window.removeEventListener("touchmove", travar);
  }, []);

  // Rolagem automática do quadro (horizontal) e da raia (vertical) perto das bordas.
  useEffect(() => {
    if (!arrasto) return;
    let quadroId = 0;
    const passo = () => {
      const a = ativo.current;
      const el = quadro.current;
      if (a && el) {
        const r = el.getBoundingClientRect();
        if (a.x < r.left + BORDA_ROLAGEM_PX) el.scrollLeft -= VELOCIDADE_ROLAGEM;
        else if (a.x > r.right - BORDA_ROLAGEM_PX) el.scrollLeft += VELOCIDADE_ROLAGEM;
        const lista = document.elementFromPoint(a.x, a.y)?.closest<HTMLElement>("[data-coluna-lista]");
        if (lista) {
          const rl = lista.getBoundingClientRect();
          if (a.y < rl.top + BORDA_ROLAGEM_PX) lista.scrollTop -= VELOCIDADE_ROLAGEM;
          else if (a.y > rl.bottom - BORDA_ROLAGEM_PX) lista.scrollTop += VELOCIDADE_ROLAGEM;
        }
        const coluna = colunaNoPonto(a.x, a.y);
        if (coluna !== a.coluna) {
          ativo.current = { ...a, coluna };
          setArrasto(ativo.current);
        }
      }
      quadroId = requestAnimationFrame(passo);
    };
    quadroId = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadroId);
  }, [arrasto !== null, quadro]); // eslint-disable-line react-hooks/exhaustive-deps

  const iniciar = useCallback((e: PointerReact<HTMLElement>, pedidoId: string) => {
    if (e.button !== 0) return;
    // O botão de ação do cartão continua sendo só botão.
    if ((e.target as HTMLElement).closest("[data-sem-arrasto]")) return;
    const cartao = e.currentTarget.getBoundingClientRect();
    const toque = e.pointerType === "touch";
    const inicio = { x: e.clientX, y: e.clientY };
    let liberado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const comecar = (x: number, y: number) => {
      liberado = true;
      ativo.current = { pedidoId, x, y, dx: inicio.x - cartao.left, dy: inicio.y - cartao.top, largura: cartao.width, coluna: colunaNoPonto(x, y) };
      setArrasto(ativo.current);
      if (toque) navigator.vibrate?.(15);
    };

    if (toque) timer = setTimeout(() => comecar(inicio.x, inicio.y), SEGURAR_TOQUE_MS);

    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const distancia = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
      if (!liberado) {
        if (toque) {
          if (distancia > TOLERANCIA_TOQUE_PX) encerrar(); // é rolagem
          return;
        }
        if (distancia < LIMIAR_MOUSE_PX) return;
        comecar(ev.clientX, ev.clientY);
      }
      const a = ativo.current;
      if (!a) return;
      ativo.current = { ...a, x: ev.clientX, y: ev.clientY };
      setArrasto(ativo.current);
    };

    const fim = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const a = ativo.current;
      if (a && ev.type === "pointerup") {
        const coluna = colunaNoPonto(ev.clientX, ev.clientY);
        if (coluna) soltar.current(a.pedidoId, coluna);
      }
      if (a) {
        // O "click" que vem depois do pointerup não deve abrir o detalhe.
        cliqueBloqueado.current = true;
        setTimeout(() => (cliqueBloqueado.current = false), 0);
      }
      encerrar();
    };

    const semMenu = (ev: Event) => {
      if (ativo.current || toque) ev.preventDefault();
    };

    function encerrar() {
      clearTimeout(timer);
      ativo.current = null;
      setArrasto(null);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      window.removeEventListener("contextmenu", semMenu);
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
    window.addEventListener("contextmenu", semMenu);
  }, []);

  /** Para usar em onClickCapture do cartão. */
  const bloquearCliqueAposArrasto = useCallback((e: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (!cliqueBloqueado.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return { arrasto, iniciar, bloquearCliqueAposArrasto };
}
