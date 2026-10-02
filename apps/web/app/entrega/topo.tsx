import { Bike, LogOut } from "lucide-react";
import Link from "next/link";
import { Logo } from "../../components/ui";
import { sairEntregadorAction } from "./actions";

export function TopoEntrega({ nome }: { nome: string | null }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
      <Link href="/entrega" className="flex items-center gap-2.5">
        <Logo className="size-9" />
        <span>
          <span className="block font-display text-lg leading-tight font-semibold">Entregas</span>
          {nome && (
            <span className="flex items-center gap-1 text-xs text-stone-500">
              <Bike className="size-3.5" /> {nome}
            </span>
          )}
        </span>
      </Link>
      <form action={sairEntregadorAction} className="ml-auto">
        <button className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-500 hover:bg-stone-100" aria-label="Sair">
          <LogOut className="size-4" /> Sair
        </button>
      </form>
    </header>
  );
}
