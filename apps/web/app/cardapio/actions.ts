"use server";

import { itensCarrinhoSchema, PREFIXO_CARRINHO_WEB } from "@pizzaria/core";
import { criarRepositorios } from "@pizzaria/db";
import { clientePublico } from "../../lib/supabase/publico";

export type ResultadoEnvio = { ok: true; link: string } | { ok: false; erro: string };

/**
 * Guarda o carrinho e devolve o link do Telegram que o entrega ao bot
 * (t.me/<bot>?start=c_<codigo>). Preço não vai junto: o bot reprecifica tudo.
 */
export async function enviarCarrinhoAction(entrada: unknown): Promise<ResultadoEnvio> {
  const itens = itensCarrinhoSchema.safeParse(entrada);
  if (!itens.success) return { ok: false, erro: "Seu pedido tem itens inválidos. Remova e adicione de novo." };

  const db = clientePublico();
  const config = await criarRepositorios(db).loja.configuracao();
  if (!config.telegramUsuario) return { ok: false, erro: "Pedidos pelo Telegram estão indisponíveis no momento." };

  const { data: codigo, error } = await db.rpc("criar_carrinho_web", { p_itens: itens.data });
  if (error || !codigo) return { ok: false, erro: "Não consegui enviar agora. Tente de novo em instantes." };
  return { ok: true, link: `https://t.me/${config.telegramUsuario}?start=${PREFIXO_CARRINHO_WEB}${codigo}` };
}
