import type { FastifyInstance } from "fastify";
import type { MensagemEntrada } from "@pizzaria/core";
import type { Canal } from "@pizzaria/shared";

export interface OpcoesEnvio {
  literal?: boolean;
  botao?: { texto: string; url: string };
}

/** Mensagem de voz/áudio: baixada e transcrita só na hora de processar (na ordem do chat). */
export interface AudioRecebido {
  duracaoSegundos: number | null;
  baixar(): Promise<{ conteudo: Buffer; mime: string }>;
}

/** O que o canal entrega: texto, ou áudio ainda não transcrito. */
export type MensagemCanal = Omit<MensagemEntrada, "texto"> &
  ({ texto: string; audio?: undefined } | { texto?: undefined; audio: AudioRecebido });

export type ManipuladorMensagem = (mensagem: MensagemCanal) => void;

export interface Imagem {
  conteudo: Buffer;
  tipoMime: "image/png" | "image/jpeg";
  legenda?: string;
}

/**
 * Contrato comum dos canais. O adaptador só traduz: mensagem do canal ->
 * `MensagemEntrada` e texto/imagem -> API do canal. Nenhuma regra de negócio.
 */
export interface ChannelAdapter {
  readonly canal: Canal;
  /**
   * Registra quem trata as mensagens recebidas. O manipulador não é
   * aguardado: o adaptador responde ao canal (webhook) imediatamente.
   */
  onMessage(manipulador: ManipuladorMensagem): void;
  /**
   * `literal`: envia sem interpretar formatação (ex.: código Pix copia e cola, que contém "*").
   * `botao`: link em destaque (Telegram: botão abaixo da mensagem; WhatsApp: prévia do link).
   */
  sendMessage(chatId: string, texto: string, opcoes?: OpcoesEnvio): Promise<void>;
  sendImage?(chatId: string, imagem: Imagem): Promise<void>;
  /** Indicador de "digitando..." enquanto o agente pensa. */
  indicarDigitando?(chatId: string): Promise<void>;
  /** Registra rotas de webhook no servidor e/ou inicia polling. */
  iniciar(servidor: FastifyInstance): Promise<void>;
  parar(): Promise<void>;
}

/** Divide textos longos respeitando quebras de linha (limite do canal). */
export function dividirTexto(texto: string, limite: number): string[] {
  if (texto.length <= limite) return [texto];
  const partes: string[] = [];
  let atual = "";
  for (const linha of texto.split("\n")) {
    if (atual && atual.length + linha.length + 1 > limite) {
      partes.push(atual);
      atual = "";
    }
    if (linha.length > limite) {
      for (let i = 0; i < linha.length; i += limite) partes.push(linha.slice(i, i + limite));
      continue;
    }
    atual = atual ? `${atual}\n${linha}` : linha;
  }
  if (atual) partes.push(atual);
  return partes;
}
