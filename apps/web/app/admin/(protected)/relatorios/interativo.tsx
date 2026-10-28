"use client";

import Link from "next/link";
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatarReais } from "@pizzaria/shared";
import { cn } from "../../../../components/ui";

/**
 * Peças interativas dos relatórios. A página continua Server Component;
 * só o número que conta e o indicador deslizante dos filtros precisam de cliente.
 */

const FORMATOS = {
  reais: (v: number) => formatarReais(Math.round(v)),
  inteiro: (v: number) => String(Math.round(v)),
} as const;

/** Número que conta de 0 até o valor ao montar e entre valores quando muda o filtro. */
export function NumeroAnimado({ valor, formato = "inteiro", className }: { valor: number; formato?: keyof typeof FORMATOS; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anterior = useRef(0);
  const reduzido = useReducedMotion();
  const texto = FORMATOS[formato];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduzido) {
      el.textContent = texto(valor);
      anterior.current = valor;
      return;
    }
    const controle = animate(anterior.current, valor, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => (el.textContent = texto(v)) });
    anterior.current = valor;
    return () => controle.stop();
  }, [valor, reduzido, texto]);

  // O HTML do servidor já traz o valor final (funciona sem JS).
  return (
    <span ref={ref} className={cn("tabular", className)}>
      {texto(valor)}
    </span>
  );
}

/** Controle segmentado com indicador que desliza entre as opções (links: filtro fica na URL). */
export function ControleSegmentado({ id, rotulo, opcoes, atual }: { id: string; rotulo: string; opcoes: Array<{ id: string; texto: string; href: string }>; atual: string }) {
  const reduzido = useReducedMotion();
  return (
    <nav aria-label={rotulo} className="inline-flex rounded-lg bg-zinc-100/80 p-0.5 ring-1 ring-zinc-200/60 ring-inset">
      {opcoes.map((o) => {
        const ativo = o.id === atual;
        return (
          <Link
            key={o.id}
            href={o.href}
            scroll={false}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "relative rounded-md px-3 py-1 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900",
              ativo ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            {ativo && (
              <motion.span
                layoutId={`segmento-${id}`}
                aria-hidden
                className="absolute inset-0 rounded-md bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)]"
                transition={reduzido ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{o.texto}</span>
          </Link>
        );
      })}
    </nav>
  );
}
