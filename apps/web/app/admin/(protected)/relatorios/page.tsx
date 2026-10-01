import type { Metadata } from "next";
import Link from "next/link";
import { relatorioPeriodo } from "@pizzaria/db";
import { formatarReais } from "@pizzaria/shared";
import { exigirAdmin } from "../../../../lib/auth";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

const FUSO = "America/Sao_Paulo";
const PERIODOS = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  mes: "Este mês",
} as const;
type Periodo = keyof typeof PERIODOS;

/** "aaaa-mm-dd" no fuso da loja. */
function diaLocal(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
}

function intervalo(periodo: Periodo): { de: string; ate: string } {
  const agora = new Date();
  const ate = diaLocal(agora);
  if (periodo === "hoje") return { de: ate, ate };
  if (periodo === "mes") return { de: `${ate.slice(0, 8)}01`, ate };
  const dias = periodo === "7d" ? 6 : 29;
  return { de: diaLocal(new Date(agora.getTime() - dias * 86_400_000)), ate };
}

/** Todos os dias do intervalo, inclusive os sem venda (barras zeradas, não buracos). */
function diasDoIntervalo(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = new Date(`${de}T12:00:00Z`); diaLocal(d) <= ate; d = new Date(d.getTime() + 86_400_000)) dias.push(diaLocal(d));
  return dias;
}

const rotuloDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <p className="text-sm font-medium text-stone-500">{titulo}</p>
      <p className="mt-1 text-2xl font-black tabular-nums sm:text-3xl">{valor}</p>
      {detalhe && <p className="mt-0.5 text-sm text-stone-500">{detalhe}</p>}
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
  const maximo = Math.max(1, ...serie.map((s) => s.valor));
  const maisVendidos = produtos.slice(0, 10);
  const maiorQuantidade = Math.max(1, ...maisVendidos.map((p) => p.quantidade));
  const fmtQtd = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(1).replace(".", ","));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Relatórios</h1>
        <nav className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-stone-200" aria-label="Período">
          {Object.entries(PERIODOS).map(([id, rotulo]) => (
            <Link
              key={id}
              href={`/admin/relatorios?periodo=${id}`}
              aria-current={id === periodo ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${id === periodo ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
            >
              {rotulo}
            </Link>
          ))}
        </nav>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do período">
        <Indicador titulo="Faturamento" valor={formatarReais(totais.faturamentoCentavos)} />
        <Indicador titulo="Pedidos" valor={String(totais.pedidos)} detalhe={`${totais.entregas} entregas · ${totais.retiradas} retiradas`} />
        <Indicador titulo="Ticket médio" valor={formatarReais(totais.ticketMedioCentavos)} />
        <Indicador titulo="Cancelados" valor={String(totais.cancelados)} />
      </section>

      {periodo !== "hoje" && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="font-bold">Faturamento por dia</h2>
          <p className="text-sm text-stone-500">Maior dia: {formatarReais(maximo === 1 ? 0 : maximo)}</p>
          <div className="mt-4 flex h-48 items-end gap-0.5 border-b border-stone-200" role="img" aria-label="Gráfico de faturamento por dia; valores na tabela abaixo">
            {serie.map((s) => (
              <div key={s.dia} className="group relative flex h-full flex-1 items-end justify-center" tabIndex={0} aria-label={`${rotuloDia(s.dia)}: ${formatarReais(s.valor)}, ${s.pedidos} pedidos`}>
                <div className="w-full max-w-10 rounded-t bg-marca-600 group-hover:bg-marca-700 group-focus:bg-marca-700" style={{ height: `${(s.valor / maximo) * 100}%`, minHeight: s.valor ? 2 : 0 }} />
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-stone-900 px-2 py-1 text-xs text-white shadow group-hover:block group-focus:block">
                  {rotuloDia(s.dia)} · {formatarReais(s.valor)} · {s.pedidos} pedidos
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-stone-500">
            <span>{rotuloDia(serie[0]?.dia ?? de)}</span>
            <span>{rotuloDia(serie.at(-1)?.dia ?? ate)}</span>
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="font-bold">Mais vendidos</h2>
        <p className="text-sm text-stone-500">Pizzas meio a meio contam meia para cada sabor.</p>
        {maisVendidos.length === 0 ? (
          <p className="py-6 text-center text-stone-500">Nenhuma venda no período.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {maisVendidos.map((p, i) => (
              <li key={p.produtoId} className="grid grid-cols-[1.5rem_minmax(0,10rem)_1fr_auto] items-center gap-2 text-sm">
                <span className="text-stone-400 tabular-nums">{i + 1}</span>
                <span className="truncate font-medium">{p.produtoNome}</span>
                <span className="h-3 rounded-r bg-stone-100" title={`${fmtQtd(p.quantidade)} vendidos · ${formatarReais(p.faturamentoCentavos)}`}>
                  <span className="block h-full rounded-r bg-marca-600" style={{ width: `${(p.quantidade / maiorQuantidade) * 100}%` }} />
                </span>
                <span className="w-28 text-right tabular-nums text-stone-700">
                  {fmtQtd(p.quantidade)} · {formatarReais(p.faturamentoCentavos)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white ring-1 ring-stone-200">
        <table className="w-full text-sm">
          <caption className="p-4 text-left font-bold">Detalhe por dia</caption>
          <thead className="border-y border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-2 font-medium">Dia</th>
              <th className="px-4 py-2 text-right font-medium">Pedidos</th>
              <th className="px-4 py-2 text-right font-medium">Entregas</th>
              <th className="px-4 py-2 text-right font-medium">Retiradas</th>
              <th className="px-4 py-2 text-right font-medium">Cancelados</th>
              <th className="px-4 py-2 text-right font-medium">Taxas</th>
              <th className="px-4 py-2 text-right font-medium">Faturamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 tabular-nums">
            {dias.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-stone-500">Nenhum pedido no período.</td>
              </tr>
            )}
            {[...dias].reverse().map((d) => (
              <tr key={d.dia}>
                <td className="px-4 py-2">{rotuloDia(d.dia)}</td>
                <td className="px-4 py-2 text-right">{d.pedidos}</td>
                <td className="px-4 py-2 text-right">{d.entregas}</td>
                <td className="px-4 py-2 text-right">{d.retiradas}</td>
                <td className="px-4 py-2 text-right">{d.cancelados}</td>
                <td className="px-4 py-2 text-right">{formatarReais(d.taxasEntregaCentavos)}</td>
                <td className="px-4 py-2 text-right font-semibold">{formatarReais(d.faturamentoCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
