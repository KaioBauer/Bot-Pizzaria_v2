import {
  paraCentavos,
  paraReais,
  type PedidosRepo,
  type StatusPedido,
  type TipoEntrega,
} from "@pizzaria/shared";
import { exigir, ErroBanco, type Db } from "../client";

export function criarPedidosRepo(db: Db): PedidosRepo {
  return {
    async criar(pedido) {
      const payload = {
        canal: pedido.canal,
        chat_id: pedido.chatId,
        cliente_nome: pedido.clienteNome,
        cliente_telefone: pedido.clienteTelefone,
        tipo_entrega: pedido.tipoEntrega,
        endereco: pedido.endereco && {
          rua: pedido.endereco.rua,
          numero: pedido.endereco.numero,
          bairro: pedido.endereco.bairro,
          bairro_id: pedido.endereco.bairroId,
          complemento: pedido.endereco.complemento,
          referencia: pedido.endereco.referencia,
        },
        endereco_texto: pedido.enderecoTexto,
        forma_pagamento: pedido.formaPagamento,
        troco_para:
          pedido.trocoParaCentavos === null ? null : paraReais(pedido.trocoParaCentavos),
        status: pedido.status,
        subtotal: paraReais(pedido.subtotalCentavos),
        taxa_entrega: paraReais(pedido.taxaEntregaCentavos),
        valor_total: paraReais(pedido.totalCentavos),
        observacoes: pedido.observacoes,
        itens: pedido.itens.map((item) => {
          const primeiroSabor = item.componentes.find((c) => c.tipo === "sabor");
          if (!primeiroSabor) throw new ErroBanco("Item sem sabor");
          return {
            produto_id: primeiroSabor.produtoId,
            variacao_id: primeiroSabor.variacaoId,
            quantidade: item.quantidade,
            preco_unitario: paraReais(item.precoUnitarioCentavos),
            subtotal: paraReais(item.subtotalCentavos),
            descricao: item.descricao,
            observacoes: item.observacao,
            componentes: item.componentes.map((c) => ({
              tipo: c.tipo,
              produto_id: c.produtoId,
              variacao_id: c.variacaoId,
              produto_nome: c.produtoNome,
              variacao_nome: c.variacaoNome,
              preco: paraReais(c.precoCentavos),
            })),
          };
        }),
      };

      const resultado = exigir(
        await db.rpc("criar_pedido", { p_pedido: payload }),
        "Erro ao gravar pedido"
      ) as { id: string; numero: number };
      return { id: resultado.id, numero: resultado.numero };
    },

    async recentesDoChat(canal, chatId, desde) {
      const pedidos = exigir(
        await db
          .from("pedidos")
          .select("id, numero, status, tipo_entrega, valor_total, created_at")
          .eq("canal", canal)
          .eq("chat_id", chatId)
          .gte("created_at", desde.toISOString())
          .order("created_at", { ascending: false })
          .limit(5),
        "Erro ao consultar pedidos"
      );
      return pedidos.map((p) => ({
        id: p.id,
        numero: p.numero,
        status: p.status as StatusPedido,
        tipoEntrega: p.tipo_entrega as TipoEntrega,
        totalCentavos: paraCentavos(p.valor_total),
        criadoEm: p.created_at,
      }));
    },
  };
}
