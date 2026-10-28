"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, use, useCallback, useRef, useState, type ReactNode } from "react";

/**
 * Toasts do painel (canto inferior direito, empilhados, somem sozinhos).
 * `useAvisos().mostrar({ titulo, descricao, tom })` em qualquer tela.
 */

type Tom = "sucesso" | "erro" | "info" | "novo";

interface Aviso {
  id: number;
  titulo: string;
  descricao?: string | undefined;
  tom: Tom;
}

const Contexto = createContext<{ mostrar: (aviso: Omit<Aviso, "id">) => void }>({ mostrar: () => {} });

export const useAvisos = () => use(Contexto);

const ICONE: Record<Tom, ReactNode> = {
  sucesso: <CheckCircle2 className="size-4 text-emerald-500" />,
  erro: <CircleAlert className="size-4 text-red-500" />,
  info: <Info className="size-4 text-sky-500" />,
  novo: (
    <span className="relative flex size-2.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-marca-500 opacity-70" />
      <span className="relative inline-flex size-2.5 rounded-full bg-marca-500" />
    </span>
  ),
};

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const seq = useRef(0);

  const fechar = useCallback((id: number) => setAvisos((l) => l.filter((a) => a.id !== id)), []);
  const mostrar = useCallback(
    (aviso: Omit<Aviso, "id">) => {
      const id = ++seq.current;
      setAvisos((l) => [...l.slice(-3), { ...aviso, id }]);
      setTimeout(() => fechar(id), aviso.tom === "novo" ? 8000 : 4000);
    },
    [fechar]
  );

  return (
    <Contexto value={{ mostrar }}>
      {children}
      <ol className="pointer-events-none fixed right-4 bottom-20 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 md:bottom-4" aria-live="polite">
        <AnimatePresence initial={false}>
          {avisos.map((a) => (
            <motion.li
              key={a.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex items-start gap-3 rounded-xl bg-white/95 p-3.5 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.25),0_0_0_1px_rgb(0_0_0/0.06)] backdrop-blur"
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">{ICONE[a.tom]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">{a.titulo}</p>
                {a.descricao && <p className="mt-0.5 text-[13px] text-zinc-500">{a.descricao}</p>}
              </div>
              <button onClick={() => fechar(a.id)} className="rounded-md p-0.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700" aria-label="Fechar">
                <X className="size-3.5" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </Contexto>
  );
}
