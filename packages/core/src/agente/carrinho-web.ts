import { z } from "zod";
import { formatarReais, itemPedidoSchema, type ItemPedidoArgs } from "@pizzaria/shared";
import type { ResultadoCotacao } from "../precificacao";

/**
 * Carrinho montado no cardápio do site. O botão "Pedir no WhatsApp" abre o
 * wa.me com um texto pronto que contém c_<codigo>. O bot consome o carrinho, reprecifica no servidor e responde sem o LLM; a
 * conversa fica registrada (com os IDs) para o modelo seguir dali.
 */

const PADRAO_TEXTO = /(?:^|\s)c_([a-f0-9]{16})(?=$|[\s.,!)])/i;

export const PREFIXO_CARRINHO_WEB = "c_";

/**
 * Texto pré-preenchido do link do WhatsApp (o cliente só toca em enviar).
 * Sem emoji: o redirecionamento do wa.me estraga caracteres fora do básico (vira "�").
 */
export function textoWhatsappCarrinho(codigo: string): string {
  return `Olá! Quero enviar o pedido que montei no cardápio.\nCódigo: ${PREFIXO_CARRINHO_WEB}${codigo}`;
}

export function codigoCarrinhoWeb(texto: string): string | null {
  for (const linha of texto.split("\n")) {
    const codigo = PADRAO_TEXTO.exec(linha)?.[1];
    if (codigo) return codigo.toLowerCase();
  }
  return null;
}

export const itensCarrinhoSchema = z.array(itemPedidoSchema).min(1).max(30);

export function lerItensCarrinho(bruto: unknown): ItemPedidoArgs[] | null {
  const r = itensCarrinhoSchema.safeParse(bruto);
  return r.success ? r.data : null;
}

export function mensagemCarrinhoInvalido(urlCardapio: string | null): string {
  return [
    "Não encontrei esse pedido do cardápio 😕 Ele pode ter expirado ou já ter sido enviado.",
    "",
    urlCardapio
      ? `Monte de novo em ${urlCardapio} ou me diga aqui mesmo o que deseja.`
      : "Me diga aqui mesmo o que deseja.",
  ].join("\n");
}

/**
 * As duas mensagens que entram no histórico: a do cliente (com os itens no
 * formato das tools, para o modelo reaproveitar os IDs) e a resposta do bot.
 */
export function conversaCarrinhoWeb(
  itens: ItemPedidoArgs[],
  cotacao: ResultadoCotacao
): { mensagemCliente: string; resposta: string } {
  const dados = JSON.stringify(itens);

  if (!cotacao.ok) {
    return {
      mensagemCliente: `Montei meu pedido no cardápio do site, mas ele tem problemas: ${cotacao.erros.join("; ")}.\nItens enviados (formato das ferramentas): ${dados}`,
      resposta: [
        "Recebi seu pedido do cardápio, mas tem um detalhe 😕",
        "",
        ...cotacao.erros.map((e) => `• ${e}`),
        "",
        "Me diga como prefere seguir que eu ajusto por aqui.",
      ].join("\n"),
    };
  }

  const { itens: precificados, subtotalCentavos } = cotacao.cotacao;
  const linhas = precificados.map(
    (i) =>
      `• ${i.quantidade}x ${i.descricao} — ${formatarReais(i.subtotalCentavos)}${i.observacao ? `\n   _${i.observacao}_` : ""}`
  );
  return {
    mensagemCliente: [
      "Montei meu pedido no cardápio do site:",
      ...linhas,
      `Subtotal: ${formatarReais(subtotalCentavos)}`,
      `Itens (formato das ferramentas, IDs já conferidos): ${dados}`,
    ].join("\n"),
    resposta: [
      "🍕 Recebi seu pedido do cardápio!",
      "",
      ...linhas,
      "",
      `*Subtotal: ${formatarReais(subtotalCentavos)}*`,
      "",
      "É para *entrega* ou *retirada*? Se quiser mudar algo, é só me dizer.",
    ].join("\n"),
  };
}
