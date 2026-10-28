import { z } from "zod";
import {
  calcularPedidoArgsSchema,
  descreverErrosZod,
  finalizarPedidoArgsSchema,
  formatarReais,
  ROTULO_STATUS,
  type Canal,
  type CategoriaCardapio,
  type ClienteConhecido,
  type ConfiguracaoLoja,
  type ItemPedidoArgs,
  type MensagemConversa,
  type NovoPedido,
  type Repositorios,
  type TipoEntrega,
} from "@pizzaria/shared";
import { momentoLocal, type SituacaoLoja } from "../horario";
import type { DefinicaoTool } from "../llm/tipos";
import type { Logger } from "../logger";
import { descreverValores, montarNovoPedido } from "../pedido";
import type { CobrancaCriada } from "../pagamentos/gateway";
import type { ServicoPix } from "../pagamentos/pix";
import { cotarPedido, idsDeVariacao, type Cotacao, type ResultadoCotacao } from "../precificacao";
import { conferirDadosCliente, confirmaResumo, itensQueSairam, ultimaCotacao } from "./verificacao";

export const TOOL = {
  consultarCardapio: "consultar_cardapio",
  calcularPedido: "calcular_pedido",
  finalizarPedido: "finalizar_pedido",
  consultarStatus: "consultar_status_pedido",
  chamarAtendente: "chamar_atendente",
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
      "Única fonte de produtos, sabores, ingredientes (descrição), tamanhos, bordas, adicionais e preços disponíveis agora, com os IDs. O que não estiver aqui não existe na pizzaria. Chame antes de citar qualquer produto ou preço.",
    parametros: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    nome: TOOL.calcularPedido,
    descricao:
      "Valida os itens (IDs copiados de consultar_cardapio) e calcula os valores oficiais (itens, taxa de entrega e total). Obrigatório antes de citar qualquer total e antes de finalizar_pedido.",
    parametros: esquema(calcularPedidoArgsSchema),
  },
  {
    nome: TOOL.finalizarPedido,
    descricao:
      "Registra o pedido com exatamente os itens, a entrega/retirada e o bairro do último calcular_pedido (não é preciso repetir os itens). Só chame depois que o cliente confirmar esse resumo; se algo mudou, chame calcular_pedido de novo e peça nova confirmação. Nome, telefone, endereço e troco precisam ter sido informados pelo cliente (ou estar em Cliente): o servidor recusa dados sem origem.",
    parametros: esquema(finalizarPedidoArgsSchema),
  },
  {
    nome: TOOL.consultarStatus,
    descricao: "Consulta o status dos pedidos recentes deste cliente (últimos 3 dias).",
    parametros: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    nome: TOOL.chamarAtendente,
    descricao:
      "Passa a conversa para um atendente humano da pizzaria e você para de responder este cliente. Use quando o cliente pedir uma pessoa, reclamar de um pedido ou quando você não conseguir resolver.",
    parametros: {
      type: "object",
      properties: { motivo: { type: "string", description: "Resumo curto para o atendente, ex.: 'pedido #12 atrasado, cliente irritado'" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

export interface ContextoTools {
  canal: Canal;
  chatId: string;
  repos: Repositorios;
  config: ConfiguracaoLoja;
  situacao: SituacaoLoja;
  agora: Date;
  /** Pix online; ausente = não oferecido. */
  pix: ServicoPix | null;
  cardapio: () => Promise<CategoriaCardapio[]>;
  logger: Logger;
  /** Histórico + mensagens desta rodada, já com os resultados de tools anteriores. */
  mensagens: () => MensagemConversa[];
  cliente: ClienteConhecido | null;
  telefoneCanal: string | null;
  nomePerfil: string | null;
}

export interface PedidoCriado {
  id: string;
  numero: number;
  pedido: NovoPedido;
  /** Cobrança gerada quando o pagamento é Pix. */
  pix?: CobrancaCriada;
}

export interface ResultadoTool {
  /** JSON devolvido ao modelo. */
  conteudo: string;
  pedidoCriado?: PedidoCriado;
  /** A conversa passou para um humano: a IA para de responder este chat. */
  atendenteChamado?: boolean;
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
    tamanhos: ctx.config.tamanhos,
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

/** Erros da cotação para o modelo; ID errado ganha a instrução de como corrigir. */
function errosCotacao(erros: string[]): ResultadoTool {
  const idErrado = erros.some((e) => /não existe no cardápio|não pertence ao produto|ID inválido/.test(e));
  return json({
    sucesso: false,
    erros,
    ...(idErrado
      ? { como_corrigir: "Use só produto_id/variacao_id copiados do resultado de consultar_cardapio (chame consultar_cardapio agora se precisar) e tente de novo, sem incomodar o cliente." }
      : {}),
  });
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
      if (!args.success) return errosCotacao([`Dados inválidos: ${descreverErrosZod(args.error)}`]);

      const anterior = ultimaCotacao(ctx.mensagens());
      const resultado = await cotar(ctx, args.data.itens, args.data.tipo_entrega, args.data.bairro_id);
      if (!resultado.ok) return errosCotacao(resultado.erros);
      const sairam = itensQueSairam(anterior, args.data.itens);
      return json({
        sucesso: true,
        ...cotacaoParaModelo(resultado.cotacao),
        ...(sairam.length
          ? {
              atencao_itens_fora: sairam,
              atencao: "Estes itens estavam na cotação anterior e não estão nesta. Se o cliente não pediu para tirá-los, chame calcular_pedido de novo com o pedido inteiro antes de responder.",
            }
          : {}),
      });
    }

    case TOOL.finalizarPedido: {
      const fechada = lojaFechada(ctx);
      if (fechada) return fechada;
      const args = finalizarPedidoArgsSchema.safeParse(argumentos);
      if (!args.success) return erro(`Dados inválidos: ${descreverErrosZod(args.error)}`);
      if (args.data.forma_pagamento === "pix" && !ctx.pix) {
        return erro("Pix online não está disponível no momento; ofereça dinheiro ou cartão na entrega.");
      }

      // Registra exatamente o que o cliente viu e respondeu: o último resumo de calcular_pedido.
      const cotacaoMostrada = ultimaCotacao(ctx.mensagens());
      if (!cotacaoMostrada) {
        return erro("Pedido NÃO registrado: antes de finalizar, chame calcular_pedido, mostre o resumo ao cliente e espere ele confirmar.");
      }
      if (cotacaoMostrada.respostas.length === 0) {
        return erro("Pedido NÃO registrado: o cliente ainda não respondeu ao resumo. Mostre o resumo (resumo_valores) e pergunte se pode confirmar.");
      }
      const { itens, tipo_entrega, bairro_id } = cotacaoMostrada.args;
      const pedidoArgs = { ...args.data, itens, tipo_entrega, endereco: tipo_entrega === "entrega" ? (args.data.endereco ?? null) : null };
      if (tipo_entrega === "entrega") {
        if (!pedidoArgs.endereco) return erro("Pedido NÃO registrado: Endereço é obrigatório para entrega (rua, número e bairro).");
        if (pedidoArgs.endereco.bairro_id !== bairro_id) {
          return erro("Pedido NÃO registrado: o bairro do endereço é diferente do usado no resumo. Chame calcular_pedido agora com o bairro certo, mostre o novo resumo e peça confirmação.");
        }
      }
      // Os dados do pedido precisam ter sido ditos ANTES do resumo (que o cliente confirma com tudo).
      const fontesCliente = { config: ctx.config, telefoneCanal: ctx.telefoneCanal, cliente: ctx.cliente, nomePerfil: ctx.nomePerfil };
      const semOrigem = conferirDadosCliente(pedidoArgs, { ...fontesCliente, mensagens: cotacaoMostrada.antes });
      if (semOrigem.length) {
        const ditoDepois = conferirDadosCliente(pedidoArgs, { ...fontesCliente, mensagens: ctx.mensagens() }).length === 0;
        return erro(
          ditoDepois
            ? "Pedido NÃO registrado: o cliente passou dados (pagamento, troco, nome ou endereço) depois do resumo. Chame calcular_pedido agora, nesta mesma resposta (com o pedido inteiro), mostre o resumo final com todos os dados e peça confirmação."
            : `Pedido NÃO registrado. ${semOrigem.join(" ")}`
        );
      }
      if (!confirmaResumo(cotacaoMostrada.respostas)) {
        return erro(
          `Pedido NÃO registrado: o cliente não confirmou o resumo (última mensagem: "${cotacaoMostrada.respostas.at(-1)!.slice(0, 120)}"). Responda ao que ele disse; se ele mudou ou acrescentou algo, chame calcular_pedido com o pedido inteiro e peça confirmação. Só finalize depois de um "sim".`
        );
      }

      const resultado = await cotar(ctx, itens, tipo_entrega, pedidoArgs.endereco?.bairro_id);
      if (!resultado.ok) return errosCotacao(resultado.erros);

      const montagem = montarNovoPedido({
        canal: ctx.canal,
        chatId: ctx.chatId,
        args: pedidoArgs,
        cotacao: resultado.cotacao,
      });
      if (!montagem.ok) return erro(montagem.erro);

      const criado = await ctx.repos.pedidos.criar(montagem.pedido);
      ctx.logger.info(
        { pedidoId: criado.id, numero: criado.numero, total: montagem.pedido.totalCentavos },
        "Pedido criado"
      );

      let pix: CobrancaCriada | undefined;
      if (montagem.pedido.formaPagamento === "pix" && ctx.pix) {
        try {
          pix = await ctx.pix.gerarCobranca({
            pedidoId: criado.id,
            numero: criado.numero,
            totalCentavos: montagem.pedido.totalCentavos,
            nomePizzaria: ctx.config.nomePizzaria,
            expiracaoMinutos: ctx.config.pixExpiracaoMinutos,
          });
        } catch (err) {
          // Sem cobrança o pedido não vale: descarta (sem notificar) e deixa o modelo oferecer outra forma.
          ctx.logger.error({ err, pedidoId: criado.id }, "Falha ao gerar Pix; pedido descartado");
          await ctx.repos.pedidos.descartarAguardandoPagamento(criado.id);
          return erro(
            "Não foi possível gerar o Pix agora (instabilidade no banco). O pedido NÃO foi registrado. Peça desculpas e ofereça pagar em dinheiro ou cartão na entrega, ou tentar o Pix de novo em instantes."
          );
        }
      }

      return {
        conteudo: JSON.stringify({ sucesso: true, numero: criado.numero }),
        pedidoCriado: { ...criado, pedido: montagem.pedido, ...(pix ? { pix } : {}) },
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

    case TOOL.chamarAtendente: {
      const motivo = typeof (argumentos as { motivo?: unknown })?.motivo === "string" ? (argumentos as { motivo: string }).motivo.trim() : "";
      await ctx.repos.atendimento.pausar(ctx.canal, ctx.chatId, { motivo: motivo || "Cliente precisa de atendimento", por: "ia" });
      ctx.logger.info({ canal: ctx.canal, chatId: ctx.chatId, motivo }, "Conversa passada para atendente humano");
      return { conteudo: JSON.stringify({ sucesso: true }), atendenteChamado: true };
    }

    default:
      return erro(`Ferramenta desconhecida: ${nome}`);
  }
}
