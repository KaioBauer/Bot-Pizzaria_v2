import type { MensagemEntrada } from "@pizzaria/core";

/**
 * Processa as mensagens de cada chat em série (nunca duas ao mesmo tempo
 * para o mesmo cliente) e junta as que chegam enquanto uma está sendo
 * processada: "quero" / "uma calabresa" / "grande" viram uma única entrada,
 * com uma única resposta. Chats diferentes rodam em paralelo.
 */
export function criarProcessadorPorChat(processar: (mensagem: MensagemEntrada) => Promise<void>) {
  const pendentes = new Map<string, MensagemEntrada[]>();
  const emAndamento = new Map<string, Promise<void>>();

  async function drenar(chave: string): Promise<void> {
    for (;;) {
      const lote = pendentes.get(chave);
      if (!lote?.length) break;
      pendentes.delete(chave);
      const ultima = lote[lote.length - 1]!;
      await processar({ ...ultima, texto: lote.map((m) => m.texto).join("\n") }).catch(() => undefined);
    }
    emAndamento.delete(chave);
  }

  return {
    receber(mensagem: MensagemEntrada): void {
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
