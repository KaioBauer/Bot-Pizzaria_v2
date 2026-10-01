import type {
  CategoriaCardapio,
  ConfiguracaoLoja,
  MensagemConversa,
  NovoPedido,
  Repositorios,
  VariacaoParaPreco,
} from "@pizzaria/shared";
import type { LlmProvider, RequisicaoLlm, RespostaLlm } from "../llm/tipos";

/** Repositórios em memória para testar o agente sem banco. */
export function repositoriosEmMemoria(params: {
  variacoes: Map<string, VariacaoParaPreco>;
  config: ConfiguracaoLoja;
  cardapio?: CategoriaCardapio[];
}) {
  const pedidos: Array<NovoPedido & { id: string; numero: number }> = [];
  const conversas = new Map<string, { mensagens: MensagemConversa[]; encerrada: boolean; pedidoId: string | null }>();
  let sequencia = 0;

  const repos: Repositorios = {
    cardapio: {
      ativo: async () => params.cardapio ?? [],
      variacoesPorIds: async (ids) => ids.flatMap((id) => params.variacoes.get(id) ?? []),
    },
    loja: { configuracao: async () => params.config },
    clientes: { buscar: async () => null },
    pedidos: {
      criar: async (pedido) => {
        const criado = { ...pedido, id: `pedido-${pedidos.length + 1}`, numero: pedidos.length + 1 };
        pedidos.push(criado);
        return { id: criado.id, numero: criado.numero };
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
  };

  return { repos, pedidos, conversas };
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
