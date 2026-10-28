import type { MensagemEntrada } from "@pizzaria/core";
import type { MensagemCanal } from "./canais/tipos";

/**
 * Processa as mensagens de cada chat em série (nunca duas ao mesmo tempo
 * para o mesmo cliente) e junta as que chegam enquanto uma está sendo
 * processada: "quero" / "uma calabresa" / "grande" viram uma única entrada,
 * com uma única resposta. Chats diferentes rodam em paralelo.
 *
 * `preparar` transforma a mensagem do canal em texto (ex.: transcreve áudio),
 * já dentro da fila do chat, para manter a ordem. null = descartar (quem
 * prepara já avisou o cliente).
 */
export function criarProcessadorPorChat(
  processar: (mensagem: MensagemEntrada) => Promise<void>,
  preparar: (mensagem: MensagemCanal) => Promise<string | null> = async (m) => m.texto ?? null
) {
  const pendentes = new Map<string, MensagemCanal[]>();
  const emAndamento = new Map<string, Promise<void>>();

  async function drenar(chave: string): Promise<void> {
    for (;;) {
      const lote = pendentes.get(chave);
      if (!lote?.length) break;
      pendentes.delete(chave);
      const textos: string[] = [];
      for (const mensagem of lote) {
        const texto = await preparar(mensagem).catch(() => null);
        if (texto?.trim()) textos.push(texto);
      }
      if (textos.length === 0) continue;
      const { audio: _audio, ...ultima } = lote[lote.length - 1]!;
      await processar({ ...ultima, texto: textos.join("\n") }).catch(() => undefined);
    }
    emAndamento.delete(chave);
  }

  return {
    receber(mensagem: MensagemCanal): void {
      const chave = `${mensagem.canal}:${mensagem.chatId}`;
      const fila = pendentes.get(chave) ?? [];
      fila.push(mensagem);
      pendentes.set(chave, fila);
      if (!emAndamento.has(chave)) emAndamento.set(chave, drenar(chave));
    },

    /** Resolve quando não há mais nada em processamento (desligamento). */
    async ocioso(): Promise<void> {
      while (emAndamento.size > 0) await Promise.all(emAndamento.values());
    },
  };
}
