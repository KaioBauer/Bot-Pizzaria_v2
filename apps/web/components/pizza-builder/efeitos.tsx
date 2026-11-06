"use client";

import { animate, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
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

/** Som curto sintetizado (sem arquivo). Só toca se o cliente ligou o som. */
export function usarSom(ligado: boolean) {
  const contexto = useRef<AudioContext | null>(null);
  return useCallback(
    (tipo: "pop" | "sai" | "forno" | "sucesso") => {
      if (!ligado || typeof window === "undefined") return;
      try {
        contexto.current ??= new AudioContext();
        const ctx = contexto.current;
        const notas: Record<typeof tipo, [number, number, number][]> = {
          pop: [[520, 880, 0.09]],
          sai: [[700, 300, 0.12]],
          forno: [[120, 90, 0.5]],
          sucesso: [
            [523, 523, 0.1],
            [659, 659, 0.1],
            [784, 784, 0.18],
          ],
        };
        let inicio = ctx.currentTime;
        for (const [de, para, duracao] of notas[tipo]) {
          const osc = ctx.createOscillator();
          const ganho = ctx.createGain();
          osc.type = tipo === "forno" ? "sawtooth" : "sine";
          osc.frequency.setValueAtTime(de, inicio);
          osc.frequency.exponentialRampToValueAtTime(para, inicio + duracao);
          ganho.gain.setValueAtTime(tipo === "forno" ? 0.03 : 0.12, inicio);
          ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
          osc.connect(ganho).connect(ctx.destination);
          osc.start(inicio);
          osc.stop(inicio + duracao);
          inicio += duracao * 0.9;
        }
      } catch {
        // Sem áudio no navegador: segue em silêncio.
      }
    },
    [ligado]
  );
}

/** Preferência de som (desligado por padrão), lembrada por aparelho. */
export function usePreferenciaSom(): [boolean, (v: boolean) => void] {
  const [ligado, setLigado] = useState(false);
  useEffect(() => {
    try {
      setLigado(localStorage.getItem("vianna:som") === "1");
    } catch {}
  }, []);
  const alterar = useCallback((v: boolean) => {
    setLigado(v);
    try {
      localStorage.setItem("vianna:som", v ? "1" : "0");
    } catch {}
  }, []);
  return [ligado, alterar];
}
