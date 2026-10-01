import {
  formatarReais,
  paraCentavos,
  ROTULO_PAGAMENTO,
  type Canal,
  type EnderecoCliente,
  type FinalizarPedidoArgs,
  type NovoPedido,
} from "@pizzaria/shared";
import type { Cotacao } from "./precificacao";

export function formatarEndereco(endereco: EnderecoCliente): string {
  const partes = [`${endereco.rua}, ${endereco.numero ?? "s/n"}`];
  if (endereco.complemento) partes[0] += ` (${endereco.complemento})`;
  if (endereco.bairro) partes.push(endereco.bairro);
  let texto = partes.join(" - ");
  if (endereco.referencia) texto += `. Ref.: ${endereco.referencia}`;
  return texto;
}

export type ResultadoMontagem = { ok: true; pedido: NovoPedido } | { ok: false; erro: string };

/** Junta os argumentos validados com a cotação oficial do servidor. */
export function montarNovoPedido(params: {
  canal: Canal;
  chatId: string;
  args: FinalizarPedidoArgs;
  cotacao: Cotacao;
}): ResultadoMontagem {
  const { args, cotacao } = params;

  const trocoParaCentavos =
    args.forma_pagamento === "dinheiro" && args.troco_para != null
      ? paraCentavos(args.troco_para)
      : null;
  if (trocoParaCentavos !== null && trocoParaCentavos < cotacao.totalCentavos) {
    return {
      ok: false,
      erro: `O valor para troco (${formatarReais(trocoParaCentavos)}) é menor que o total (${formatarReais(cotacao.totalCentavos)})`,
    };
  }

  const endereco =
    args.tipo_entrega === "entrega" && args.endereco && cotacao.bairro
      ? {
          rua: args.endereco.rua,
          numero: args.endereco.numero,
          bairro: cotacao.bairro.nome,
          bairroId: cotacao.bairro.id,
          complemento: args.endereco.complemento,
          referencia: args.endereco.referencia,
        }
      : null;
  if (args.tipo_entrega === "entrega" && !endereco) {
    return { ok: false, erro: "Endereço de entrega incompleto" };
  }

  return {
    ok: true,
    pedido: {
      canal: params.canal,
      chatId: params.chatId,
      clienteNome: args.cliente_nome,
      clienteTelefone: args.cliente_telefone,
      tipoEntrega: args.tipo_entrega,
      endereco,
      enderecoTexto: endereco ? formatarEndereco(endereco) : null,
      formaPagamento: args.forma_pagamento,
      trocoParaCentavos,
      status: args.forma_pagamento === "pix" ? "aguardando_pagamento" : "novo",
      subtotalCentavos: cotacao.subtotalCentavos,
      taxaEntregaCentavos: cotacao.taxaEntregaCentavos,
      totalCentavos: cotacao.totalCentavos,
      observacoes: args.observacoes,
      itens: cotacao.itens,
    },
  };
}

/** Linhas de itens + totais, usadas no resumo e na confirmação. */
export function descreverValores(cotacao: Pick<Cotacao, "itens" | "subtotalCentavos" | "taxaEntregaCentavos" | "totalCentavos">): string {
  const linhas = cotacao.itens.map((item) => {
    const obs = item.observacao ? ` (${item.observacao})` : "";
    return `${item.quantidade}x ${item.descricao}${obs} — ${formatarReais(item.subtotalCentavos)}`;
  });
  if (cotacao.taxaEntregaCentavos > 0) {
    linhas.push(`Taxa de entrega: ${formatarReais(cotacao.taxaEntregaCentavos)}`);
  }
  linhas.push(`*Total: ${formatarReais(cotacao.totalCentavos)}*`);
  return linhas.join("\n");
}

/** Mensagem determinística de confirmação (não passa pelo LLM). */
export function mensagemPedidoConfirmado(pedido: NovoPedido, numero: number): string {
  const entrega =
    pedido.tipoEntrega === "entrega"
      ? `Entrega em: ${pedido.enderecoTexto}`
      : "Retirada no balcão";
  const troco =
    pedido.trocoParaCentavos !== null ? ` (troco para ${formatarReais(pedido.trocoParaCentavos)})` : "";

  return [
    `✅ Pedido *#${numero}* confirmado!`,
    "",
    descreverValores({
      itens: pedido.itens,
      subtotalCentavos: pedido.subtotalCentavos,
      taxaEntregaCentavos: pedido.taxaEntregaCentavos,
      totalCentavos: pedido.totalCentavos,
    }),
    "",
    entrega,
    `Pagamento: ${ROTULO_PAGAMENTO[pedido.formaPagamento]}${troco}`,
    "",
    "Já vamos começar a preparar. Para acompanhar, é só me perguntar por aqui. 🍕",
  ].join("\n");
}
