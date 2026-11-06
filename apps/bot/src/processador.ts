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
 *
 * Espera o cliente terminar de digitar: antes de responder, aguarda
 * `esperaMs` sem mensagem nova daquele chat (cada mensagem reinicia a conta),
 * no máximo `esperaMaximaMs` desde a primeira do lote.
 */
export function criarProcessadorPorChat(
  processar: (mensagem: MensagemEntrada) => Promise<void>,
  preparar: (mensagem: MensagemCanal) => Promise<string | null> = async (m) => m.texto ?? null,
  opcoes: { esperaMs?: number; esperaMaximaMs?: number } = {}
) {
  const esperaMs = opcoes.esperaMs ?? 0;
  const esperaMaximaMs = Math.max(esperaMs, opcoes.esperaMaximaMs ?? esperaMs);
  const pendentes = new Map<string, MensagemCanal[]>();
  const emAndamento = new Map<string, Promise<void>>();
  /** Momento da primeira e da última mensagem do lote pendente de cada chat. */
  const chegadas = new Map<string, { primeira: number; ultima: number }>();

  async function aguardarSilencio(chave: string): Promise<void> {
    if (esperaMs <= 0) return;
    for (;;) {
      const c = chegadas.get(chave);
      if (!c) return;
      const agora = Date.now();
      const falta = Math.min(c.ultima + esperaMs - agora, c.primeira + esperaMaximaMs - agora);
      if (falta <= 0) return;
      await new Promise((ok) => setTimeout(ok, falta));
    }
  }

  async function drenar(chave: string): Promise<void> {
    for (;;) {
      if (esperaMs > 0) await aguardarSilencio(chave);
      chegadas.delete(chave);
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
      const agora = Date.now();
      const c = chegadas.get(chave);
      chegadas.set(chave, { primeira: c?.primeira ?? agora, ultima: agora });
      if (!emAndamento.has(chave)) emAndamento.set(chave, drenar(chave));
    },

    /** Resolve quando não há mais nada em processamento (desligamento). */
    async ocioso(): Promise<void> {
      while (emAndamento.size > 0) await Promise.all(emAndamento.values());
    },
  };
}
