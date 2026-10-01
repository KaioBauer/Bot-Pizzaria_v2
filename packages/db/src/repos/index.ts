import type { Repositorios } from "@pizzaria/shared";
import type { Db } from "../client";
import { criarCardapioRepo } from "./cardapio";
import { criarCarrinhosRepo } from "./carrinhos";
import { criarClientesRepo } from "./clientes";
import { criarConversasRepo } from "./conversas";
import { criarLojaRepo } from "./loja";
import { criarPagamentosRepo } from "./pagamentos";
import { criarPedidosRepo } from "./pedidos";

export function criarRepositorios(db: Db): Repositorios {
  return {
    cardapio: criarCardapioRepo(db),
    loja: criarLojaRepo(db),
    clientes: criarClientesRepo(db),
    pedidos: criarPedidosRepo(db),
    conversas: criarConversasRepo(db),
    pagamentos: criarPagamentosRepo(db),
    carrinhos: criarCarrinhosRepo(db),
  };
}
