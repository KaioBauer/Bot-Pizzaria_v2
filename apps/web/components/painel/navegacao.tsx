"use client";

import { ChartColumn, ClipboardList, MessagesSquare, Pizza, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../ui";
import { usePendentesAtendimento } from "./atendimento";

export const ITENS_MENU = [
  { href: "/admin/pedidos", rotulo: "Pedidos", Icone: ClipboardList },
  { href: "/admin/conversas", rotulo: "Conversas", Icone: MessagesSquare },
  { href: "/admin/cardapio", rotulo: "Cardápio", Icone: Pizza },
  { href: "/admin/relatorios", rotulo: "Relatórios", Icone: ChartColumn },
  { href: "/admin/configuracoes", rotulo: "Configurações", Icone: Settings },
] as const;

function ativo(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Selo({ href, flutuante }: { href: string; flutuante?: boolean }) {
  const pendentes = usePendentesAtendimento();
  if (href !== "/admin/conversas" || pendentes === 0) return null;
  return (
    <span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-amber-950 tabular", flutuante ? "absolute -top-1 right-1/2 translate-x-4" : "md:absolute md:top-1 md:right-1 lg:static lg:ml-auto")}>
      {pendentes}
    </span>
  );
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
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors md:justify-center lg:justify-start",
              atual ? "bg-white/10 text-white" : "text-stone-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icone className={cn("size-5 shrink-0", atual ? "text-marca-400" : "")} strokeWidth={2} />
            <span className="md:hidden lg:inline">{rotulo}</span>
            <Selo href={href} />
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
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Menu do painel"
    >
      {ITENS_MENU.map(({ href, rotulo, Icone }) => {
        const atual = ativo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={atual ? "page" : undefined}
            className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", atual ? "text-marca-600" : "text-stone-500")}
          >
            <Icone className="size-5" />
            {rotulo}
            <Selo href={href} flutuante />
          </Link>
        );
      })}
    </nav>
  );
}
