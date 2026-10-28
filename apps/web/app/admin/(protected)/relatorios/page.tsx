import type { Metadata } from "next";
import { Ban, ChartColumn, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import { relatorioPeriodo } from "@pizzaria/db";
import { formatarReais, type CanalPedido } from "@pizzaria/shared";
import { CabecalhoCartao, CabecalhoPagina, Cartao, cn, Vazio } from "../../../../components/ui";
import { exigirAdmin } from "../../../../lib/auth";
import { ControleSegmentado, NumeroAnimado } from "./interativo";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

const FUSO = "America/Sao_Paulo";
const PERIODOS = { hoje: "Hoje", "7d": "7 dias", "30d": "30 dias", mes: "Este mês" } as const;
type Periodo = keyof typeof PERIODOS;
const CANAIS = { todos: "Todos", whatsapp: "WhatsApp", link: "Link" } as const satisfies Record<"todos" | CanalPedido, string>;
type FiltroCanal = keyof typeof CANAIS;

/** Monta a URL mantendo o outro filtro (período ou canal). */
function urlRelatorio(periodo: Periodo, canal: FiltroCanal): string {
  const busca = new URLSearchParams({ periodo });
  if (canal !== "todos") busca.set("canal", canal);
  return `/admin/relatorios?${busca}`;
}

function diaLocal(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
}

function intervalo(periodo: Periodo): { de: string; ate: string } {
  const agora = new Date();
  const ate = diaLocal(agora);
  if (periodo === "hoje") return { de: ate, ate };
  if (periodo === "mes") return { de: `${ate.slice(0, 8)}01`, ate };
  return { de: diaLocal(new Date(agora.getTime() - (periodo === "7d" ? 6 : 29) * 86_400_000)), ate };
}

/** Todos os dias do intervalo, inclusive os sem venda (barra zerada, não buraco). */
function diasDoIntervalo(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = new Date(`${de}T12:00:00Z`); diaLocal(d) <= ate; d = new Date(d.getTime() + 86_400_000)) dias.push(diaLocal(d));
  return dias;
}

const rotuloDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const diaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");

/** Animações só de CSS (sem depender de JS para o conteúdo aparecer). */
const ESTILOS_ANIMACAO = `
@keyframes rel-barra { from { transform: scaleY(0); } }
@keyframes rel-progresso { from { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) { .rel-anima { animation: none !important; } }
`;

