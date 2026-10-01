import { z } from "zod";
import {
  calcularPedidoArgsSchema,
  descreverErrosZod,
  finalizarPedidoArgsSchema,
  formatarReais,
  ROTULO_STATUS,
  type Canal,
  type CategoriaCardapio,
  type ConfiguracaoLoja,
  type ItemPedidoArgs,
  type NovoPedido,
  type Repositorios,
  type TipoEntrega,
} from "@pizzaria/shared";
import { momentoLocal, type SituacaoLoja } from "../horario";
import type { DefinicaoTool } from "../llm/tipos";
import type { Logger } from "../logger";
import { descreverValores, montarNovoPedido } from "../pedido";
import { cotarPedido, idsDeVariacao, type Cotacao, type ResultadoCotacao } from "../precificacao";

export const TOOL = {
  consultarCardapio: "consultar_cardapio",
  calcularPedido: "calcular_pedido",
  finalizarPedido: "finalizar_pedido",
  consultarStatus: "consultar_status_pedido",
} as const;

/** Remove chaves que só custam tokens (a validação real é feita pelo Zod no servidor). */
function enxugar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(enxugar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([chave]) => chave !== "pattern" && chave !== "$schema")
        .map(([chave, v]) => [chave, enxugar(v)])
    );
  }
  return valor;
}

function esquema(schema: z.ZodType): Record<string, unknown> {
  return enxugar(z.toJSONSchema(schema, { io: "input" })) as Record<string, unknown>;
}

export const DEFINICOES_TOOLS: DefinicaoTool[] = [
  {
    nome: TOOL.consultarCardapio,
    descricao:
      "Lista os produtos disponíveis agora, por categoria, com variações (tamanho, borda, adicional, padrão), IDs e preços.",
    parametros: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    nome: TOOL.calcularPedido,
    descricao:
      "Valida os itens e calcula os valores oficiais (itens, taxa de entrega e total). Use antes de mostrar o resumo ao cliente.",
    parametros: esquema(calcularPedidoArgsSchema),
  },
  {
    nome: TOOL.finalizarPedido,
    descricao:
      "Registra o pedido. Só chame depois que o cliente confirmar explicitamente o resumo com o total.",
    parametros: esquema(finalizarPedidoArgsSchema),
  },
  {
    nome: TOOL.consultarStatus,
    descricao: "Consulta o status dos pedidos recentes deste cliente (últimos 3 dias).",
    parametros: { type: "object", properties: {}, additionalProperties: false },
  },
];

export interface ContextoTools {
  canal: Canal;
  chatId: string;
  repos: Repositorios;
  config: ConfiguracaoLoja;
  situacao: SituacaoLoja;
  agora: Date;
  pixDisponivel: boolean;
  cardapio: () => Promise<CategoriaCardapio[]>;
  logger: Logger;
}

export interface PedidoCriado {
  id: string;
  numero: number;
  pedido: NovoPedido;
}

export interface ResultadoTool {
  /** JSON devolvido ao modelo. */
  conteudo: string;
  pedidoCriado?: PedidoCriado;
}

const json = (valor: unknown): ResultadoTool => ({ conteudo: JSON.stringify(valor) });
const erro = (mensagem: string): ResultadoTool => json({ sucesso: false, erro: mensagem });

function lojaFechada(ctx: ContextoTools): ResultadoTool | null {
  if (ctx.situacao.aberta) return null;
  return erro(
    "A loja está fechada agora e não pode receber pedidos. Informe o horário de funcionamento ao cliente."
  );
}

async function cotar(
  ctx: ContextoTools,
  itens: ItemPedidoArgs[],
  tipoEntrega: TipoEntrega,
  bairroId: string | null | undefined
): Promise<ResultadoCotacao> {
  const variacoes = await ctx.repos.cardapio.variacoesPorIds(idsDeVariacao(itens));
  return cotarPedido({
    itens,
    variacoes: new Map(variacoes.map((v) => [v.id, v])),
    tipoEntrega,
    bairroId,
    bairros: ctx.config.bairros,
    pedidoMinimoCentavos: ctx.config.pedidoMinimoCentavos,
  });
}

