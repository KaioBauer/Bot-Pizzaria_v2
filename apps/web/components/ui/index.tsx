import clsx, { type ClassValue } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Componentes base do painel e do cardápio. Tudo em Tailwind, sem estado:
 * funcionam em Server e Client Components.
 */

// Classes repetidas: vale a última (ex.: className="bg-red-600" sobrescreve a variante).
const juntar = extendTailwindMerge({ extend: { theme: { shadow: ["suave", "elevada"] } } });
export function cn(...classes: ClassValue[]) {
  return juntar(clsx(classes));
}

// Botões ---------------------------------------------------------------------------

type Variante = "primario" | "secundario" | "fantasma" | "perigo" | "sucesso" | "escuro";
type Tamanho = "sm" | "md" | "lg";

// Estilo de ferramenta de produto: neutro, bordas finas, cor da marca só onde importa.
const VARIANTES: Record<Variante, string> = {
  primario: "bg-zinc-900 text-white shadow-[0_1px_2px_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-zinc-800",
  secundario: "bg-white text-zinc-800 shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300",
  fantasma: "text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900",
  perigo: "bg-white text-red-600 shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-inset ring-red-200 hover:bg-red-50",
  sucesso: "bg-emerald-600 text-white shadow-[0_1px_2px_rgb(0_0_0/0.15),inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-emerald-700",
  escuro: "bg-zinc-900 text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] hover:bg-zinc-800",
};

const TAMANHOS: Record<Tamanho, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-2.5 text-[13px]",
  md: "h-9 gap-2 rounded-lg px-3.5 text-sm",
  lg: "h-11 gap-2 rounded-xl px-5 text-[15px]",
};

export function estiloBotao(variante: Variante = "primario", tamanho: Tamanho = "md", extra?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,box-shadow,transform,color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    VARIANTES[variante],
    TAMANHOS[tamanho],
    extra
  );
}

export function Botao({
  variante,
  tamanho,
  className,
  ...props
}: ComponentProps<"button"> & { variante?: Variante; tamanho?: Tamanho }) {
  return <button {...props} className={estiloBotao(variante, tamanho, className)} />;
}

export function BotaoLink({
  variante,
  tamanho,
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante; tamanho?: Tamanho }) {
  return <Link {...props} className={estiloBotao(variante, tamanho, className)} />;
}

// Superfícies ------------------------------------------------------------------------

export function Cartao({ className, ...props }: ComponentProps<"section">) {
  return <section {...props} className={cn("rounded-2xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-zinc-200/80", className)} />;
}

export function CabecalhoCartao({ titulo, descricao, acoes }: { titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-[13px] text-zinc-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-900">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-zinc-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}

// Selos -----------------------------------------------------------------------------

export type Tom = "neutro" | "marca" | "sucesso" | "aviso" | "perigo" | "info" | "violeta";

const TONS: Record<Tom, string> = {
  neutro: "bg-zinc-100 text-zinc-700 ring-zinc-200/70",
  marca: "bg-marca-50 text-marca-700 ring-marca-200/70",
  sucesso: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  aviso: "bg-amber-50 text-amber-800 ring-amber-200/70",
  perigo: "bg-red-50 text-red-700 ring-red-200/70",
  info: "bg-sky-50 text-sky-700 ring-sky-200/70",
  violeta: "bg-violet-50 text-violet-700 ring-violet-200/70",
};

export function Selo({ tom = "neutro", className, ...props }: ComponentProps<"span"> & { tom?: Tom }) {
  return (
    <span
      {...props}
      className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", TONS[tom], className)}
    />
  );
}

// Formulários ---------------------------------------------------------------------------

export const estiloEntrada =
  "block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-zinc-900 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-inset ring-zinc-200 transition-shadow placeholder:text-zinc-400 hover:ring-zinc-300 focus:ring-2 focus:ring-zinc-900/80 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500";

export function Campo({
  rotulo,
  dica,
  erro,
  children,
  className,
}: {
  rotulo: ReactNode;
  dica?: ReactNode;
  erro?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">{rotulo}</span>
      {children}
      {erro ? (
        <span className="mt-1.5 block text-[13px] text-red-600">{erro}</span>
      ) : (
        dica && <span className="mt-1.5 block text-[13px] text-zinc-500">{dica}</span>
      )}
    </label>
  );
}

/** Interruptor estilizado sobre um checkbox nativo (acessível, funciona sem JS). */
export function Interruptor({
  rotulo,
  descricao,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { rotulo?: ReactNode; descricao?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" {...props} className="peer sr-only" />
        <span className="h-5 w-9 rounded-full bg-zinc-200 shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)] transition-colors duration-200 peer-checked:bg-zinc-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-zinc-900" />
        <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.2)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] peer-checked:translate-x-4" />
      </span>
      {(rotulo || descricao) && (
        <span>
          {rotulo && <span className="block text-sm font-medium text-zinc-900">{rotulo}</span>}
          {descricao && <span className="block text-[13px] text-zinc-500">{descricao}</span>}
        </span>
      )}
    </label>
  );
}

// Estados -------------------------------------------------------------------------------

export function Vazio({ icone, titulo, descricao, acao }: { icone?: ReactNode; titulo: string; descricao?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icone && <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-white text-zinc-400 shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-zinc-200">{icone}</div>}
      <p className="text-sm font-medium text-zinc-800">{titulo}</p>
      {descricao && <p className="mt-1 max-w-sm text-[13px] text-zinc-500">{descricao}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function Aviso({ tom = "perigo", children, className }: { tom?: "perigo" | "sucesso" | "aviso" | "info"; children: ReactNode; className?: string }) {
  const estilos = {
    perigo: "bg-red-50 text-red-800 ring-red-200",
    sucesso: "bg-manjericao-50 text-manjericao-700 ring-manjericao-100",
    aviso: "bg-amber-50 text-amber-900 ring-amber-200",
    info: "bg-sky-50 text-sky-800 ring-sky-200",
  }[tom];
  return (
    <p role={tom === "perigo" ? "alert" : "status"} className={cn("rounded-lg px-3.5 py-2.5 text-[13px] ring-1 ring-inset", estilos, className)}>
      {children}
    </p>
  );
}

// Marca ---------------------------------------------------------------------------------

/** Selo da marca: fatia de pizza estilizada. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn("size-9", className)}>
      <rect width="48" height="48" rx="14" className="fill-marca-600" />
      <path d="M12 15.5C19.6 10.8 28.4 10.8 36 15.5L24 38Z" className="fill-amber-300" />
      <path d="M12 15.5C19.6 10.8 28.4 10.8 36 15.5L34.4 18.6C27.6 14.6 20.4 14.6 13.6 18.6Z" className="fill-amber-500" />
      <circle cx="21" cy="21" r="2.4" className="fill-marca-600" />
      <circle cx="27.5" cy="24" r="2" className="fill-marca-600" />
      <circle cx="23.5" cy="29.5" r="1.8" className="fill-marca-600" />
      <circle cx="26" cy="18.5" r="1.2" className="fill-manjericao-600" />
    </svg>
  );
}

/** Miniatura de produto sem foto: fundo quente com a inicial. */
export function MiniaturaProduto({ nome, url, className }: { nome: string; url?: string | null; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nome} loading="lazy" className={cn("object-cover", className)} />;
  }
  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-amber-100 via-marca-100 to-marca-200 font-display text-2xl font-semibold text-marca-700",
        className
      )}
    >
      {nome.trim().charAt(0).toUpperCase()}
    </div>
  );
}
