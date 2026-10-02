import { paraCentavos } from "@pizzaria/shared";
import { exigir, type Db } from "../client";

/** Entregas e motoboys no painel (sessão do admin, RLS). */

export interface EntregaDoPedido {
  entregadorNome: string | null;
  iniciadaEm: string | null;
  entregueEm: string | null;
  /** URL assinada (1 h) da foto no bucket privado `entregas`. */
  fotoUrl: string | null;
  local: { lat: number; lng: number; precisaoM: number | null } | null;
  valorRecebidoCentavos: number | null;
}

export async function entregaDoPedido(db: Db, pedidoId: string): Promise<EntregaDoPedido | null> {
  const r = await db
    .from("pedidos")
    .select("entrega_iniciada_em, entregue_em, entrega_foto, entrega_lat, entrega_lng, entrega_precisao_m, valor_recebido, entregador:entregadores(nome)")
    .eq("id", pedidoId)
    .maybeSingle();
  const p = exigir(r, "Erro ao carregar entrega");
  if (!p || (!p.entrega_iniciada_em && !p.entregue_em)) return null;

  let fotoUrl: string | null = null;
  if (p.entrega_foto) {
    const assinada = await db.storage.from("entregas").createSignedUrl(p.entrega_foto, 3600);
    fotoUrl = assinada.data?.signedUrl ?? null;
  }
  return {
    entregadorNome: p.entregador?.nome ?? null,
    iniciadaEm: p.entrega_iniciada_em,
    entregueEm: p.entregue_em,
    fotoUrl,
    local: p.entrega_lat !== null && p.entrega_lng !== null ? { lat: p.entrega_lat, lng: p.entrega_lng, precisaoM: p.entrega_precisao_m } : null,
    valorRecebidoCentavos: p.valor_recebido === null ? null : paraCentavos(p.valor_recebido),
  };
}

export interface EntregadorPainel {
  id: string;
  nome: string;
  telefone: string | null;
  ativo: boolean;
  entregasHoje: number;
  emRota: number;
}

export async function listarEntregadores(db: Db, inicioDoDia: Date): Promise<EntregadorPainel[]> {
  const [entregadores, pedidos] = await Promise.all([
    db.from("entregadores").select("user_id, nome, telefone, ativo").order("nome"),
    db
      .from("pedidos")
      .select("entregador_id, status, entregue_em")
      .not("entregador_id", "is", null)
      .or(`status.eq.saiu_para_entrega,entregue_em.gte.${inicioDoDia.toISOString()}`),
  ]);
  const linhas = exigir(pedidos, "Erro ao carregar entregas");
  return exigir(entregadores, "Erro ao carregar entregadores").map((e) => ({
    id: e.user_id,
    nome: e.nome,
    telefone: e.telefone,
    ativo: e.ativo,
    entregasHoje: linhas.filter((p) => p.entregador_id === e.user_id && p.entregue_em && p.entregue_em >= inicioDoDia.toISOString()).length,
    emRota: linhas.filter((p) => p.entregador_id === e.user_id && p.status === "saiu_para_entrega").length,
  }));
}

export async function definirEntregadorAtivo(db: Db, id: string, ativo: boolean): Promise<void> {
  exigir(await db.from("entregadores").update({ ativo }).eq("user_id", id).select("user_id"), "Erro ao atualizar entregador");
}
