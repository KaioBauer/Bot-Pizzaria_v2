"use client";

import { ChartColumn, ClipboardList, MessagesSquare, Pizza, Printer, Search, Settings } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "../ui";
import { usePendentesAtendimento } from "./atendimento";
import { usePaletaComandos } from "./comandos";

export const ITENS_MENU = [
  { href: "/admin/pedidos", rotulo: "Pedidos", Icone: ClipboardList, atalho: "G P" },
  { href: "/admin/conversas", rotulo: "Conversas", Icone: MessagesSquare, atalho: "G C" },
  { href: "/admin/cardapio", rotulo: "Cardápio", Icone: Pizza, atalho: "G M" },
  { href: "/admin/relatorios", rotulo: "Relatórios", Icone: ChartColumn, atalho: "G R" },
  { href: "/admin/impressao", rotulo: "Impressão", Icone: Printer, atalho: "G I" },
  { href: "/admin/configuracoes", rotulo: "Configurações", curto: "Ajustes", Icone: Settings, atalho: "G S" },
] as const;

function ativo(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Selo({ href, flutuante }: { href: string; flutuante?: boolean }) {
  const pendentes = usePendentesAtendimento();
  if (href !== "/admin/conversas" || pendentes === 0) return null;
  return (
    <motion.span
      key={pendentes}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      className={cn(
        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-marca-600 px-1 text-[10.5px] font-semibold text-white tabular",
        flutuante ? "absolute top-1 right-1/2 translate-x-4" : "relative md:absolute md:top-0.5 md:right-0.5 lg:relative lg:top-auto lg:right-auto lg:ml-auto"
      )}
    >
      {pendentes}
    </motion.span>
  );
}

/** Botão de busca que abre a paleta de comandos. */
export function BotaoBusca() {
  const { abrir } = usePaletaComandos();
  return (
    <button
      onClick={abrir}
      className="group flex h-9 w-full items-center gap-2 rounded-lg bg-zinc-100/70 px-2.5 text-[13px] text-zinc-500 ring-1 ring-transparent transition hover:bg-white hover:ring-zinc-200 md:justify-center lg:justify-start"
      title="Buscar páginas e ações (Ctrl+K)"
    >
      <Search className="size-4" />
      <span className="md:hidden lg:inline">Buscar...</span>
      <kbd className="ml-auto hidden rounded border border-zinc-200 bg-white px-1.5 text-[10.5px] font-medium text-zinc-400 lg:inline">Ctrl K</kbd>
    </button>
  );
}

/** Menu lateral (tablet/desktop): só ícones em md, ícone + texto em lg. */
export function MenuLateral() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Menu do painel">
      {ITENS_MENU.map(({ href, rotulo, Icone, atalho }) => {
        const atual = ativo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            title={`${rotulo} (${atalho})`}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors md:justify-center lg:justify-start",
              atual ? "text-zinc-900" : "text-zinc-500 hover:bg-zinc-100/70 hover:text-zinc-900"
            )}
          >
            {atual && (
              <motion.span
                layoutId="menu-ativo"
                className="absolute inset-0 rounded-lg bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-zinc-200/80"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <Icone className={cn("relative size-4 shrink-0 transition-colors", atual ? "text-marca-600" : "")} strokeWidth={2} />
            <span className="relative md:hidden lg:inline">{rotulo}</span>
            <span className="relative ml-auto hidden text-[10.5px] text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 lg:inline">{atalho}</span>
            <Selo href={href} />
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra inferior no celular, com pílula animada no item ativo. */
export function MenuInferior() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-zinc-200/70 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Menu do painel"
    >
      {ITENS_MENU.map((item) => {
        const { href, rotulo, Icone } = item;
        const atual = ativo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={atual ? "page" : undefined}
            className={cn("relative flex min-w-0 flex-col items-center gap-1 py-2 text-[10.5px] font-medium", atual ? "text-zinc-900" : "text-zinc-400")}
          >
            <span className="relative flex h-7 w-11 max-w-full items-center justify-center">
              {atual && <motion.span layoutId="menu-inferior-ativo" className="absolute inset-0 rounded-full bg-zinc-100" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <Icone className={cn("relative size-[18px]", atual && "text-marca-600")} />
            </span>
            <span className="max-w-full truncate px-0.5">{"curto" in item ? item.curto : rotulo}</span>
            <Selo href={href} flutuante />
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Entrada suave a cada troca de página. Em CSS (não JS): se a aba estiver em
 * segundo plano, o conteúdo nunca fica preso invisível esperando a animação.
 */
export function TransicaoPagina({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="motion-safe:animate-[entrada_0.3s_cubic-bezier(0.22,1,0.36,1)]">
      {children}
    </div>
  );
}
