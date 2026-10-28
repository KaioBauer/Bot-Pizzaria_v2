import OpenAI, { toFile } from "openai";
import type { CategoriaCardapio } from "@pizzaria/shared";

/**
 * Transcrição de áudio (pedido por mensagem de voz). Como o `LlmProvider`, o
 * resto do sistema só conhece esta interface, não o SDK.
 */
export interface AudioParaTranscrever {
  conteudo: Buffer;
  /** Ex.: "audio/ogg; codecs=opus" (WhatsApp). */
  mime: string;
}

export interface Transcritor {
  /**
   * `dica`: vocabulário esperado (nome da pizzaria, sabores, tamanhos) para o
   * modelo acertar a grafia dos itens do cardápio.
   */
  transcrever(audio: AudioParaTranscrever, dica?: string): Promise<string>;
}

/** Limite da API de transcrição da OpenAI. */
export const TAMANHO_MAXIMO_AUDIO = 25 * 1024 * 1024;

const EXTENSOES: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "video/mp4": "mp4",
};

/** Nome de arquivo com a extensão certa: a API identifica o formato por ela. */
export function nomeArquivoAudio(mime: string): string {
  const tipo = mime.split(";")[0]!.trim().toLowerCase();
  return `audio.${EXTENSOES[tipo] ?? "ogg"}`;
}

/**
 * Dica de vocabulário a partir do cardápio. O Whisper só considera o fim do
 * prompt (~224 tokens), então fica curta: nomes de produtos e de variações.
 */
export function dicaTranscricao(nomePizzaria: string, categorias: CategoriaCardapio[], maxCaracteres = 700): string {
  const produtos = categorias.flatMap((c) => c.produtos.map((p) => p.nome));
  const variacoes = [...new Set(categorias.flatMap((c) => c.produtos.flatMap((p) => p.variacoes.map((v) => v.nome))))].filter(
    (n) => !/^(unico|único|padrao|padrão)$/i.test(n)
  );
  let dica = `Pedido de pizza por mensagem de voz para a ${nomePizzaria}. Tamanhos e opções: ${variacoes.join(", ")}. Sabores e produtos: `;
  for (const nome of produtos) {
    if (dica.length + nome.length + 2 > maxCaracteres) break;
    dica += `${nome}, `;
  }
  return `${dica.replace(/,\s*$/, "")}.`;
}

export interface OpcoesTranscritorOpenAi {
  apiKey: string;
  /** whisper-1 (padrão) ou gpt-4o-mini-transcribe / gpt-4o-transcribe. */
  modelo?: string;
  timeoutMs?: number;
}

export function criarTranscritorOpenAi(opcoes: OpcoesTranscritorOpenAi): Transcritor {
  const cliente = new OpenAI({ apiKey: opcoes.apiKey, timeout: opcoes.timeoutMs ?? 60_000, maxRetries: 2 });
  const modelo = opcoes.modelo ?? "whisper-1";
  return {
    async transcrever(audio, dica) {
      if (audio.conteudo.length > TAMANHO_MAXIMO_AUDIO) throw new Error("Áudio maior que o limite da transcrição (25 MB)");
      const resposta = await cliente.audio.transcriptions.create({
        file: await toFile(audio.conteudo, nomeArquivoAudio(audio.mime), { type: audio.mime.split(";")[0]!.trim() }),
        model: modelo,
        language: "pt",
        temperature: 0,
        response_format: "json",
        ...(dica ? { prompt: dica } : {}),
      });
      return resposta.text.trim();
    },
  };
}