function cotacaoParaModelo(cotacao: Cotacao) {
  return {
    itens: cotacao.itens.map((item) => ({
      descricao: item.descricao,
      quantidade: item.quantidade,
      observacao: item.observacao,
      preco_unitario: formatarReais(item.precoUnitarioCentavos),
      subtotal: formatarReais(item.subtotalCentavos),
    })),
    subtotal: formatarReais(cotacao.subtotalCentavos),
    taxa_entrega: formatarReais(cotacao.taxaEntregaCentavos),
    total: formatarReais(cotacao.totalCentavos),
    bairro: cotacao.bairro?.nome ?? null,
    /** Bloco pronto para copiar no resumo ao cliente. */
    resumo_valores: descreverValores(cotacao),
  };
}

function lerArgumentos(bruto: string): unknown {
  try {
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return Symbol.for("json-invalido");
  }
}

export async function executarTool(
  nome: string,
  argumentosBrutos: string,
  ctx: ContextoTools
): Promise<ResultadoTool> {
  const argumentos = lerArgumentos(argumentosBrutos);
  if (typeof argumentos === "symbol") return erro("Argumentos em JSON inválido; tente novamente.");

  switch (nome) {
    case TOOL.consultarCardapio: {
      const categorias = await ctx.cardapio();
      return json({
        categorias: categorias.map((categoria) => ({
          categoria: categoria.nome,
          produtos: categoria.produtos.map((produto) => ({
            produto_id: produto.id,
            nome: produto.nome,
            descricao: produto.descricao,
            variacoes: produto.variacoes.map((v) => ({
              variacao_id: v.id,
              nome: v.nome,
              tipo: v.tipo,
              preco: formatarReais(v.precoCentavos),
            })),
          })),
        })),
      });
    }

    case TOOL.calcularPedido: {
      const fechada = lojaFechada(ctx);
      if (fechada) return fechada;
      const args = calcularPedidoArgsSchema.safeParse(argumentos);
      if (!args.success) return erro(`Dados inválidos: ${descreverErrosZod(args.error)}`);

      const resultado = await cotar(ctx, args.data.itens, args.data.tipo_entrega, args.data.bairro_id);
      if (!resultado.ok) return json({ sucesso: false, erros: resultado.erros });
      return json({ sucesso: true, ...cotacaoParaModelo(resultado.cotacao) });
    }

    case TOOL.finalizarPedido: {
      const fechada = lojaFechada(ctx);
      if (fechada) return fechada;
      const args = finalizarPedidoArgsSchema.safeParse(argumentos);
      if (!args.success) return erro(`Dados inválidos: ${descreverErrosZod(args.error)}`);
      if (args.data.forma_pagamento === "pix" && !ctx.pixDisponivel) {
        return erro("Pix online não está disponível no momento; ofereça dinheiro ou cartão na entrega.");
      }

      const resultado = await cotar(
        ctx,
        args.data.itens,
        args.data.tipo_entrega,
        args.data.endereco?.bairro_id
      );
      if (!resultado.ok) return json({ sucesso: false, erros: resultado.erros });

      const montagem = montarNovoPedido({
        canal: ctx.canal,
        chatId: ctx.chatId,
        args: args.data,
        cotacao: resultado.cotacao,
      });
      if (!montagem.ok) return erro(montagem.erro);

      const criado = await ctx.repos.pedidos.criar(montagem.pedido);
      ctx.logger.info(
        { pedidoId: criado.id, numero: criado.numero, total: montagem.pedido.totalCentavos },
        "Pedido criado"
      );
      return {
        conteudo: JSON.stringify({ sucesso: true, numero: criado.numero }),
        pedidoCriado: { ...criado, pedido: montagem.pedido },
      };
    }

    case TOOL.consultarStatus: {
      const desde = new Date(ctx.agora.getTime() - 3 * 24 * 60 * 60 * 1000);
      const pedidos = await ctx.repos.pedidos.recentesDoChat(ctx.canal, ctx.chatId, desde);
      if (pedidos.length === 0) return json({ pedidos: [], mensagem: "Nenhum pedido recente." });
      return json({
        pedidos: pedidos.map((p) => ({
          numero: p.numero,
          status: ROTULO_STATUS[p.status],
          tipo: p.tipoEntrega,
          total: formatarReais(p.totalCentavos),
          feito_em: momentoLocal(new Date(p.criadoEm), ctx.config.fusoHorario).texto,
        })),
      });
    }

    default:
      return erro(`Ferramenta desconhecida: ${nome}`);
  }
}
