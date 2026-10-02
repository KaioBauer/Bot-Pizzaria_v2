import { Bike } from "lucide-react";
import type { EntregadorPainel } from "@pizzaria/db";
import { formatarTelefone } from "@pizzaria/shared";
import { Cartao, cn } from "../../../../components/ui";
import { alternarEntregadorAction } from "./actions";

/** Motoboys: login criado pelo comando (ver texto); aqui liga/desliga e acompanha. */
export function SecaoEntregadores({ entregadores }: { entregadores: EntregadorPainel[] }) {
  return (
    <div className="grid gap-4 border-b border-stone-200 pb-10 last:border-0 lg:grid-cols-[17rem_1fr] lg:gap-10">
      <div>
        <h2 className="font-display text-xl font-semibold">Motoboys</h2>
        <p className="mt-1 text-sm text-stone-500">
          Quem pode escanear o QR do cupom para iniciar e confirmar entregas. Desativado, o login para de funcionar nas entregas.
        </p>
        <p className="mt-3 rounded-xl bg-stone-100 p-3 text-xs text-stone-600">
          Novo motoboy: no PC, rode{" "}
          <code className="font-mono font-semibold">pnpm usuario entregador email@x.com &quot;Nome&quot;</code> e escolha a senha. Ele entra em{" "}
          <code className="font-mono">/entrega</code> no celular.
        </p>
      </div>
      <Cartao>
        {entregadores.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">Nenhum motoboy cadastrado ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {entregadores.map((e) => (
              <li key={e.id} className={cn("flex items-center gap-4 px-5 py-4 sm:px-6", !e.ativo && "opacity-60")}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                  <Bike className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.nome}</p>
                  <p className="text-sm text-stone-500">
                    {e.telefone ? `${formatarTelefone(e.telefone)} · ` : ""}
                    {e.entregasHoje} entrega(s) hoje{e.emRota ? ` · ${e.emRota} em rota agora` : ""}
                  </p>
                </div>
                <form action={alternarEntregadorAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="ativo" value={String(!e.ativo)} />
                  <button
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset",
                      e.ativo ? "bg-manjericao-50 text-manjericao-700 ring-manjericao-100" : "bg-stone-100 text-stone-500 ring-stone-200"
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
