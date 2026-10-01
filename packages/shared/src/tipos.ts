import type { StatusPedido } from "./status";

/**
 * Tipos de domínio. Valores monetários são sempre centavos inteiros
 * (sufixo `Centavos`). IDs são UUID.
 */

export type Canal = "telegram" | "whatsapp";
export type TipoVariacao = "tamanho" | "borda" | "adicional" | "padrao";
export type TipoEntrega = "entrega" | "retirada";
export type FormaPagamento = "pix" | "dinheiro" | "cartao";

export const ROTULO_PAGAMENTO: Record<FormaPagamento, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão (maquininha)",
};

// Cardápio ---------------------------------------------------------------------

export interface VariacaoCardapio {
  id: string;
  nome: string;
  tipo: TipoVariacao;
  precoCentavos: number;
}

export interface ProdutoCardapio {
  id: string;
  nome: string;
  descricao: string | null;
  imagemUrl: string | null;
  variacoes: VariacaoCardapio[];
}

export interface CategoriaCardapio {
  id: string;
  nome: string;
  ordem: number;
  produtos: ProdutoCardapio[];
}

/** Variação com o produto dono, para revalidar preço e disponibilidade. */
export interface VariacaoParaPreco {
  id: string;
  nome: string;
  tipo: TipoVariacao;
  precoCentavos: number;
  ativa: boolean;
  produtoId: string;
  produtoNome: string;
  produtoAtivo: boolean;
}

// Loja -------------------------------------------------------------------------

export interface TurnoFuncionamento {
  /** 0 = domingo ... 6 = sábado */
  diaSemana: number;
  /** "HH:MM" */
  abre: string;
  /** "HH:MM"; se <= abre, o turno termina no dia seguinte. */
  fecha: string;
}

export interface BairroEntrega {
  id: string;
  nome: string;
  taxaCentavos: number;
}

export interface ConfiguracaoLoja {
  nomePizzaria: string;
  telefone: string | null;
  endereco: string | null;
  whatsappNumero: string | null;
  telegramUsuario: string | null;
  instagram: string | null;
  fusoHorario: string;
  pedidoMinimoCentavos: number;
  aceitandoPedidos: boolean;
  pixExpiracaoMinutos: number;
  horarios: TurnoFuncionamento[];
  bairros: BairroEntrega[];
}

// Clientes e pedidos -------------------------------------------------------------

export interface EnderecoCliente {
  rua: string;
  numero: string | null;
  bairro: string | null;
  bairroId: string | null;
  complemento: string | null;
  referencia: string | null;
}

export interface ClienteConhecido {
  nome: string | null;
  telefone: string | null;
  ultimoEndereco: EnderecoCliente | null;
}

export interface ComponenteItem {
  tipo: "sabor" | "adicional";
  produtoId: string;
  variacaoId: string;
  produtoNome: string;
  variacaoNome: string;
  precoCentavos: number;
}

export interface ItemPrecificado {
  quantidade: number;
  precoUnitarioCentavos: number;
  subtotalCentavos: number;
  /** Ex.: "Meio a meio Calabresa / Margherita (Grande) + Borda Catupiry" */
  descricao: string;
  observacao: string | null;
  componentes: ComponenteItem[];
}

export interface NovoPedido {
  canal: Canal;
  chatId: string;
  clienteNome: string;
  clienteTelefone: string | null;
  tipoEntrega: TipoEntrega;
  endereco: (EnderecoCliente & { bairroId: string; bairro: string }) | null;
  enderecoTexto: string | null;
  formaPagamento: FormaPagamento;
  trocoParaCentavos: number | null;
  status: "novo" | "aguardando_pagamento";
  subtotalCentavos: number;
  taxaEntregaCentavos: number;
  totalCentavos: number;
  observacoes: string | null;
  itens: ItemPrecificado[];
}

export interface ResumoPedido {
  id: string;
  numero: number;
  status: StatusPedido;
  tipoEntrega: TipoEntrega;
  totalCentavos: number;
  criadoEm: string;
}
