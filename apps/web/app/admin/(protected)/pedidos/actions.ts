"use server";

import { z } from "zod";
import { podeTransicionar, ROTULO_STATUS, STATUS_PEDIDO, type TipoEntrega } from "@pizzaria/shared";
import { exigirAdmin } from "../../../../lib/auth";

export type ResultadoAcao = { ok: true } | { ok: false; erro: string };

const entradaStatus = z.object({
  pedidoId: z.uuid(),
  de: z.enum(STATUS_PEDIDO),
  para: z.enum(STATUS_PEDIDO),
  motivo: z.string().trim().max(200).optional(),
});

/**
 * Muda o status validando a máquina de status. O update só acontece se o
 * pedido ainda estiver em `de` (outro atendente pode ter mexido antes). A
 * notificação ao cliente sai sozinha: trigger -> notificacoes_cliente -> bot.
 */
export async function alterarStatusAction(entrada: z.input<typeof entradaStatus>): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  const dados = entradaStatus.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Dados inválidos." };
  const { pedidoId, de, para, motivo } = dados.data;

  const { data: pedido, error: erroBusca } = await supabase
    .from("pedidos")
    .select("status, tipo_entrega")
    .eq("id", pedidoId)
    .maybeSingle();
  if (erroBusca || !pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (pedido.status !== de) {
    return { ok: false, erro: `O pedido já está como "${ROTULO_STATUS[pedido.status as typeof de] ?? pedido.status}". A tela foi atualizada.` };
  }
  if (!podeTransicionar(de, para, pedido.tipo_entrega as TipoEntrega)) {
    return { ok: false, erro: `Não é possível passar de "${ROTULO_STATUS[de]}" para "${ROTULO_STATUS[para]}".` };
  }
  if (para === "cancelado" && !motivo) return { ok: false, erro: "Informe o motivo do cancelamento." };

  const { data: alterados, error } = await supabase
    .from("pedidos")
    .update({ status: para, ...(para === "cancelado" ? { motivo_cancelamento: motivo } : {}) })
    .eq("id", pedidoId)
    .eq("status", de)
    .select("id");
  if (error) return { ok: false, erro: "Não foi possível salvar. Tente de novo." };
  if (!alterados?.length) return { ok: false, erro: "O pedido mudou enquanto você mexia. A tela foi atualizada." };
  return { ok: true };
}

/** Pede ao print-agent para imprimir o pedido de novo. */
export async function reimprimirAction(pedidoId: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  if (!z.uuid().safeParse(pedidoId).success) return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await supabase
    .from("pedidos")
    .update({ reimpressao_solicitada_em: new Date().toISOString() })
    .eq("id", pedidoId)
    .select("id");
  if (error || !data?.length) return { ok: false, erro: "Não foi possível pedir a reimpressão." };
  return { ok: true };
}
