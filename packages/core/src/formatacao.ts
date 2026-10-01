/**
 * Normaliza a marcação gerada pelo LLM para o subconjunto que Telegram
 * (Markdown legado) e WhatsApp entendem igual: *negrito* e _itálico_.
 * Modelos insistem em **negrito duplo** e títulos com #, que nesses canais
 * aparecem como símbolos soltos.
 */
export function normalizarFormatacao(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/gs, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
