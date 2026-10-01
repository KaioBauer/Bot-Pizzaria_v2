import {
  paraCentavos,
  paraReais,
  type PagamentoRegistro,
  type PagamentosRepo,
  type StatusPagamento,
  type StatusPedido,
} from "@pizzaria/shared";
import { exigir, type Db } from "../client";

const CAMPOS = "id, pedido_id, provedor_id, status, valor, expira_em, pedido:pedidos(numero, status)";

type Linha = {
  id: string;
  pedido_id: string;
  provedor_id: string;
  status: string;
  valor: number;
  expira_em: string;
  pedido: { numero: number; status: string };
};

function paraRegistro(l: Linha): PagamentoRegistro {
  return {
    id: l.id,
    pedidoId: l.pedido_id,
    pedidoNumero: l.pedido.numero,
    pedidoStatus: l.pedido.status as StatusPedido,
    provedorId: l.provedor_id,
    status: l.status as StatusPagamento,
    valorCentavos: paraCentavos(l.valor),
    expiraEm: l.expira_em,
  };
}

export function criarPagamentosRepo(db: Db, provedor = "mercadopago"): PagamentosRepo {
  return {
    async criar(p) {
      const resultado = await db
          .from("pagamentos")
          .insert({
            pedido_id: p.pedidoId,
            provedor,
            provedor_id: p.provedorId,
            valor: paraReais(p.valorCentavos),
            qr_code: p.qrCode,
            qr_code_base64: p.qrCodeBase64,
            expira_em: p.expiraEm.toISOString(),
          })
          .select("id")
          .single();
      return exigir(resultado, "Erro ao registrar pagamento").id;
    },

    async porProvedorId(provedorId) {
      const r = await db.from("pagamentos").select(CAMPOS).eq("provedor", provedor).eq("provedor_id", provedorId).maybeSingle();
      if (r.error) exigir(r, "Erro ao buscar pagamento");
      return r.data ? paraRegistro(r.data as Linha) : null;
    },

    async pendentes() {
      const linhas = exigir(
        await db.from("pagamentos").select(CAMPOS).eq("provedor", provedor).eq("status", "pendente").order("expira_em").limit(100),
        "Erro ao listar pagamentos pendentes"
      );
      return (linhas as Linha[]).map(paraRegistro);
    },

    async atualizarStatus(id, de, para) {
      const linhas = exigir(
        await db
          .from("pagamentos")
          .update({ status: para, ...(para === "aprovado" ? { aprovado_em: new Date().toISOString() } : {}) })
          .eq("id", id)
          .eq("status", de)
          .select("id"),
        "Erro ao atualizar pagamento"
      );
      return linhas.length > 0;
    },
  };
}

/**
 * Registra um evento de webhook. Devolve false se a mesma chave já foi
 * recebida (reentrega do provedor) — o chamador ignora o evento.
 */
export async function registrarEventoWebhook(db: Db, provedor: string, chave: string, payload: unknown): Promise<boolean> {
  const { error } = await db
    .from("webhook_eventos")
    .insert({ provedor, chave, payload: payload as never });
  if (error?.code === "23505") return false;
  if (error) throw new Error(`Erro ao registrar webhook: ${error.message}`);
  return true;
}

export async function concluirEventoWebhook(db: Db, provedor: string, chave: string, resultado: string): Promise<void> {
  await db.from("webhook_eventos").update({ resultado }).eq("provedor", provedor).eq("chave", chave);
}
