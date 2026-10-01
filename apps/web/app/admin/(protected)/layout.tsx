import Link from "next/link";
import { exigirAdmin } from "../../../lib/auth";
import { sairAction } from "../login/actions";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { email } = await exigirAdmin();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 sm:gap-4">
        <span className="mr-2 text-lg font-bold text-marca-700">🍕 Vianna</span>
        <nav className="flex gap-1">
          <Link href="/admin/pedidos" className="rounded-lg px-3 py-2 font-medium hover:bg-stone-100">
            Pedidos
          </Link>
          <Link href="/admin/cardapio" className="rounded-lg px-3 py-2 font-medium hover:bg-stone-100">
            Cardápio
          </Link>
        </nav>
        <form action={sairAction} className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-stone-500 md:inline">{email}</span>
          <button type="submit" className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
            Sair
          </button>
        </form>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
