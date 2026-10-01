import type { ClientesRepo } from "@pizzaria/shared";
import { exigir, type Db } from "../client";

export function criarClientesRepo(db: Db): ClientesRepo {
  return {
    async buscar(canal, chatId) {
      const resultado = await db
        .from("clientes")
        .select(
          "nome, telefone, enderecos(rua, numero, bairro, bairro_id, complemento, referencia, padrao, created_at)"
        )
        .eq("canal", canal)
        .eq("chat_id", chatId)
        .maybeSingle();
      if (resultado.error) exigir(resultado, "Erro ao buscar cliente");
      const cliente = resultado.data;
      if (!cliente) return null;

      const endereco =
        cliente.enderecos.find((e) => e.padrao) ??
        [...cliente.enderecos].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

      return {
        nome: cliente.nome,
        telefone: cliente.telefone,
        ultimoEndereco: endereco
          ? {
              rua: endereco.rua,
              numero: endereco.numero,
              bairro: endereco.bairro,
              bairroId: endereco.bairro_id,
              complemento: endereco.complemento,
              referencia: endereco.referencia,
            }
          : null,
      };
    },
  };
}
