import Link from "next/link";
import { situacaoLoja } from "@pizzaria/core";
import { criarRepositorios } from "@pizzaria/db";
import { exigirAdmin } from "../../../lib/auth";
import { sairAction } from "../login/actions";
import { alternarLojaAction } from "./configuracoes/actions";

const LINKS = [
  { href: "/admin/pedidos", rotulo: "Pedidos" },
  { href: "/admin/cardapio", rotulo: "Cardápio" },
  { href: "/admin/relatorios", rotulo: "Relatórios" },
  { href: "/admin/configuracoes", rotulo: "Configurações" },
];

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { supabase, email } = await exigirAdmin();
  const config = await criarRepositorios(supabase).loja.configuracao();
  const situacao = situacaoLoja(config, new Date());

  const estado = situacao.aberta
    ? { texto: "Aberta", cor: "bg-emerald-100 text-emerald-800" }
    : situacao.motivo === "pausada"
      ? { texto: "Pausada", cor: "bg-amber-100 text-amber-900" }
      : { texto: "Fora do horário", cor: "bg-stone-200 text-stone-700" };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-stone-200 bg-white px-3 py-2">
        <span className="mr-1 text-lg font-bold text-marca-700">🍕 Vianna</span>
        <nav className="flex flex-wrap gap-0.5">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 font-medium hover:bg-stone-100">
              {l.rotulo}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <form action={alternarLojaAction} className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${estado.cor}`}>{estado.texto}</span>
            <input type="hidden" name="aceitando" value={String(!config.aceitandoPedidos)} />
            <button className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
              {config.aceitandoPedidos ? "Pausar pedidos" : "Retomar pedidos"}
            </button>
          </form>
          <form action={sairAction} className="flex items-center gap-2">
            <span className="hidden text-sm text-stone-500 xl:inline">{email}</span>
            <button className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">Sair</button>
          </form>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
