import type {
  Canal,
  CategoriaCardapio,
  CobrancaSimulada,
  CobrancasSimuladasRepo,
  ConfiguracaoLoja,
  IngredienteParaPreco,
  MensagemConversa,
  NovoPedido,
  Repositorios,
  VariacaoParaPreco,
} from "@pizzaria/shared";
import type { LlmProvider, RequisicaoLlm, RespostaLlm } from "../llm/tipos";
import type { CobrancaCriada, GatewayPix, SituacaoCobranca } from "../pagamentos/gateway";
import type { PagamentoRegistro, StatusPedido } from "@pizzaria/shared";

/** Repositórios em memória para testar o agente sem banco. */
export function repositoriosEmMemoria(params: {
  variacoes: Map<string, VariacaoParaPreco>;
  config: ConfiguracaoLoja;
  cardapio?: CategoriaCardapio[];
  ingredientes?: Map<string, IngredienteParaPreco>;
}) {
  const pedidos: Array<Omit<NovoPedido, "status"> & { id: string; numero: number; status: StatusPedido; motivo?: string }> = [];
  const pagamentos: Array<Omit<PagamentoRegistro, "pedidoNumero" | "pedidoStatus">> = [];
  const registro = (p: (typeof pagamentos)[number]): PagamentoRegistro => {
    const pedido = pedidos.find((x) => x.id === p.pedidoId)!;
    return { ...p, pedidoNumero: pedido.numero, pedidoStatus: pedido.status };
  };
  const conversas = new Map<string, { mensagens: MensagemConversa[]; encerrada: boolean; pedidoId: string | null }>();
  const carrinhos = new Map<string, unknown>();
  const atendimentos = new Map<string, { iaPausada: boolean; precisaAtencao: boolean; motivo?: string; ultima?: string; autor?: string }>();
  const chave = (canal: string, chatId: string) => `${canal}:${chatId}`;
  let sequencia = 0;

  const repos: Repositorios = {
    cardapio: {
      ativo: async () => params.cardapio ?? [],
      variacoesPorIds: async (ids) => ids.flatMap((id) => params.variacoes.get(id) ?? []),
      ingredientesPorIds: async (ids) => ids.flatMap((id) => params.ingredientes?.get(id) ?? []),
    },
    loja: { configuracao: async () => params.config },
    clientes: { buscar: async () => null },
    pedidos: {
      criar: async (pedido) => {
        const repetido = pedido.chaveIdempotencia && pedidos.find((p) => p.chaveIdempotencia === pedido.chaveIdempotencia);
        if (repetido) return { id: repetido.id, numero: repetido.numero, token: `token-${repetido.id}`, existente: true };
        const criado = { ...pedido, id: `pedido-${pedidos.length + 1}`, numero: pedidos.length + 1 };
        pedidos.push(criado);
        return { id: criado.id, numero: criado.numero, token: `token-${criado.id}`, existente: false };
      },
      recentesDoChat: async () =>
        pedidos.map((p) => ({
          id: p.id,
          numero: p.numero,
          status: p.status,
          tipoEntrega: p.tipoEntrega,
          totalCentavos: p.totalCentavos,
          criadoEm: "2026-10-02T21:00:00Z",
        })),
      confirmarPagamento: async (id) => {
        const p = pedidos.find((x) => x.id === id && x.status === "aguardando_pagamento");
        if (p) p.status = "novo";
        return Boolean(p);
      },
      cancelarAguardandoPagamento: async (id, motivo) => {
        const p = pedidos.find((x) => x.id === id && x.status === "aguardando_pagamento");
        if (p) Object.assign(p, { status: "cancelado", motivo });
        return Boolean(p);
      },
      descartarAguardandoPagamento: async (id) => {
        const i = pedidos.findIndex((x) => x.id === id && x.status === "aguardando_pagamento");
        if (i >= 0) pedidos.splice(i, 1);
      },
    },
    pagamentos: {
      criar: async (p) => {
        const id = `pag-${pagamentos.length + 1}`;
        pagamentos.push({ id, pedidoId: p.pedidoId, provedorId: p.provedorId, status: "pendente", valorCentavos: p.valorCentavos, expiraEm: p.expiraEm.toISOString() });
        return id;
      },
      porProvedorId: async (provedorId) => {
        const p = pagamentos.find((x) => x.provedorId === provedorId);
        return p ? registro(p) : null;
      },
      pendentes: async () => pagamentos.filter((p) => p.status === "pendente").map(registro),
      aprovadosDeCancelados: async () => pagamentos.map(registro).filter((p) => p.status === "aprovado" && p.pedidoStatus === "cancelado"),
      atualizarStatus: async (id, de, para) => {
        const p = pagamentos.find((x) => x.id === id && x.status === de);
        if (p) p.status = para;
        return Boolean(p);
      },
    },
    conversas: {
      obterAtiva: async (canal, chatId) => {
        const ativa = [...conversas.entries()].find(([id, c]) => !c.encerrada && id.startsWith(`${canal}:${chatId}:`));
        if (ativa) return ativa[0];
        const id = `${canal}:${chatId}:${++sequencia}`;
        conversas.set(id, { mensagens: [], encerrada: false, pedidoId: null });
        return id;
      },
      mensagens: async (id, limite) => conversas.get(id)!.mensagens.slice(-limite),
      adicionar: async (id, mensagens) => {
        conversas.get(id)!.mensagens.push(...mensagens);
      },
      encerrar: async (id, pedidoId) => {
        const conversa = conversas.get(id)!;
        conversa.encerrada = true;
        conversa.pedidoId = pedidoId;
      },
    },
    atendimento: {
      iaPausada: async (canal, chatId) => atendimentos.get(chave(canal, chatId))?.iaPausada ?? false,
      registrar: async (canal, chatId, m) => {
        const atual = atendimentos.get(chave(canal, chatId)) ?? { iaPausada: false, precisaAtencao: false };
        atendimentos.set(chave(canal, chatId), { ...atual, ultima: m.texto, autor: m.autor, precisaAtencao: atual.precisaAtencao || Boolean(m.precisaAtencao) });
      },
      pausar: async (canal, chatId, d) => {
        const atual = atendimentos.get(chave(canal, chatId)) ?? { iaPausada: false, precisaAtencao: false };
        atendimentos.set(chave(canal, chatId), { ...atual, iaPausada: true, precisaAtencao: true, motivo: d.motivo });
      },
    },
    carrinhos: {
      consumir: async (codigo) => {
        const itens = carrinhos.get(codigo);
        carrinhos.delete(codigo);
        return itens ?? null;
      },
    },
  };

  return { repos, pedidos, pagamentos, conversas, carrinhos, atendimentos };
}

