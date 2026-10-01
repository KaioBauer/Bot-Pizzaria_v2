import {
  paraCentavos,
  STATUS_PEDIDO,
  statusFinal,
  type FormaPagamento,
  type StatusPedido,
  type TipoEntrega,
} from "@pizzaria/shared";
import { exigir, type Db } from "../client";

/** Pedido como o painel exibe (valores em centavos). */
export interface PedidoPainel {
  id: string;
  numero: number;
  status: StatusPedido;
  tipoEntrega: TipoEntrega;
  formaPagamento: FormaPagamento;
  trocoParaCentavos: number | null;
  canal: string;
  clienteNome: string;
  clienteTelefone: string | null;
  enderecoTexto: string | null;
  subtotalCentavos: number;
  taxaEntregaCentavos: number;
  totalCentavos: number;
  observacoes: string | null;
  motivoCancelamento: string | null;
  criadoEm: string;
  atualizadoEm: string;
  impressoEm: string | null;
  reimpressaoSolicitadaEm: string | null;
  itens: Array<{
    id: string;
    quantidade: number;
    descricao: string;
    observacao: string | null;
    subtotalCentavos: number;
  }>;
}

const CAMPOS = `id, numero, status, tipo_entrega, forma_pagamento, troco_para, canal, cliente_nome,
  cliente_telefone, endereco_texto, subtotal, taxa_entrega, valor_total, observacoes,
  motivo_cancelamento, created_at, updated_at, impresso_em, reimpressao_solicitada_em,
  itens:itens_pedido(id, quantidade, descricao, observacoes, subtotal, created_at)`;

type Linha = Awaited<ReturnType<typeof consultaBase>>["data"] extends (infer L)[] | null ? L : never;
function consultaBase(db: Db) {
  return db.from("pedidos").select(CAMPOS);
}

function paraPainel(p: Linha): PedidoPainel {
  return {
    id: p.id,
    numero: p.numero,
    status: p.status as StatusPedido,
    tipoEntrega: p.tipo_entrega as TipoEntrega,
    formaPagamento: p.forma_pagamento as FormaPagamento,
    trocoParaCentavos: p.troco_para === null ? null : paraCentavos(p.troco_para),
    canal: p.canal,
    clienteNome: p.cliente_nome,
    clienteTelefone: p.cliente_telefone,
    enderecoTexto: p.endereco_texto,
    subtotalCentavos: paraCentavos(p.subtotal),
    taxaEntregaCentavos: paraCentavos(p.taxa_entrega),
    totalCentavos: paraCentavos(p.valor_total),
    observacoes: p.observacoes,
    motivoCancelamento: p.motivo_cancelamento,
    criadoEm: p.created_at,
    atualizadoEm: p.updated_at,
    impressoEm: p.impresso_em,
    reimpressaoSolicitadaEm: p.reimpressao_solicitada_em,
    itens: [...p.itens]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((i) => ({
        id: i.id,
        quantidade: i.quantidade,
        descricao: i.descricao,
        observacao: i.observacoes,
        subtotalCentavos: paraCentavos(i.subtotal),
      })),
  };
}

const EM_ABERTO = STATUS_PEDIDO.filter((s) => !statusFinal(s));

/** Pedidos do quadro: todos os em aberto (de qualquer dia) + os finalizados desde `desde`. */
export async function listarPedidosPainel(db: Db, desde: Date): Promise<PedidoPainel[]> {
  const linhas = exigir(
    await consultaBase(db)
      .or(`status.in.(${EM_ABERTO.join(",")}),created_at.gte.${desde.toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(300),
    "Erro ao listar pedidos"
  );
  return linhas.map(paraPainel);
}

export async function obterPedidoPainel(db: Db, pedidoId: string): Promise<PedidoPainel | null> {
  const resultado = await consultaBase(db).eq("id", pedidoId).maybeSingle();
  if (resultado.error) exigir(resultado, "Erro ao carregar pedido");
  return resultado.data ? paraPainel(resultado.data) : null;
}

export async function historicoStatusPedido(db: Db, pedidoId: string) {
  return exigir(
    await db
      .from("pedido_status_historico")
      .select("status_anterior, status_novo, created_at")
      .eq("pedido_id", pedidoId)
      .order("id"),
    "Erro ao carregar histórico"
  ).map((h) => ({
    de: h.status_anterior as StatusPedido | null,
    para: h.status_novo as StatusPedido,
    em: h.created_at,
  }));
}
