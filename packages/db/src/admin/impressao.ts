import { paraCentavos, type StatusPedido, type TipoEntrega } from "@pizzaria/shared";
import { ErroBanco, exigir, type Db } from "../client";

/**
 * Fila de impressão no painel (sessão do admin, RLS). A fila é a MESMA que o
 * print-agent usa (`buscarFilaDeImpressao`): não impressos fora de
 * aguardando_pagamento/cancelado, mais as reimpressões pedidas.
 */

export interface ItemImpressao {
  id: string;
  numero: number;
  clienteNome: string;
  status: StatusPedido;
  tipoEntrega: TipoEntrega;
  totalCentavos: number;
  criadoEm: string;
  impressoEm: string | null;
  /** Pedido de reimpressão em aberto (o cupom sai com "REIMPRESSAO"). */
  reimpressaoSolicitadaEm: string | null;
  /** O agente pegou o pedido para imprimir (pode já estar saindo no papel). */
  imprimindoDesde: string | null;
}

const CAMPOS =
  "id, numero, cliente_nome, status, tipo_entrega, valor_total, created_at, impresso_em, reimpressao_solicitada_em, impressao_reivindicada_em";

type Linha = {
  id: string;
  numero: number;
  cliente_nome: string;
  status: string;
  tipo_entrega: string;
  valor_total: number;
  created_at: string;
  impresso_em: string | null;
  reimpressao_solicitada_em: string | null;
  impressao_reivindicada_em: string | null;
};

const paraItem = (l: Linha): ItemImpressao => ({
  id: l.id,
  numero: l.numero,
  clienteNome: l.cliente_nome,
  status: l.status as StatusPedido,
  tipoEntrega: l.tipo_entrega as TipoEntrega,
  totalCentavos: paraCentavos(l.valor_total),
  criadoEm: l.created_at,
  impressoEm: l.impresso_em,
  reimpressaoSolicitadaEm: l.reimpressao_solicitada_em,
  imprimindoDesde: l.impressao_reivindicada_em,
});

export const FILTRO_FILA_IMPRESSAO =
  "and(impresso_em.is.null,status.not.in.(aguardando_pagamento,cancelado)),reimpressao_solicitada_em.not.is.null";

/** Na ordem em que o agente imprime (mais antigo primeiro). */
export async function listarFilaImpressao(db: Db): Promise<ItemImpressao[]> {
  const linhas = exigir(
    await db.from("pedidos").select(CAMPOS).or(FILTRO_FILA_IMPRESSAO).order("created_at").limit(200),
    "Erro ao listar a fila de impressão"
  );
  return (linhas as Linha[]).map(paraItem);
}

export async function listarImpressosRecentes(db: Db, desde: Date): Promise<ItemImpressao[]> {
  const linhas = exigir(
    await db
      .from("pedidos")
      .select(CAMPOS)
      .gte("impresso_em", desde.toISOString())
      .is("reimpressao_solicitada_em", null)
      .order("impresso_em", { ascending: false })
      .limit(30),
    "Erro ao listar impressões recentes"
  );
  return (linhas as Linha[]).map(paraItem);
}

/**
 * Tira o pedido da fila SEM imprimir: marca como impresso pela mesma função do
 * agente (que também atende o pedido de reimpressão em aberto).
 */
export async function tirarDaFilaImpressao(db: Db, item: Pick<ItemImpressao, "id" | "reimpressaoSolicitadaEm">): Promise<void> {
  // A função não devolve nada: só o erro importa (exigir trataria o null como falha).
  const { error } = await db.rpc("marcar_pedido_impresso", {
    p_pedido_id: item.id,
    ...(item.reimpressaoSolicitadaEm ? { p_reimpressao_atendida: item.reimpressaoSolicitadaEm } : {}),
  });
  if (error) throw new ErroBanco(`Erro ao tirar o pedido da fila: ${error.message}`, error.code);
}

export async function pedirReimpressao(db: Db, pedidoId: string): Promise<void> {
  exigir(
    await db.from("pedidos").update({ reimpressao_solicitada_em: new Date().toISOString() }).eq("id", pedidoId).select("id"),
    "Erro ao pedir reimpressão"
  );
}
