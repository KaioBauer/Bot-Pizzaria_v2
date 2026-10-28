/**
 * Normaliza a marcação gerada pelo LLM para o que o WhatsApp entende:
 * *negrito* e _itálico_. Modelos insistem em **negrito duplo** e títulos com #, que no WhatsApp
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

/**
 * O modelo às vezes repete um link do cardápio visto antes no histórico (ex.:
 * endereço antigo); troca qualquer link ".../cardapio" pelo atual.
 */
export function corrigirLinkCardapio(texto: string, urlCardapio: string | null | undefined): string {
  if (!urlCardapio) return texto;
  return texto.replace(/https?:\/\/[^\s)\]]+?\/cardapio(?=$|[\s)\].,!?])/g, urlCardapio);
}