/** LLM roteirizado: devolve as respostas na ordem e registra as requisições. */
export function llmRoteirizado(roteiro: Array<RespostaLlm | Error>) {
  const requisicoes: RequisicaoLlm[] = [];
  const llm: LlmProvider = {
    async completar(requisicao) {
      requisicoes.push(structuredClone(requisicao));
      const proxima = roteiro.shift();
      if (!proxima) throw new Error("Roteiro do LLM acabou");
      if (proxima instanceof Error) throw proxima;
      return proxima;
    },
  };
  return { llm, requisicoes };
}

export const texto = (conteudo: string): RespostaLlm => ({ conteudo, toolCalls: [] });

export const chamar = (...chamadas: Array<[nome: string, argumentos: object, id?: string]>): RespostaLlm => ({
  conteudo: null,
  toolCalls: chamadas.map(([nome, argumentos, id], i) => ({
    id: id ?? `call_${nome}_${i}`,
    nome,
    argumentos: JSON.stringify(argumentos),
  })),
});

/** Gateway Pix falso: o teste controla o status de cada cobrança. */
export function gatewayPixFalso() {
  const cobrancas = new Map<string, SituacaoCobranca>();
  const chamadas: string[] = [];
  let falharAoCriar = false;
  let seq = 0;
  const gateway: GatewayPix = {
    async criarCobranca(c): Promise<CobrancaCriada> {
      chamadas.push("criar");
      if (falharAoCriar) throw new Error("gateway fora do ar");
      const provedorId = `mp-${++seq}`;
      cobrancas.set(provedorId, { provedorId, status: "pendente", valorCentavos: c.valorCentavos, referenciaExterna: c.pedidoId });
      return { provedorId, qrCode: "00020126-PIX-COPIA-E-COLA", qrCodeBase64: "iVBORw0KGgo=", expiraEm: c.expiraEm };
    },
    async consultar(id) {
      chamadas.push(`consultar:${id}`);
      return cobrancas.get(id)!;
    },
    async cancelar(id) {
      chamadas.push(`cancelar:${id}`);
      const c = cobrancas.get(id)!;
      if (c.status === "pendente") c.status = "cancelado";
    },
    async estornar(id) {
      chamadas.push(`estornar:${id}`);
      cobrancas.get(id)!.status = "estornado";
    },
  };
  return {
    gateway,
    cobrancas,
    chamadas,
    falharAoCriar: (v: boolean) => {
      falharAoCriar = v;
    },
  };
}