function Indicador({
  titulo,
  valor,
  formato,
  detalhe,
  Icone,
  destaque,
  ordem,
}: {
  titulo: string;
  valor: number;
  formato: "reais" | "inteiro";
  detalhe?: string;
  Icone: typeof Receipt;
  destaque?: boolean;
  ordem: number;
}) {
  return (
    <div
      className="group rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-zinc-200/80 transition-shadow duration-200 hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)] motion-safe:animate-[entrada_0.4s_ease-out_both]"
      style={{ animationDelay: `${ordem * 50}ms` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-zinc-500">{titulo}</p>
        <Icone className={cn("size-4 transition-colors", destaque ? "text-marca-500" : "text-zinc-400 group-hover:text-zinc-600")} aria-hidden />
      </div>
      <NumeroAnimado valor={valor} formato={formato} className="mt-3 block text-[28px] leading-none font-semibold tracking-tight text-zinc-900" />
      <p className="mt-2 h-4 text-[12.5px] text-zinc-500">{detalhe}</p>
    </div>
  );
}

export default async function RelatoriosPage({ searchParams }: PageProps<"/admin/relatorios">) {
  const { supabase } = await exigirAdmin();
  const { periodo: bruto, canal: canalBruto } = await searchParams;
  const periodo: Periodo = typeof bruto === "string" && bruto in PERIODOS ? (bruto as Periodo) : "7d";
  const canal: FiltroCanal = typeof canalBruto === "string" && canalBruto in CANAIS ? (canalBruto as FiltroCanal) : "todos";
  const { de, ate } = intervalo(periodo);
  const { dias, totais, produtos } = await relatorioPeriodo(supabase, de, ate, canal === "todos" ? undefined : canal);

  const porDia = new Map(dias.map((d) => [d.dia, d]));
  const serie = diasDoIntervalo(de, ate).map((dia) => ({ dia, valor: porDia.get(dia)?.faturamentoCentavos ?? 0, pedidos: porDia.get(dia)?.pedidos ?? 0 }));
  const maximo = Math.max(...serie.map((s) => s.valor), 0);
  const maisVendidos = produtos.slice(0, 8);
  const maiorQuantidade = Math.max(1, ...maisVendidos.map((p) => p.quantidade));
  const fmtQtd = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(1).replace(".", ","));
  const poucosDias = serie.length <= 10;
  const maiorDia = maximo > 0 ? serie.find((s) => s.valor === maximo)?.dia : undefined;
  const opcoes = <T extends string>(mapa: Record<T, string>, href: (id: T) => string) =>
    (Object.entries(mapa) as Array<[T, string]>).map(([id, texto]) => ({ id, texto, href: href(id) }));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <style>{ESTILOS_ANIMACAO}</style>
      <CabecalhoPagina
        titulo="Relatórios"
        descricao={
          <>
            <span className="tabular">
              {rotuloDia(de)} a {rotuloDia(ate)}
            </span>
            {canal === "todos" ? "" : ` · pedidos pelo ${CANAIS[canal]}`}
          </>
        }
        acoes={
          <>
            <ControleSegmentado id="canal" rotulo="Canal" opcoes={opcoes(CANAIS, (id) => urlRelatorio(periodo, id))} atual={canal} />
            <ControleSegmentado id="periodo" rotulo="Período" opcoes={opcoes(PERIODOS, (id) => urlRelatorio(id, canal))} atual={periodo} />
          </>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo do período">
        <Indicador ordem={0} destaque titulo="Faturamento" valor={totais.faturamentoCentavos} formato="reais" Icone={TrendingUp} />
        <Indicador ordem={1} titulo="Pedidos" valor={totais.pedidos} formato="inteiro" detalhe={`${totais.entregas} entregas · ${totais.retiradas} retiradas`} Icone={ShoppingBag} />
        <Indicador ordem={2} titulo="Ticket médio" valor={totais.ticketMedioCentavos} formato="reais" Icone={Receipt} />
        <Indicador ordem={3} titulo="Cancelados" valor={totais.cancelados} formato="inteiro" Icone={Ban} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Cartao className="motion-safe:animate-[entrada_0.45s_ease-out_both] [animation-delay:120ms]">
          <CabecalhoCartao
            titulo="Faturamento por dia"
            descricao={
              maximo ? (
                <>
                  Melhor dia: <span className="text-zinc-900 tabular">{formatarReais(maximo)}</span>
                </>
              ) : (
                "Sem vendas no período"
              )
            }
          />
          {periodo === "hoje" ? (
            <Vazio icone={<ChartColumn className="size-5" />} titulo="Escolha 7 dias ou mais para ver a evolução" descricao="O gráfico compara o faturamento dia a dia." />
          ) : (
            <div className="px-5 pt-6 pb-4 sm:px-6">
              <div className="relative h-56">
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <div key={f} className="absolute inset-x-0 border-t border-zinc-100" style={{ bottom: `${f * 100}%` }} />
                ))}
                <div className="relative flex h-full items-end gap-[3px] border-b border-zinc-200" role="img" aria-label="Faturamento por dia; valores na tabela abaixo">
                  {serie.map((s, i) => {
                    const pico = s.dia === maiorDia;
                    return (
                      <div
                        key={s.dia}
                        tabIndex={0}
                        className="group relative flex h-full flex-1 items-end justify-center rounded-t-md outline-none hover:bg-zinc-50 focus-visible:bg-zinc-100/70"
                        aria-label={`${rotuloDia(s.dia)}: ${formatarReais(s.valor)}, ${s.pedidos} pedidos`}
                      >
                        <div
                          className={cn(
                            "rel-anima w-full max-w-8 origin-bottom rounded-t-[5px] rounded-b-[1px] transition-colors duration-150",
                            pico ? "bg-marca-500 group-hover:bg-marca-600" : "bg-zinc-300 group-hover:bg-zinc-500 group-focus-visible:bg-zinc-500"
                          )}
                          style={{
                            height: maximo ? `${(s.valor / maximo) * 100}%` : 0,
                            minHeight: s.valor ? 3 : 0,
                            animation: `rel-barra 0.6s cubic-bezier(0.22,1,0.36,1) ${Math.min(i * 18, 500)}ms both`,
                          }}
                        />
                        <div className="pointer-events-none absolute bottom-full z-10 mb-2 translate-y-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[12px] whitespace-nowrap text-white opacity-0 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)] transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                          <p className="text-zinc-400 capitalize">
                            {diaSemana(s.dia)}, <span className="tabular">{rotuloDia(s.dia)}</span>
                          </p>
                          <p className="font-medium tabular">{formatarReais(s.valor)}</p>
                          <p className="text-zinc-400">
                            <span className="tabular">{s.pedidos}</span> pedido(s)
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 flex justify-between text-[11.5px] text-zinc-400 tabular">
                {poucosDias ? (
                  serie.map((s) => (
                    <span key={s.dia} className="flex-1 text-center">
                      {rotuloDia(s.dia)}
                    </span>
                  ))
                ) : (
                  <>
                    <span>{rotuloDia(serie[0]?.dia ?? de)}</span>
                    <span>{rotuloDia(serie.at(-1)?.dia ?? ate)}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </Cartao>

        <Cartao className="motion-safe:animate-[entrada_0.45s_ease-out_both] [animation-delay:180ms]">
          <CabecalhoCartao titulo="Mais vendidos" descricao="Meio a meio conta meia pizza para cada sabor." />
          {maisVendidos.length === 0 ? (
            <Vazio icone={<ShoppingBag className="size-5" />} titulo="Nenhuma venda no período" />
          ) : (
            <ol className="space-y-3.5 p-5 sm:px-6">
              {maisVendidos.map((p, i) => (
                <li key={p.produtoId}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="w-4 shrink-0 text-[12px] text-zinc-400 tabular">{i + 1}</span>
                      <span className="truncate font-medium text-zinc-900">{p.produtoNome}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] text-zinc-500 tabular">
                      {fmtQtd(p.quantidade)} un · <span className="text-zinc-800">{formatarReais(p.faturamentoCentavos)}</span>
                    </span>
                  </div>
                  <div className="ml-6 h-1 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={cn("rel-anima h-full origin-left rounded-full", i === 0 ? "bg-marca-500" : "bg-zinc-800")}
                      style={{ width: `${(p.quantidade / maiorQuantidade) * 100}%`, animation: `rel-progresso 0.7s cubic-bezier(0.22,1,0.36,1) ${200 + i * 40}ms both` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Cartao>
      </div>

      <Cartao className="overflow-hidden motion-safe:animate-[entrada_0.45s_ease-out_both] [animation-delay:240ms]">
        <CabecalhoCartao titulo="Detalhe por dia" />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-zinc-100 text-left text-[12px] text-zinc-500">
              <tr>
                <th className="px-6 py-2.5 font-medium">Dia</th>
                <th className="px-4 py-2.5 text-right font-medium">Pedidos</th>
                <th className="px-4 py-2.5 text-right font-medium">Entregas</th>
                <th className="px-4 py-2.5 text-right font-medium">Retiradas</th>
                <th className="px-4 py-2.5 text-right font-medium">Cancelados</th>
                <th className="px-4 py-2.5 text-right font-medium">Taxas</th>
                <th className="px-6 py-2.5 text-right font-medium">Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-700">
              {dias.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-zinc-500">
                    Nenhum pedido no período.
                  </td>
                </tr>
              )}
              {[...dias].reverse().map((d) => (
                <tr key={d.dia} className="transition-colors hover:bg-zinc-50/80">
                  <td className="px-6 py-2.5">
                    <span className="font-medium text-zinc-900 tabular">{rotuloDia(d.dia)}</span> <span className="text-zinc-400 capitalize">{diaSemana(d.dia)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{d.pedidos}</td>
                  <td className="px-4 py-2.5 text-right tabular">{d.entregas}</td>
                  <td className="px-4 py-2.5 text-right tabular">{d.retiradas}</td>
                  <td className="px-4 py-2.5 text-right tabular">{d.cancelados}</td>
                  <td className="px-4 py-2.5 text-right tabular">{formatarReais(d.taxasEntregaCentavos)}</td>
                  <td className="px-6 py-2.5 text-right font-medium text-zinc-900 tabular">{formatarReais(d.faturamentoCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </main>
  );
}
