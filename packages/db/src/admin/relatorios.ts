import { paraCentavos } from "@pizzaria/shared";
import { exigir, type Db } from "../client";

export interface VendaDiaria {
  dia: string;
  pedidos: number;
  cancelados: number;
  faturamentoCentavos: number;
  taxasEntregaCentavos: number;
  entregas: number;
  retiradas: number;
}

export interface ProdutoVendido {
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  faturamentoCentavos: number;
}

/** Relatórios do painel (views com security_invoker: respeitam o RLS do admin). */
export async function relatorioPeriodo(db: Db, de: string, ate: string) {
  const [vendas, produtos] = await Promise.all([
    db.from("relatorio_vendas_diarias").select("*").gte("dia", de).lte("dia", ate).order("dia"),
    db.from("relatorio_produtos_vendidos").select("*").gte("dia", de).lte("dia", ate),
  ]);

  const dias: VendaDiaria[] = exigir(vendas, "Erro ao carregar vendas").map((v) => ({
    dia: v.dia!,
    pedidos: v.pedidos ?? 0,
    cancelados: v.cancelados ?? 0,
    faturamentoCentavos: paraCentavos(v.faturamento ?? 0),
    taxasEntregaCentavos: paraCentavos(v.taxas_entrega ?? 0),
    entregas: v.entregas ?? 0,
    retiradas: v.retiradas ?? 0,
  }));

  const porProduto = new Map<string, ProdutoVendido>();
  for (const p of exigir(produtos, "Erro ao carregar produtos vendidos")) {
    const atual = porProduto.get(p.produto_id!) ?? {
      produtoId: p.produto_id!,
      produtoNome: p.produto_nome!,
      quantidade: 0,
      faturamentoCentavos: 0,
    };
    atual.quantidade += Number(p.quantidade ?? 0);
    atual.faturamentoCentavos += paraCentavos(p.faturamento ?? 0);
    porProduto.set(atual.produtoId, atual);
  }

  const totais = dias.reduce(
    (t, d) => ({
      pedidos: t.pedidos + d.pedidos,
      cancelados: t.cancelados + d.cancelados,
      faturamentoCentavos: t.faturamentoCentavos + d.faturamentoCentavos,
      entregas: t.entregas + d.entregas,
      retiradas: t.retiradas + d.retiradas,
    }),
    { pedidos: 0, cancelados: 0, faturamentoCentavos: 0, entregas: 0, retiradas: 0 }
  );

  return {
    dias,
    totais: {
      ...totais,
      ticketMedioCentavos: totais.pedidos ? Math.round(totais.faturamentoCentavos / totais.pedidos) : 0,
    },
    produtos: [...porProduto.values()].sort((a, b) => b.quantidade - a.quantidade),
  };
}
