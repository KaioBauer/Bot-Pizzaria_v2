import type {
  Canal,
  CategoriaCardapio,
  ClienteConhecido,
  ConfiguracaoLoja,
  NovoPedido,
  PagamentoRegistro,
  ResumoPedido,
  StatusPagamento,
  VariacaoParaPreco,
} from "./tipos";

/**
 * Contratos de persistência consumidos pelo núcleo (@pizzaria/core) e
 * implementados por @pizzaria/db. O núcleo depende só destas interfaces, o
 * que permite testá-lo com implementações em memória.
 */

/** Mensagem de conversa em formato neutro (independe do provedor de LLM). */
export type MensagemConversa =
  | { papel: "user"; conteudo: string }
  | { papel: "assistant"; conteudo: string | null; toolCalls?: ChamadaTool[] }
  | { papel: "tool"; toolCallId: string; conteudo: string };

export interface ChamadaTool {
  id: string;
  nome: string;
  /** JSON cru, como veio do modelo. */
  argumentos: string;
}

export interface CardapioRepo {
  ativo(): Promise<CategoriaCardapio[]>;
  variacoesPorIds(ids: string[]): Promise<VariacaoParaPreco[]>;
}

export interface LojaRepo {
  configuracao(): Promise<ConfiguracaoLoja>;
}

export interface ClientesRepo {
  buscar(canal: Canal, chatId: string): Promise<ClienteConhecido | null>;
}

export interface PedidosRepo {
  criar(pedido: NovoPedido): Promise<{ id: string; numero: number }>;
  recentesDoChat(canal: Canal, chatId: string, desde: Date): Promise<ResumoPedido[]>;
  /** aguardando_pagamento -> novo. false se o pedido não estava aguardando. */
  confirmarPagamento(pedidoId: string): Promise<boolean>;
  /** aguardando_pagamento -> cancelado. false se o pedido não estava aguardando. */
  cancelarAguardandoPagamento(pedidoId: string, motivo: string): Promise<boolean>;
  /**
   * Apaga um pedido que nunca chegou a valer (ex.: falha ao gerar o Pix logo
   * após criar). Só age em aguardando_pagamento; não gera notificação.
   */
  descartarAguardandoPagamento(pedidoId: string): Promise<void>;
}

export interface PagamentosRepo {
  criar(pagamento: {
    pedidoId: string;
    provedorId: string;
    valorCentavos: number;
    qrCode: string;
    qrCodeBase64: string;
    expiraEm: Date;
  }): Promise<string>;
  porProvedorId(provedorId: string): Promise<PagamentoRegistro | null>;
  pendentes(): Promise<PagamentoRegistro[]>;
  /** Muda o status só se ainda estiver em `de`. false se outro processo já mudou. */
  atualizarStatus(id: string, de: StatusPagamento, para: StatusPagamento): Promise<boolean>;
}

export interface ConversasRepo {
  /**
   * Devolve a conversa ativa do chat, criando uma nova se não houver ou se a
   * atual estiver parada desde antes de `inativaDesde` (que é encerrada).
   */
  obterAtiva(canal: Canal, chatId: string, inativaDesde: Date): Promise<string>;
  /** Últimas `limite` mensagens, em ordem cronológica. */
  mensagens(conversaId: string, limite: number): Promise<MensagemConversa[]>;
  adicionar(conversaId: string, mensagens: MensagemConversa[]): Promise<void>;
  encerrar(conversaId: string, pedidoId: string | null): Promise<void>;
}

export interface CarrinhosRepo {
  /**
   * Carrinho montado no cardápio do site. Marca como usado e devolve os itens
   * (JSON cru, ainda não validado); null se não existe, venceu ou já foi usado.
   */
  consumir(codigo: string): Promise<unknown | null>;
}

export interface Repositorios {
  cardapio: CardapioRepo;
  loja: LojaRepo;
  clientes: ClientesRepo;
  pedidos: PedidosRepo;
  conversas: ConversasRepo;
  pagamentos: PagamentosRepo;
  carrinhos: CarrinhosRepo;
}
