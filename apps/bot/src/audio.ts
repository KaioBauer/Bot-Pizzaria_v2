import { dicaTranscricao, PREFIXO_AUDIO, type Transcritor } from "@pizzaria/core";
import type { Repositorios } from "@pizzaria/shared";
import type { Logger } from "pino";
import type { ChannelAdapter, MensagemCanal } from "./canais/tipos";

export const MENSAGEM_AUDIO_DESLIGADO = "Por enquanto eu não consigo ouvir áudios 🙂 Pode escrever o que deseja?";
export const MENSAGEM_AUDIO_LONGO = "Esse áudio ficou um pouco longo para mim 😅 Pode mandar um mais curto ou escrever o pedido?";
export const MENSAGEM_AUDIO_FALHOU = "Não consegui entender esse áudio 😕 Pode repetir ou escrever o que deseja?";
/** Vai para o histórico/painel quando a IA está pausada e o áudio não pôde ser transcrito. */
const AUDIO_SEM_TRANSCRICAO = "[áudio recebido — não foi possível transcrever]";

export interface OpcoesPreparador {
  /** null = transcrição desligada. */
  transcritor: Transcritor | null;
  canais: ReadonlyMap<string, ChannelAdapter>;
  repos: Pick<Repositorios, "cardapio" | "loja" | "atendimento">;
  duracaoMaximaSegundos: number;
  logger: Logger;
}

/**
 * Transforma a mensagem do canal em texto para o agente. Áudio é baixado e
 * transcrito aqui (dentro da fila do chat); o texto chega ao agente com
 * `PREFIXO_AUDIO`, para o modelo confirmar o que entendeu. Se não der,
 * avisa o cliente e devolve null.
 */
export function criarPreparadorMensagens(opcoes: OpcoesPreparador) {
  const { logger } = opcoes;
  let dica: { texto: string; validoAte: number } | null = null;

  async function obterDica(): Promise<string | undefined> {
    if (dica && dica.validoAte > Date.now()) return dica.texto;
    try {
      const [config, categorias] = await Promise.all([opcoes.repos.loja.configuracao(), opcoes.repos.cardapio.ativo()]);
      dica = { texto: dicaTranscricao(config.nomePizzaria, categorias), validoAte: Date.now() + 5 * 60_000 };
      return dica.texto;
    } catch (err) {
      logger.warn({ err }, "Sem dica de vocabulário para a transcrição");
      return undefined;
    }
  }

  return async function preparar(mensagem: MensagemCanal): Promise<string | null> {
    if (mensagem.texto !== undefined) return mensagem.texto;
    const canal = opcoes.canais.get(mensagem.canal);
    const pausada = await opcoes.repos.atendimento.iaPausada(mensagem.canal, mensagem.chatId).catch(() => false);
    const recusar = async (resposta: string): Promise<string | null> => {
      // Com atendente humano no chat, quem responde é ele: o áudio aparece no painel.
      if (pausada) return AUDIO_SEM_TRANSCRICAO;
      await canal?.sendMessage(mensagem.chatId, resposta).catch((err: unknown) => logger.error({ err }, "Falha ao responder áudio"));
      return null;
    };

    if (!opcoes.transcritor) return recusar(MENSAGEM_AUDIO_DESLIGADO);
    const duracao = mensagem.audio.duracaoSegundos;
    if (duracao !== null && duracao > opcoes.duracaoMaximaSegundos) return recusar(MENSAGEM_AUDIO_LONGO);

    if (!pausada) void canal?.indicarDigitando?.(mensagem.chatId);
    const inicio = Date.now();
    try {
      const audio = await mensagem.audio.baixar();
      const texto = (await opcoes.transcritor.transcrever(audio, await obterDica())).replace(/\s+/g, " ").trim();
      if (!texto) return recusar(MENSAGEM_AUDIO_FALHOU);
      logger.info({ canal: mensagem.canal, chatId: mensagem.chatId, segundos: duracao, ms: Date.now() - inicio, caracteres: texto.length }, "Áudio transcrito");
      return `${PREFIXO_AUDIO} ${texto}`;
    } catch (err) {
      logger.error({ err, canal: mensagem.canal, chatId: mensagem.chatId }, "Falha ao transcrever áudio");
      return recusar(MENSAGEM_AUDIO_FALHOU);
    }
  };
}
