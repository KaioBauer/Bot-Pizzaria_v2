import { LogOut, Pause, Play } from "lucide-react";
import { proximaAbertura, situacaoLoja } from "@pizzaria/core";
import { contarPrecisaAtencao, criarRepositorios } from "@pizzaria/db";
import { AvisoAtendimento, ProvedorAtendimento } from "../../../components/painel/atendimento";
import { MenuInferior, MenuLateral } from "../../../components/painel/navegacao";
import { cn, Logo } from "../../../components/ui";
import { exigirAdmin } from "../../../lib/auth";
import { sairAction } from "../login/actions";
import { alternarLojaAction } from "./configuracoes/actions";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { supabase, email } = await exigirAdmin();
  const [config, pendentesAtendimento] = await Promise.all([
    criarRepositorios(supabase).loja.configuracao(),
    contarPrecisaAtencao(supabase).catch(() => 0),
  ]);
  const agora = new Date();
  const situacao = situacaoLoja(config, agora);
  const abre = situacao.aberta ? null : proximaAbertura(config.horarios, agora, config.fusoHorario);

  const estado = situacao.aberta
    ? { rotulo: "Aberta", detalhe: "Recebendo pedidos", ponto: "bg-manjericao-500", anel: "ring-manjericao-500/30" }
    : situacao.motivo === "pausada"
      ? { rotulo: "Pausada", detalhe: "Bot não aceita pedidos", ponto: "bg-amber-400", anel: "ring-amber-400/30" }
      : { rotulo: "Fechada", detalhe: abre ? `Abre ${abre}` : "Fora do horário", ponto: "bg-stone-400", anel: "ring-stone-400/30" };

  const chaveLoja = (
    <form action={alternarLojaAction}>
      <input type="hidden" name="aceitando" value={String(!config.aceitandoPedidos)} />
      <button
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
          config.aceitandoPedidos ? "bg-white/10 text-white hover:bg-white/15" : "bg-manjericao-600 text-white hover:bg-manjericao-700"
        )}
        title={config.aceitandoPedidos ? "O bot para de aceitar pedidos até você retomar" : "Volta a aceitar pedidos (dentro do horário)"}
      >
        {config.aceitandoPedidos ? <Pause className="size-4" /> : <Play className="size-4" />}
        <span className="md:hidden lg:inline">{config.aceitandoPedidos ? "Pausar pedidos" : "Retomar pedidos"}</span>
      </button>
    </form>
  );

  return (
    <ProvedorAtendimento inicial={pendentesAtendimento}>
    <AvisoAtendimento />
    <div className="min-h-dvh md:pl-20 lg:pl-64">
      {/* Barra lateral (tablet e desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col bg-stone-950 px-3 py-5 md:flex lg:w-64 lg:px-4">
        <div className="mb-8 flex items-center gap-3 px-1 md:justify-center lg:justify-start">
          <Logo className="size-10" />
          <div className="hidden lg:block">
            <p className="font-display text-lg leading-tight font-semibold text-white">Vianna</p>
            <p className="text-xs text-stone-400">Painel da pizzaria</p>
          </div>
        </div>

        <MenuLateral />

        <div className="mt-auto space-y-3">
          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2.5 md:justify-center lg:justify-start" title={`${estado.rotulo} · ${estado.detalhe}`}>
              <span className={cn("size-2.5 shrink-0 rounded-full ring-4", estado.ponto, estado.anel)} />
              <div className="hidden min-w-0 lg:block">
                <p className="text-sm font-semibold text-white">{estado.rotulo}</p>
                <p className="truncate text-xs text-stone-400">{estado.detalhe}</p>
              </div>
            </div>
            <div className="mt-3">{chaveLoja}</div>
          </div>

          <form action={sairAction} className="flex items-center gap-2 px-1 md:justify-center lg:justify-between">
            <span className="hidden truncate text-xs text-stone-400 lg:block" title={email ?? undefined}>
              {email}
            </span>
            <button className="rounded-lg p-2 text-stone-400 hover:bg-white/5 hover:text-white" title="Sair" aria-label="Sair">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Logo className="size-8" />
        <span className="font-display text-lg font-semibold">Vianna</span>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
          <span className={cn("size-2 rounded-full", estado.ponto)} />
          {estado.rotulo}
        </span>
        <form action={alternarLojaAction}>
          <input type="hidden" name="aceitando" value={String(!config.aceitandoPedidos)} />
          <button className="rounded-lg p-2 text-stone-600 hover:bg-stone-100" aria-label={config.aceitandoPedidos ? "Pausar pedidos" : "Retomar pedidos"}>
            {config.aceitandoPedidos ? <Pause className="size-5" /> : <Play className="size-5" />}
          </button>
        </form>
      </header>

      <div className="pb-20 md:pb-0">{children}</div>
      <MenuInferior />
    </div>
    </ProvedorAtendimento>
  );
}
