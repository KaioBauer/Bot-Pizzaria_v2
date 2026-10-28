import {
  paraCentavos,
  paraReais,
  type CobrancaSimulada,
  type CobrancasSimuladasRepo,
  type StatusCobrancaSimulada,
} from "@pizzaria/shared";
import { exigir, type Db } from "../client";
import type { Tables, TablesUpdate } from "../database.types";

type Linha = Tables<"pix_simulado_cobrancas">;

function paraCobranca(l: Linha): CobrancaSimulada {
  return {
    referencia: l.referencia,
    txid: l.txid,
    valorCentavos: paraCentavos(l.valor),
    descricao: l.descricao,
    brCode: l.br_code,
    status: l.status as StatusCobrancaSimulada,
    expiraEm: l.expira_em,
    criadaEm: l.created_at,
    pagaEm: l.paga_em,
    pagadorNome: l.pagador_nome,
    endToEndId: l.end_to_end_id,
    estornadaEm: l.estornada_em,
  };
}

/** "Lado do banco" do Pix simulado (tabela só da service_role). */
export function criarCobrancasSimuladasRepo(db: Db): CobrancasSimuladasRepo {
  const tabela = () => db.from("pix_simulado_cobrancas");

  async function uma(coluna: "referencia" | "txid", valor: string) {
    const r = await tabela().select("*").eq(coluna, valor).maybeSingle();
    if (r.error) exigir(r, "Erro ao buscar cobrança do Pix simulado");
    return r.data ? paraCobranca(r.data) : null;
  }

  return {
    async criar(c) {
      const r = await tabela()
        .insert({
          referencia: c.referencia,
          txid: c.txid,
          valor: paraReais(c.valorCentavos),
          descricao: c.descricao,
          br_code: c.brCode,
          expira_em: c.expiraEm,
        })
        .select("*")
        .single();
      // Já existe cobrança para o pedido (criação repetida): devolve a existente.
      if (r.error?.code === "23505") return (await uma("referencia", c.referencia))!;
      return paraCobranca(exigir(r, "Erro ao criar cobrança do Pix simulado"));
    },

    porReferencia: (referencia) => uma("referencia", referencia),
    porTxid: (txid) => uma("txid", txid),

    async recentes(limite) {
      const linhas = exigir(await tabela().select("*").order("created_at", { ascending: false }).limit(limite), "Erro ao listar cobranças do Pix simulado");
      return linhas.map(paraCobranca);
    },

    async atualizar(referencia, de, m) {
      const mudanca: TablesUpdate<"pix_simulado_cobrancas"> = {
        ...(m.status ? { status: m.status } : {}),
        ...(m.pagaEm !== undefined ? { paga_em: m.pagaEm } : {}),
        ...(m.pagadorNome !== undefined ? { pagador_nome: m.pagadorNome } : {}),
        ...(m.endToEndId !== undefined ? { end_to_end_id: m.endToEndId } : {}),
        ...(m.estornadaEm !== undefined ? { estornada_em: m.estornadaEm } : {}),
      };
      const linhas = exigir(
        await tabela().update(mudanca).eq("referencia", referencia).eq("status", de).select("referencia"),
        "Erro ao atualizar cobrança do Pix simulado"
      );
      return linhas.length > 0;
    },
  };
}
