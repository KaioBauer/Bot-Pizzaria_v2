import { Bike } from "lucide-react";
import type { EntregadorPainel } from "@pizzaria/db";
import { formatarTelefone } from "@pizzaria/shared";
import { Cartao, cn } from "../../../../components/ui";
import { alternarEntregadorAction } from "./actions";

/** Motoboys: login criado pelo comando (ver texto); aqui liga/desliga e acompanha. */
export function SecaoEntregadores({ entregadores }: { entregadores: EntregadorPainel[] }) {
  return (
    <div className="grid gap-4 border-b border-zinc-200/70 pb-8 last:border-0 lg:grid-cols-[17rem_1fr] lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">Motoboys</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
          Quem pode escanear o QR do cupom para iniciar e confirmar entregas. Desativado, o login para de funcionar nas entregas.
        </p>
        <p className="mt-3 rounded-lg bg-zinc-100/70 p-3 text-[12px] leading-relaxed text-zinc-600 ring-1 ring-zinc-200/60 ring-inset">
          Novo motoboy: no PC (ou com "!" aqui no Claude Code), rode{" "}
          <code className="font-mono font-semibold">pnpm usuario entregador email@x.com &quot;Nome&quot;</code> — a senha aparece no final. Ele entra em{" "}
          <code className="font-mono">/entrega</code> no celular.
        </p>
      </div>
      <Cartao>
        {entregadores.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">Nenhum motoboy cadastrado ainda.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {entregadores.map((e) => (
              <li key={e.id} className={cn("flex items-center gap-4 px-5 py-4 sm:px-6", !e.ativo && "opacity-60")}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 ring-1 ring-zinc-900/5 ring-inset">
                  <Bike className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">{e.nome}</p>
                  <p className="text-sm text-zinc-500">
                    {e.telefone ? `${formatarTelefone(e.telefone)} · ` : ""}
                    {e.entregasHoje} entrega(s) hoje{e.emRota ? ` · ${e.emRota} em rota agora` : ""}
                  </p>
                </div>
                <form action={alternarEntregadorAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="ativo" value={String(!e.ativo)} />
                  <button
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset transition-[background-color,transform] active:scale-[0.97]",
                      e.ativo ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70 hover:bg-emerald-100/70" : "bg-zinc-100 text-zinc-500 ring-zinc-200 hover:bg-zinc-200/70"
                    )}
                  >
                    {e.ativo ? "Ativo" : "Desativado"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
