import type { StatusPedido } from "./status";

/**
 * Tipos de domínio. Valores monetários são sempre centavos inteiros
 * (sufixo `Centavos`). IDs são UUID.
 */

/** Canais de conversa (bot). */
export type Canal = "whatsapp";
/**
 * Origem do pedido: um canal de conversa ou o link de pedido direto (/pedir).
 * Pedidos antigos podem ter "telegram" no banco (canal desativado); só aparecem no histórico.
 */
export type CanalPedido = Canal | "link";
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
  /** Sabor "Monte a sua": só vale com ingredientes. */
  montagemLivre?: boolean;
}

/**
 * Ingrediente do catálogo único: adicional da pizza inteira ou base da
 * montagem livre. Preço por tamanho (nome do tamanho em tamanhos_pizza);
 * sem preço num tamanho = não oferecido nele.
 */
export interface IngredienteParaPreco {
  id: string;
  nome: string;
  ativo: boolean;
  precosCentavos: Record<string, number>;
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

/** Tamanho de pizza: preço base e quantos sabores aceita (meio a meio, 3, 4...). */
export interface TamanhoPizza {
  nome: string;
  fatias: number;
  maxSabores: number;
  precoBaseCentavos: number;
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
  instagram: string | null;
  fusoHorario: string;
  pedidoMinimoCentavos: number;
  aceitandoPedidos: boolean;
  pixExpiracaoMinutos: number;
  /** Tempo médio (min) do início do preparo até a entrega / até ficar pronto para retirar. */
  tempoEntregaMinutos: number;
  tempoRetiradaMinutos: number;
  /** Pedido direto pelo link /pedir. */
  pedidoLinkAtivo: boolean;
  /** Máximo de ingredientes numa pizza (adicionais + montagem livre). */
  maxIngredientes: number;
  horarios: TurnoFuncionamento[];
  bairros: BairroEntrega[];
  tamanhos: TamanhoPizza[];
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

export type ComponenteItem =
  | {
      tipo: "sabor" | "adicional";
      produtoId: string;
      variacaoId: string;
      produtoNome: string;
      variacaoNome: string;
      precoCentavos: number;
    }
  | {
      tipo: "ingrediente";
      ingredienteId: string;
      /** Nome do ingrediente e do tamanho em que foi cobrado. */
      produtoNome: string;
      variacaoNome: string;
      precoCentavos: number;
    };

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
  canal: CanalPedido;
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
  /** Repetir a mesma chave devolve o pedido já criado (duplo clique no link). */
  chaveIdempotencia?: string;
}

export interface ResumoPedido {
  id: string;
  numero: number;
  status: StatusPedido;
  tipoEntrega: TipoEntrega;
  totalCentavos: number;
  criadoEm: string;
  formaPagamento?: FormaPagamento;
}

// Pagamentos ---------------------------------------------------------------------

export type StatusPagamento = "pendente" | "aprovado" | "expirado" | "cancelado" | "recusado" | "estornado";

export interface PagamentoRegistro {
  id: string;
  pedidoId: string;
  pedidoNumero: number;
  pedidoStatus: StatusPedido;
  provedorId: string;
  status: StatusPagamento;
  valorCentavos: number;
  expiraEm: string;
}
