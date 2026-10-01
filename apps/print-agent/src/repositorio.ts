import { exigir, type Db } from "@pizzaria/db";
import { paraCentavos, type FormaPagamento, type TipoEntrega } from "@pizzaria/shared";
import type { PedidoParaCupom } from "./cupom";

export interface PedidoParaImprimir {
  id: string;
  reimpressaoSolicitadaEm: string | null;
  jaImpresso: boolean;
  cupom: PedidoParaCupom;
}

const CAMPOS = `id, numero, created_at, canal, cliente_nome, cliente_telefone, tipo_entrega, endereco_texto,
  forma_pagamento, troco_para, subtotal, taxa_entrega, valor_total, observacoes, impresso_em,
  reimpressao_solicitada_em, itens:itens_pedido(quantidade, descricao, observacoes, subtotal, created_at)`;

/**
 * Pedidos que precisam ir para o papel: novos ainda não impressos (qualquer
 * status exceto aguardando pagamento e cancelado — se o agente ficou fora do
 * ar e o pedido já avançou, ainda assim imprime) e reimpressões pedidas.
 */
export async function buscarFilaDeImpressao(db: Db): Promise<PedidoParaImprimir[]> {
  const pedidos = exigir(
    await db
      .from("pedidos")
      .select(CAMPOS)
      .or(
        "and(impresso_em.is.null,status.not.in.(aguardando_pagamento,cancelado)),reimpressao_solicitada_em.not.is.null"
      )
      .order("created_at")
      .limit(20),
    "Erro ao buscar fila de impressão"
  );

  return pedidos.map((p) => ({
    id: p.id,
    reimpressaoSolicitadaEm: p.reimpressao_solicitada_em,
    jaImpresso: p.impresso_em !== null,
    cupom: {
      numero: p.numero,
      criadoEm: new Date(p.created_at),
      canal: p.canal,
      clienteNome: p.cliente_nome,
      clienteTelefone: p.cliente_telefone,
      tipoEntrega: p.tipo_entrega as TipoEntrega,
      enderecoTexto: p.endereco_texto,
      formaPagamento: p.forma_pagamento as FormaPagamento,
      trocoParaCentavos: p.troco_para === null ? null : paraCentavos(p.troco_para),
      subtotalCentavos: paraCentavos(p.subtotal),
      taxaEntregaCentavos: paraCentavos(p.taxa_entrega),
      totalCentavos: paraCentavos(p.valor_total),
      observacoes: p.observacoes,
      itens: [...p.itens]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((i) => ({
          quantidade: i.quantidade,
          descricao: i.descricao,
          observacao: i.observacoes,
          subtotalCentavos: paraCentavos(i.subtotal),
        })),
    },
  }));
}

export async function marcarImpresso(db: Db, pedidoId: string, reimpressaoAtendida: string | null) {
  const { error } = await db.rpc("marcar_pedido_impresso", {
    p_pedido_id: pedidoId,
    ...(reimpressaoAtendida ? { p_reimpressao_atendida: reimpressaoAtendida } : {}),
  });
  if (error) throw new Error(`Erro ao marcar pedido como impresso: ${error.message}`);
}

export async function buscarDadosLoja(db: Db) {
  const { data, error } = await db.from("configuracoes").select("nome_pizzaria, fuso_horario").single();
  if (error || !data) throw new Error(`Erro ao carregar configurações: ${error?.message ?? "sem dados"}`);
  return { nomePizzaria: data.nome_pizzaria, fusoHorario: data.fuso_horario };
}
