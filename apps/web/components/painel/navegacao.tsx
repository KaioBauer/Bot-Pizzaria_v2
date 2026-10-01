"use client";

import { ChartColumn, ClipboardList, Pizza, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../ui";

export const ITENS_MENU = [
  { href: "/admin/pedidos", rotulo: "Pedidos", Icone: ClipboardList },
  { href: "/admin/cardapio", rotulo: "Cardápio", Icone: Pizza },
  { href: "/admin/relatorios", rotulo: "Relatórios", Icone: ChartColumn },
  { href: "/admin/configuracoes", rotulo: "Configurações", Icone: Settings },
] as const;

function ativo(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Menu lateral (tablet/desktop): só ícones em md, ícone + texto em lg. */
export function MenuLateral() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Menu do painel">
      {ITENS_MENU.map(({ href, rotulo, Icone }) => {
        const atual = ativo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            title={rotulo}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors md:justify-center lg:justify-start",
              atual ? "bg-white/10 text-white" : "text-stone-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icone className={cn("size-5 shrink-0", atual ? "text-marca-400" : "")} strokeWidth={2} />
            <span className="md:hidden lg:inline">{rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra inferior no celular. */
export function MenuInferior() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Menu do painel"
    >
      {ITENS_MENU.map(({ href, rotulo, Icone }) => {
        const atual = ativo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={atual ? "page" : undefined}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", atual ? "text-marca-600" : "text-stone-500")}
          >
            <Icone className="size-5" />
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
