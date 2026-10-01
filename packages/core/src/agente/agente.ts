import type { Canal, ChamadaTool, MensagemConversa, Repositorios } from "@pizzaria/shared";
import { cacheComValidade } from "../cache";
import { normalizarFormatacao } from "../formatacao";
import { momentoLocal, proximaAbertura, situacaoLoja } from "../horario";
import type { LlmProvider } from "../llm/tipos";
import { loggerSilencioso, type Logger } from "../logger";
import type { ServicoPix } from "../pagamentos/pix";
import { mensagemPedidoConfirmado, mensagemPedidoPix } from "../pedido";
import { montarPromptSistema } from "./prompt";
import {
  DEFINICOES_TOOLS,
  executarTool,
  type ContextoTools,
  type PedidoCriado,
  type ResultadoTool,
} from "./tools";

/** Mensagem recebida de qualquer canal, já em formato neutro. */
export interface MensagemEntrada {
  canal: Canal;
  chatId: string;
  clienteNome?: string | null;
  /** Telefone conhecido pelo canal (WhatsApp); null no Telegram. */
  telefone?: string | null;
  texto: string;
}

/** Conteúdo enviado depois do texto principal (ex.: QR Code e copia-e-cola do Pix). */
export type Anexo =
  | { tipo: "imagem"; base64: string; mime: "image/png" | "image/jpeg"; legenda?: string }
  | { tipo: "texto"; texto: string };

export interface RespostaAgente {
  texto: string;
  anexos?: Anexo[];
  pedido?: PedidoCriado;
}

export interface OpcoesAgente {
  /** Máximo de mensagens do histórico enviadas ao modelo. */
  limiteHistorico?: number;
  /** Conversa parada há mais que isso recomeça do zero. */
  expiracaoConversaMinutos?: number;
  /** Máximo de rodadas de tool calls por mensagem do cliente. */
  maxRodadas?: number;
  /** Validade do cache de cardápio e configurações. */
  validadeCacheMs?: number;
}

export interface DependenciasAgente {
  repos: Repositorios;
  llm: LlmProvider;
  logger?: Logger;
  agora?: () => Date;
  /** Pix online (gateway configurado). Ausente = Pix não é oferecido. */
  pix?: ServicoPix;
  opcoes?: OpcoesAgente;
}

export const MENSAGEM_ERRO =
  "Desculpe, tive um probleminha aqui 😕 Pode mandar sua mensagem de novo em instantes?";
const MENSAGEM_NAO_ENTENDI = "Desculpe, não entendi. Pode repetir, por favor?";
const MAX_CARACTERES_ENTRADA = 2000;

/** Descarta o início do histórico até a primeira mensagem do cliente, para
 * nunca enviar ao modelo um resultado de tool sem a chamada correspondente. */
export function recortarHistorico(mensagens: MensagemConversa[]): MensagemConversa[] {
  const inicio = mensagens.findIndex((m) => m.papel === "user");
  return inicio === -1 ? [] : mensagens.slice(inicio);
}

