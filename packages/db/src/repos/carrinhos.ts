import type { CarrinhosRepo } from "@pizzaria/shared";
import { exigir, type Db } from "../client";

export function criarCarrinhosRepo(db: Db): CarrinhosRepo {
  return {
    async consumir(codigo) {
      // Update condicional = uso único mesmo com dois cliques no link ao mesmo tempo.
      const linhas = exigir(
        await db
          .from("carrinhos_web")
          .update({ usado_em: new Date().toISOString() })
          .eq("codigo", codigo)
          .is("usado_em", null)
          .gt("expira_em", new Date().toISOString())
          .select("itens"),
        "Erro ao abrir carrinho"
      );
      return linhas[0]?.itens ?? null;
    },
  };
}
