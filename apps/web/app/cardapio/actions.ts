"use server";

import { itensCarrinhoSchema, PREFIXO_CARRINHO_WEB, textoWhatsappCarrinho } from "@pizzaria/core";
import type { Canal } from "@pizzaria/shared";
import { criarRepositorios } from "@pizzaria/db";
import { clientePublico } from "../../lib/supabase/publico";

export type ResultadoEnvio = { ok: true; link: string } | { ok: false; erro: string };

/**
 * Guarda o carrinho e devolve o link que o entrega ao bot: Telegram
 * (t.me/<bot>?start=c_<codigo>) ou WhatsApp (wa.me com o código no texto).
 * Preço não vai junto: o bot reprecifica tudo.
 */
export async function enviarCarrinhoAction(canal: Canal, entrada: unknown): Promise<ResultadoEnvio> {
  const itens = itensCarrinhoSchema.safeParse(entrada);
  if (!itens.success) return { ok: false, erro: "Seu pedido tem itens inválidos. Remova e adicione de novo." };

  const db = clientePublico();
  const config = await criarRepositorios(db).loja.configuracao();
  const destino = canal === "whatsapp" ? config.whatsappNumero : config.telegramUsuario;
  if (!destino) return { ok: false, erro: "Esse canal está indisponível no momento." };

  const { data: codigo, error } = await db.rpc("criar_carrinho_web", { p_itens: itens.data });
  if (error || !codigo) return { ok: false, erro: "Não consegui enviar agora. Tente de novo em instantes." };
  return {
    ok: true,
    link:
      canal === "whatsapp"
        ? `https://wa.me/${destino}?text=${encodeURIComponent(textoWhatsappCarrinho(codigo))}`
        : `https://t.me/${destino}?start=${PREFIXO_CARRINHO_WEB}${codigo}`,
  };
}
