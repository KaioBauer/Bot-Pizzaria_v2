import { LogOut, Pause, Play } from "lucide-react";
import { proximaAbertura, situacaoLoja } from "@pizzaria/core";
import { contarPrecisaAtencao, criarRepositorios } from "@pizzaria/db";
import { AvisoAtendimento, ProvedorAtendimento } from "../../../components/painel/atendimento";
import { ProvedorAvisos } from "../../../components/painel/avisos";
import { ProvedorComandos } from "../../../components/painel/comandos";
import { BotaoBusca, MenuInferior, MenuLateral, TransicaoPagina } from "../../../components/painel/navegacao";
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
    ? { rotulo: "Aberto", detalhe: "Recebendo pedidos", ponto: "bg-emerald-500", pulsar: true }
    : situacao.motivo === "pausada"
      ? { rotulo: "Pausado", detalhe: "Bot não aceita pedidos", ponto: "bg-amber-500", pulsar: false }
      : { rotulo: "Fechado", detalhe: abre ? `Abre ${abre}` : "Fora do horário", ponto: "bg-zinc-400", pulsar: false };

  const ponto = (
    <span className="relative flex size-2 shrink-0">
      {estado.pulsar && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", estado.ponto)} />}
      <span className={cn("relative inline-flex size-2 rounded-full", estado.ponto)} />
    </span>
  );

  return (
    <ProvedorAtendimento inicial={pendentesAtendimento}>
    <ProvedorAvisos>
    <ProvedorComandos aceitandoPedidos={config.aceitandoPedidos} alternarLoja={alternarLojaAction}>
    <AvisoAtendimento />
    <div className="min-h-dvh md:pl-16 lg:pl-60">
      {/* Barra lateral (tablet e desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-zinc-200/70 bg-zinc-50/80 px-2.5 py-3 backdrop-blur-xl md:flex lg:w-60 lg:px-3">
        <div className="mb-4 flex h-10 items-center gap-2.5 px-1 md:justify-center lg:justify-start">
          <Logo className="size-7 shrink-0 rounded-lg" />
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-[13.5px] leading-tight font-semibold tracking-tight">Vianna Pizzaria</p>
            <p className="text-[11.5px] text-zinc-500">Painel</p>
          </div>
        </div>

        <div className="mb-3">
          <BotaoBusca />
        </div>

        <MenuLateral />

        <div className="mt-auto space-y-2">
          <div className="rounded-xl bg-white p-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-zinc-200/80">
            <div className="flex items-center gap-2 md:justify-center lg:justify-start" title={`${estado.rotulo} · ${estado.detalhe}`}>
              {ponto}
              <div className="hidden min-w-0 lg:block">
                <p className="text-[13px] leading-tight font-medium">{estado.rotulo}</p>
                <p className="truncate text-[11.5px] text-zinc-500">{estado.detalhe}</p>
              </div>
            </div>
            <form action={alternarLojaAction} className="mt-2.5">
              <input type="hidden" name="aceitando" value={String(!config.aceitandoPedidos)} />
              <button
                className={cn(
                  "flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-medium transition active:scale-[0.98]",
                  config.aceitandoPedidos ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200/70" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}
                title={config.aceitandoPedidos ? "O bot para de aceitar pedidos até você retomar" : "Volta a aceitar pedidos (dentro do horário)"}
              >
                {config.aceitandoPedidos ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                <span className="md:hidden lg:inline">{config.aceitandoPedidos ? "Pausar pedidos" : "Retomar pedidos"}</span>
              </button>
            </form>
          </div>

          <form action={sairAction} className="flex items-center gap-2 rounded-lg px-1 py-1 md:justify-center lg:justify-between">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-[11px] font-semibold text-white uppercase md:hidden lg:flex">
                {(email ?? "?").slice(0, 1)}
              </span>
              <span className="hidden truncate text-[12px] text-zinc-500 lg:block" title={email ?? undefined}>
                {email}
              </span>
            </span>
            <button className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-700" title="Sair" aria-label="Sair">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-zinc-200/70 bg-white/80 px-4 backdrop-blur-xl md:hidden">
        <Logo className="size-7 rounded-lg" />
        <span className="text-[15px] font-semibold tracking-tight">Vianna</span>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] font-medium text-zinc-700">
          {ponto}
          {estado.rotulo}
        </span>
        <form action={alternarLojaAction}>
          <input type="hidden" name="aceitando" value={String(!config.aceitandoPedidos)} />
          <button className="rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-100" aria-label={config.aceitandoPedidos ? "Pausar pedidos" : "Retomar pedidos"}>
            {config.aceitandoPedidos ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
        </form>
      </header>

      <div className="pb-20 md:pb-0">
        <TransicaoPagina>{children}</TransicaoPagina>
      </div>
      <MenuInferior />
    </div>
    </ProvedorComandos>
    </ProvedorAvisos>
    </ProvedorAtendimento>
  );
}