/** Armazenamento do Pix simulado em memória (o mesmo contrato do repositório do banco). */
export function cobrancasSimuladasEmMemoria(): CobrancasSimuladasRepo & { lista: CobrancaSimulada[] } {
  const lista: CobrancaSimulada[] = [];
  return {
    lista,
    async criar(c) {
      const existente = lista.find((x) => x.referencia === c.referencia);
      if (existente) return { ...existente };
      const nova: CobrancaSimulada = { ...c, status: "ativa", criadaEm: new Date().toISOString(), pagaEm: null, pagadorNome: null, endToEndId: null, estornadaEm: null };
      lista.push(nova);
      return { ...nova };
    },
    porReferencia: async (referencia) => {
      const c = lista.find((x) => x.referencia === referencia);
      return c ? { ...c } : null;
    },
    porTxid: async (txid) => {
      const c = lista.find((x) => x.txid === txid);
      return c ? { ...c } : null;
    },
    recentes: async (limite) => lista.slice(-limite).reverse().map((c) => ({ ...c })),
    async atualizar(referencia, de, mudanca) {
      const c = lista.find((x) => x.referencia === referencia);
      if (!c || c.status !== de) return false;
      Object.assign(c, mudanca);
      return true;
    },
  };
}

/**
 * Semeia uma conversa em que o cliente já informou tudo e o modelo já mostrou
 * o resumo (calcular_pedido com sucesso) — pré-requisito do finalizar_pedido.
 */
export async function semearResumo(
  repos: Repositorios,
  chat: { canal: Canal; chatId: string },
  args: { itens: unknown[]; tipo_entrega: string; endereco?: { bairro_id?: string } | null; forma_pagamento?: string },
  falaCliente = `Quero isso. Meu nome é Maria, telefone 11 98765-4321, Rua das Flores 42. Pago no ${args.forma_pagamento === "cartao" ? "cartão" : (args.forma_pagamento ?? "dinheiro")}, troco para 200`
) {
  const conversa = await repos.conversas.obterAtiva(chat.canal, chat.chatId, new Date(0));
  const calcular = { itens: args.itens, tipo_entrega: args.tipo_entrega, bairro_id: args.endereco?.bairro_id ?? null };
  await repos.conversas.adicionar(conversa, [
    { papel: "user", conteudo: falaCliente },
    { papel: "assistant", conteudo: null, toolCalls: [{ id: "resumo", nome: "calcular_pedido", argumentos: JSON.stringify(calcular) }] },
    { papel: "tool", toolCallId: "resumo", conteudo: JSON.stringify({ sucesso: true }) },
    { papel: "assistant", conteudo: "Resumo do pedido. Posso confirmar?" },
  ]);
}