export function criarAgente(deps: DependenciasAgente) {
  const logger = deps.logger ?? loggerSilencioso;
  const agora = deps.agora ?? (() => new Date());
  const limiteHistorico = deps.opcoes?.limiteHistorico ?? 40;
  const expiracaoMs = (deps.opcoes?.expiracaoConversaMinutos ?? 180) * 60_000;
  const maxRodadas = deps.opcoes?.maxRodadas ?? 6;
  const validadeCache = deps.opcoes?.validadeCacheMs ?? 30_000;

  const cardapio = cacheComValidade(() => deps.repos.cardapio.ativo(), validadeCache);
  const configuracao = cacheComValidade(() => deps.repos.loja.configuracao(), validadeCache);

  async function executarComSeguranca(chamada: ChamadaTool, ctx: ContextoTools): Promise<ResultadoTool> {
    try {
      const resultado = await executarTool(chamada.nome, chamada.argumentos, ctx);
      logger.debug({ tool: chamada.nome, resultado: resultado.conteudo.slice(0, 500) }, "Tool executada");
      return resultado;
    } catch (err) {
      logger.error({ err, tool: chamada.nome }, "Falha ao executar tool");
      return {
        conteudo: JSON.stringify({
          sucesso: false,
          erro: "Falha temporária no sistema. Peça desculpas ao cliente e sugira tentar de novo em instantes.",
        }),
      };
    }
  }

  async function persistir(conversaId: string, mensagens: MensagemConversa[], pedidoId?: string) {
    await deps.repos.conversas.adicionar(conversaId, mensagens);
    if (pedidoId) await deps.repos.conversas.encerrar(conversaId, pedidoId);
  }

  async function processar(entrada: MensagemEntrada): Promise<RespostaAgente> {
    const instante = agora();
    const { canal, chatId } = entrada;

    const [config, conversaId, cliente] = await Promise.all([
      configuracao(),
      deps.repos.conversas.obterAtiva(canal, chatId, new Date(instante.getTime() - expiracaoMs)),
      deps.repos.clientes.buscar(canal, chatId),
    ]);
    const historico = recortarHistorico(
      await deps.repos.conversas.mensagens(conversaId, limiteHistorico)
    );
    const situacao = situacaoLoja(config, instante);
    const pixDisponivel = Boolean(deps.pix);

    const sistema = montarPromptSistema({
      config,
      situacao,
      agoraTexto: momentoLocal(instante, config.fusoHorario).texto,
      canal,
      clienteNomePerfil: entrada.clienteNome ?? null,
      telefoneCanal: entrada.telefone ?? null,
      cliente,
      pixDisponivel,
      proximaAbertura: situacao.aberta ? null : proximaAbertura(config.horarios, instante, config.fusoHorario),
    });

    const ctx: ContextoTools = {
      canal,
      chatId,
      repos: deps.repos,
      config,
      situacao,
      agora: instante,
      pix: deps.pix ?? null,
      cardapio,
      logger,
    };

    const novas: MensagemConversa[] = [
      { papel: "user", conteudo: entrada.texto.trim().slice(0, MAX_CARACTERES_ENTRADA) },
    ];

    for (let rodada = 0; rodada < maxRodadas; rodada++) {
      const resposta = await deps.llm.completar({
        sistema,
        mensagens: [...historico, ...novas],
        tools: DEFINICOES_TOOLS,
      });

      if (resposta.toolCalls.length === 0) {
        const texto = normalizarFormatacao(resposta.conteudo ?? "") || MENSAGEM_NAO_ENTENDI;
        novas.push({ papel: "assistant", conteudo: texto });
        await persistir(conversaId, novas);
        return { texto };
      }

      novas.push({ papel: "assistant", conteudo: resposta.conteudo, toolCalls: resposta.toolCalls });

      let pedidoCriado: PedidoCriado | undefined;
      for (const chamada of resposta.toolCalls) {
        // Toda tool call precisa de resposta, mesmo as ignoradas.
        const resultado = pedidoCriado
          ? { conteudo: JSON.stringify({ sucesso: false, erro: "Pedido já finalizado." }) }
          : await executarComSeguranca(chamada, ctx);
        novas.push({ papel: "tool", toolCallId: chamada.id, conteudo: resultado.conteudo });
        pedidoCriado ??= resultado.pedidoCriado;
      }

      if (pedidoCriado) {
        const { pix } = pedidoCriado;
        const texto = pix
          ? mensagemPedidoPix(pedidoCriado.pedido, pedidoCriado.numero, momentoLocal(pix.expiraEm, config.fusoHorario).texto.slice(-5))
          : mensagemPedidoConfirmado(pedidoCriado.pedido, pedidoCriado.numero);
        const anexos: Anexo[] = pix
          ? [
              { tipo: "imagem", base64: pix.qrCodeBase64, mime: "image/png", legenda: `QR Code do Pix — pedido #${pedidoCriado.numero}. Copia e cola na próxima mensagem 👇` },
              { tipo: "texto", texto: pix.qrCode },
            ]
          : [];
        novas.push({ papel: "assistant", conteudo: texto });
        // O pedido já existe: uma falha aqui não pode virar mensagem de erro
        // (o cliente poderia pedir de novo e duplicar).
        await persistir(conversaId, novas, pedidoCriado.id).catch((err: unknown) =>
          logger.error({ err, pedidoId: pedidoCriado.id }, "Falha ao encerrar conversa após pedido")
        );
        return { texto, pedido: pedidoCriado, ...(anexos.length ? { anexos } : {}) };
      }
    }

    logger.warn({ canal, chatId }, "Limite de rodadas de tools atingido");
    novas.push({ papel: "assistant", conteudo: MENSAGEM_NAO_ENTENDI });
    await persistir(conversaId, novas);
    return { texto: MENSAGEM_NAO_ENTENDI };
  }

  return {
    /** Nunca lança: qualquer falha vira uma resposta amigável ao cliente. */
    async processarMensagem(entrada: MensagemEntrada): Promise<RespostaAgente> {
      try {
        return await processar(entrada);
      } catch (err) {
        logger.error({ err, canal: entrada.canal, chatId: entrada.chatId }, "Falha ao processar mensagem");
        return { texto: MENSAGEM_ERRO };
      }
    },
  };
}

export type Agente = ReturnType<typeof criarAgente>;
