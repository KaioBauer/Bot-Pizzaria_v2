import type {
  Canal,
  CategoriaCardapio,
  ClienteConhecido,
  ConfiguracaoLoja,
  IngredienteParaPreco,
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

/** Quem escreveu: o cliente, a IA, um atendente pelo painel ou o sistema. */
export type AutorMensagem = "cliente" | "ia" | "atendente" | "sistema";

/** Mensagem de conversa em formato neutro (independe do provedor de LLM). */
export type MensagemConversa =
  | { papel: "user"; conteudo: string; autor?: AutorMensagem }
  | { papel: "assistant"; conteudo: string | null; toolCalls?: ChamadaTool[]; autor?: AutorMensagem; autorId?: string }
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
  ingredientesPorIds(ids: string[]): Promise<IngredienteParaPreco[]>;
}

export interface LojaRepo {
  configuracao(): Promise<ConfiguracaoLoja>;
}

export interface ClientesRepo {
  buscar(canal: Canal, chatId: string): Promise<ClienteConhecido | null>;
}

export interface PedidoCriado {
  id: string;
  numero: number;
  /** Link único de acompanhamento (/pedir/acompanhar/<token>). */
  token: string;
  existente: boolean;
}

export interface PedidosRepo {
  /** `existente`: a chave de idempotência já tinha gerado este pedido. */
  criar(pedido: NovoPedido): Promise<PedidoCriado>;
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

/**
 * Atendimento humano por chat. Com a IA pausada, o bot só registra as
 * mensagens do cliente e avisa o painel; quem responde é o atendente.
 */
export interface AtendimentoRepo {
  iaPausada(canal: Canal, chatId: string): Promise<boolean>;
  /** Última mensagem do chat (lista do painel). `precisaAtencao` liga o aviso. */
  registrar(
    canal: Canal,
    chatId: string,
    mensagem: { texto: string; autor: AutorMensagem; clienteNome?: string | null; precisaAtencao?: boolean }
  ): Promise<void>;
  /** Pausa a IA neste chat e liga o aviso no painel. */
  pausar(canal: Canal, chatId: string, dados: { motivo: string; por: "ia" | "atendente" }): Promise<void>;
}

export interface Repositorios {
  cardapio: CardapioRepo;
  loja: LojaRepo;
  clientes: ClientesRepo;
  pedidos: PedidosRepo;
  conversas: ConversasRepo;
  pagamentos: PagamentosRepo;
  carrinhos: CarrinhosRepo;
  atendimento: AtendimentoRepo;
}
