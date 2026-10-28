import {
  descreverErrosZod,
  pedidoLinkSchema,
  type ConfiguracaoLoja,
  type PedidoLinkArgs,
  type Repositorios,
} from "@pizzaria/shared";
import { situacaoLoja } from "./horario";
import type { Logger } from "./logger";
import type { CobrancaCriada } from "./pagamentos/gateway";
import type { ServicoPix } from "./pagamentos/pix";
import { montarNovoPedido } from "./pedido";
import { cotarPedido, idsDeIngrediente, idsDeVariacao, type ResultadoCotacao } from "./precificacao";

/**
 * Pedido direto pelo link (/pedir): o navegador manda só IDs, quantidades e os
 * dados do cliente. Tudo é revalidado aqui com as mesmas regras do bot
 * (cotarPedido + montarNovoPedido) e gravado pela mesma criar_pedido.
 */

export type ResultadoPedidoLink =
  | {
      ok: true;
      numero: number;
      /** Link único de acompanhamento. */
      token: string;
      totalCentavos: number;
      /** A chave de idempotência já tinha gerado este pedido (duplo clique). */
      existente: boolean;
      pix?: CobrancaCriada;
    }
  | { ok: false; erros: string[] };

/** Telefone do formulário (DDD + número) no formato do WhatsApp, com DDI 55. */
export function telefoneComDdi(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

function falha(...erros: string[]): ResultadoPedidoLink {
  return { ok: false, erros };
}

/** Cotação do carrinho do link: itens (com ingredientes), entrega e bairro. */
export async function cotarPedidoLink(
  repos: Repositorios,
  config: ConfiguracaoLoja,
  pedido: Pick<PedidoLinkArgs, "itens" | "tipo_entrega" | "endereco">
): Promise<ResultadoCotacao> {
  const [variacoes, ingredientes] = await Promise.all([
    repos.cardapio.variacoesPorIds(idsDeVariacao(pedido.itens)),
    repos.cardapio.ingredientesPorIds(idsDeIngrediente(pedido.itens)),
  ]);
  return cotarPedido({
    itens: pedido.itens,
    variacoes: new Map(variacoes.map((v) => [v.id, v])),
    ingredientes: new Map(ingredientes.map((i) => [i.id, i])),
    maxIngredientes: config.maxIngredientes,
    tipoEntrega: pedido.tipo_entrega,
    bairroId: pedido.endereco?.bairro_id,
    bairros: config.bairros,
    pedidoMinimoCentavos: config.pedidoMinimoCentavos,
    tamanhos: config.tamanhos,
  });
}

export async function finalizarPedidoLink(
  deps: { repos: Repositorios; pix: ServicoPix | null; logger: Logger; agora?: Date },
  entrada: unknown
): Promise<ResultadoPedidoLink> {
  const { repos, logger } = deps;
  const dados = pedidoLinkSchema.safeParse(entrada);
  if (!dados.success) return falha(`Dados inválidos: ${descreverErrosZod(dados.error)}`);
  const pedido = dados.data;

  const config = await repos.loja.configuracao();
  if (!config.pedidoLinkAtivo) return falha("Os pedidos pelo link estão desativados no momento.");
  if (!situacaoLoja(config, deps.agora ?? new Date()).aberta) {
    return falha("A pizzaria está fechada agora. Você pode montar sua pizza, mas só dá para finalizar com a loja aberta.");
  }
  if (pedido.forma_pagamento === "pix" && !deps.pix) {
    return falha("O Pix online não está disponível no momento. Escolha dinheiro ou cartão na entrega.");
  }

  const cotacao = await cotarPedidoLink(repos, config, pedido);
  if (!cotacao.ok) return falha(...cotacao.erros);

  const montagem = montarNovoPedido({
    canal: "link",
    chatId: telefoneComDdi(pedido.cliente_telefone),
    args: { ...pedido, endereco: pedido.tipo_entrega === "entrega" ? (pedido.endereco ?? null) : null },
    cotacao: cotacao.cotacao,
  });
  if (!montagem.ok) return falha(montagem.erro);

  const criado = await repos.pedidos.criar({ ...montagem.pedido, chaveIdempotencia: pedido.chave_idempotencia });
  const resposta = {
    ok: true as const,
    numero: criado.numero,
    token: criado.token,
    totalCentavos: montagem.pedido.totalCentavos,
    existente: criado.existente,
  };
  // Repetição: o Pix (se houver) já foi gerado na primeira chamada; o
  // acompanhamento mostra o QR a partir do pagamento gravado.
  if (criado.existente) return resposta;

  logger.info({ pedidoId: criado.id, numero: criado.numero, total: montagem.pedido.totalCentavos }, "Pedido por link criado");

  if (montagem.pedido.formaPagamento === "pix" && deps.pix) {
    try {
      const pix = await deps.pix.gerarCobranca({
        pedidoId: criado.id,
        numero: criado.numero,
        totalCentavos: montagem.pedido.totalCentavos,
        nomePizzaria: config.nomePizzaria,
        expiracaoMinutos: config.pixExpiracaoMinutos,
      });
      return { ...resposta, pix };
    } catch (err) {
      // Sem cobrança o pedido não vale: descarta (sem notificar), como no bot.
      logger.error({ err, pedidoId: criado.id }, "Falha ao gerar Pix do pedido por link; pedido descartado");
      await repos.pedidos.descartarAguardandoPagamento(criado.id);
      return falha("Não foi possível gerar o Pix agora. Tente de novo em instantes ou escolha dinheiro ou cartão na entrega.");
    }
  }
  return resposta;
}
