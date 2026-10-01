import type { Metadata } from "next";
import Link from "next/link";
import { Ban, ChartColumn, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import { relatorioPeriodo } from "@pizzaria/db";
import { formatarReais } from "@pizzaria/shared";
import { CabecalhoCartao, CabecalhoPagina, Cartao, cn, Vazio } from "../../../../components/ui";
import { exigirAdmin } from "../../../../lib/auth";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

const FUSO = "America/Sao_Paulo";
const PERIODOS = { hoje: "Hoje", "7d": "7 dias", "30d": "30 dias", mes: "Este mês" } as const;
type Periodo = keyof typeof PERIODOS;

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

function Indicador({ titulo, valor, detalhe, Icone, destaque }: { titulo: string; valor: string; detalhe?: string; Icone: typeof Receipt; destaque?: boolean }) {
  return (
    <div className={cn("rounded-2xl p-5", destaque ? "bg-stone-950 text-white shadow-elevada" : "bg-white shadow-suave ring-1 ring-stone-900/5")}>
      <div className="flex items-center justify-between">
        <p className={cn("text-sm font-medium", destaque ? "text-stone-400" : "text-stone-500")}>{titulo}</p>
        <span className={cn("flex size-9 items-center justify-center rounded-xl", destaque ? "bg-white/10 text-marca-300" : "bg-marca-50 text-marca-600")}>
          <Icone className="size-4.5" />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight tabular">{valor}</p>
      {detalhe && <p className={cn("mt-1 text-sm", destaque ? "text-stone-400" : "text-stone-500")}>{detalhe}</p>}
    </div>
  );
}

export default async function RelatoriosPage({ searchParams }: PageProps<"/admin/relatorios">) {
  const { supabase } = await exigirAdmin();
  const { periodo: bruto } = await searchParams;
  const periodo: Periodo = typeof bruto === "string" && bruto in PERIODOS ? (bruto as Periodo) : "7d";
  const { de, ate } = intervalo(periodo);
  const { dias, totais, produtos } = await relatorioPeriodo(supabase, de, ate);

  const porDia = new Map(dias.map((d) => [d.dia, d]));
  const serie = diasDoIntervalo(de, ate).map((dia) => ({ dia, valor: porDia.get(dia)?.faturamentoCentavos ?? 0, pedidos: porDia.get(dia)?.pedidos ?? 0 }));
  const maximo = Math.max(...serie.map((s) => s.valor), 0);
  const maisVendidos = produtos.slice(0, 8);
  const maiorQuantidade = Math.max(1, ...maisVendidos.map((p) => p.quantidade));
  const fmtQtd = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(1).replace(".", ","));
  const poucosDias = serie.length <= 10;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <CabecalhoPagina
        titulo="Relatórios"
        descricao={`${rotuloDia(de)} a ${rotuloDia(ate)}`}
        acoes={
          <nav className="flex rounded-xl bg-white p-1 shadow-suave ring-1 ring-stone-900/5" aria-label="Período">
            {Object.entries(PERIODOS).map(([id, rotulo]) => (
              <Link
                key={id}
                href={`/admin/relatorios?periodo=${id}`}
                aria-current={id === periodo ? "page" : undefined}
                className={cn("rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors", id === periodo ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-900")}
              >
                {rotulo}
              </Link>
            ))}
          </nav>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo do período">
        <Indicador destaque titulo="Faturamento" valor={formatarReais(totais.faturamentoCentavos)} Icone={TrendingUp} />
        <Indicador titulo="Pedidos" valor={String(totais.pedidos)} detalhe={`${totais.entregas} entregas · ${totais.retiradas} retiradas`} Icone={ShoppingBag} />
        <Indicador titulo="Ticket médio" valor={formatarReais(totais.ticketMedioCentavos)} Icone={Receipt} />
        <Indicador titulo="Cancelados" valor={String(totais.cancelados)} Icone={Ban} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Cartao>
          <CabecalhoCartao titulo="Faturamento por dia" descricao={maximo ? `Melhor dia: ${formatarReais(maximo)}` : "Sem vendas no período"} />
          {periodo === "hoje" ? (
            <Vazio icone={<ChartColumn className="size-6" />} titulo="Escolha 7 dias ou mais para ver a evolução" />
          ) : (
            <div className="px-5 pt-6 pb-4 sm:px-6">
              <div className="relative h-56">
                {[0.25, 0.5, 0.75].map((f) => (
                  <div key={f} className="absolute inset-x-0 border-t border-dashed border-stone-200" style={{ bottom: `${f * 100}%` }} />
                ))}
                <div className="relative flex h-full items-end gap-[2px] border-b border-stone-300" role="img" aria-label="Faturamento por dia; valores na tabela abaixo">
                  {serie.map((s) => (
                    <div key={s.dia} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center outline-none" aria-label={`${rotuloDia(s.dia)}: ${formatarReais(s.valor)}, ${s.pedidos} pedidos`}>
                      <div
                        className="w-full max-w-9 rounded-t-[4px] bg-marca-500 transition-colors group-hover:bg-marca-700 group-focus:bg-marca-700"
                        style={{ height: maximo ? `${(s.valor / maximo) * 100}%` : 0, minHeight: s.valor ? 3 : 0 }}
                      />
                      <div className="pointer-events-none absolute bottom-full z-10 mb-2 hidden rounded-xl bg-stone-900 px-3 py-2 text-xs whitespace-nowrap text-white shadow-elevada group-hover:block group-focus:block">
                        <p className="font-semibold">{diaSemana(s.dia)}, {rotuloDia(s.dia)}</p>
                        <p className="tabular">{formatarReais(s.valor)} · {s.pedidos} pedido(s)</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex justify-between text-xs text-stone-400 tabular">
                {poucosDias ? serie.map((s) => <span key={s.dia} className="flex-1 text-center">{rotuloDia(s.dia)}</span>) : (
                  <>
                    <span>{rotuloDia(serie[0]?.dia ?? de)}</span>
                    <span>{rotuloDia(serie.at(-1)?.dia ?? ate)}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </Cartao>

        <Cartao>
          <CabecalhoCartao titulo="Mais vendidos" descricao="Meio a meio conta meia pizza para cada sabor." />
          {maisVendidos.length === 0 ? (
            <Vazio icone={<ShoppingBag className="size-6" />} titulo="Nenhuma venda no período" />
          ) : (
            <ol className="space-y-4 p-5 sm:p-6">
              {maisVendidos.map((p, i) => (
                <li key={p.produtoId}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">
                      <span className="mr-2 text-stone-400 tabular">{i + 1}</span>
                      {p.produtoNome}
                    </span>
                    <span className="shrink-0 text-stone-600 tabular">{fmtQtd(p.quantidade)} un · {formatarReais(p.faturamentoCentavos)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-marca-500" style={{ width: `${(p.quantidade / maiorQuantidade) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Cartao>
      </div>

      <Cartao className="overflow-hidden">
        <CabecalhoCartao titulo="Detalhe por dia" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs tracking-wide text-stone-500 uppercase">
              <tr>
                <th className="px-6 py-3 font-semibold">Dia</th>
                <th className="px-4 py-3 text-right font-semibold">Pedidos</th>
                <th className="px-4 py-3 text-right font-semibold">Entregas</th>
                <th className="px-4 py-3 text-right font-semibold">Retiradas</th>
                <th className="px-4 py-3 text-right font-semibold">Cancelados</th>
                <th className="px-4 py-3 text-right font-semibold">Taxas</th>
                <th className="px-6 py-3 text-right font-semibold">Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular">
              {dias.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-stone-500">Nenhum pedido no período.</td></tr>
              )}
              {[...dias].reverse().map((d) => (
                <tr key={d.dia} className="hover:bg-stone-50/60">
                  <td className="px-6 py-3"><span className="font-medium">{rotuloDia(d.dia)}</span> <span className="text-stone-400 capitalize">{diaSemana(d.dia)}</span></td>
                  <td className="px-4 py-3 text-right">{d.pedidos}</td>
                  <td className="px-4 py-3 text-right">{d.entregas}</td>
                  <td className="px-4 py-3 text-right">{d.retiradas}</td>
                  <td className="px-4 py-3 text-right">{d.cancelados}</td>
                  <td className="px-4 py-3 text-right">{formatarReais(d.taxasEntregaCentavos)}</td>
                  <td className="px-6 py-3 text-right font-semibold">{formatarReais(d.faturamentoCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </main>
  );
}
