import { paraCentavos, type CanalPedido } from "@pizzaria/shared";
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

/**
 * Relatórios do painel (views com security_invoker: respeitam o RLS do admin).
 * As views agrupam por dia + canal; sem `canal`, os canais do mesmo dia são somados.
 */
export async function relatorioPeriodo(db: Db, de: string, ate: string, canal?: CanalPedido) {
  let consultaVendas = db.from("relatorio_vendas_diarias").select("*").gte("dia", de).lte("dia", ate);
  let consultaProdutos = db.from("relatorio_produtos_vendidos").select("*").gte("dia", de).lte("dia", ate);
  if (canal) {
    consultaVendas = consultaVendas.eq("canal", canal);
    consultaProdutos = consultaProdutos.eq("canal", canal);
  }
  const [vendas, produtos] = await Promise.all([consultaVendas, consultaProdutos]);

  const porDia = new Map<string, VendaDiaria>();
  for (const v of exigir(vendas, "Erro ao carregar vendas")) {
    const atual = porDia.get(v.dia!) ?? {
      dia: v.dia!,
      pedidos: 0,
      cancelados: 0,
      faturamentoCentavos: 0,
      taxasEntregaCentavos: 0,
      entregas: 0,
      retiradas: 0,
    };
    atual.pedidos += v.pedidos ?? 0;
    atual.cancelados += v.cancelados ?? 0;
    atual.faturamentoCentavos += paraCentavos(v.faturamento ?? 0);
    atual.taxasEntregaCentavos += paraCentavos(v.taxas_entrega ?? 0);
    atual.entregas += v.entregas ?? 0;
    atual.retiradas += v.retiradas ?? 0;
    porDia.set(atual.dia, atual);
  }
  const dias = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));

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
