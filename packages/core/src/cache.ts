/**
 * Cache em memória com validade, para dados lidos a cada mensagem e que
 * mudam pouco (cardápio, configurações). Requisições simultâneas
 * compartilham a mesma busca em andamento.
 */
export function cacheComValidade<T>(
  buscar: () => Promise<T>,
  validadeMs: number,
  agora: () => number = Date.now
): () => Promise<T> {
  let valor: { dado: T; expiraEm: number } | null = null;
  let emAndamento: Promise<T> | null = null;

  return async () => {
    if (valor && valor.expiraEm > agora()) return valor.dado;
    if (emAndamento) return emAndamento;

    emAndamento = buscar()
      .then((dado) => {
        valor = { dado, expiraEm: agora() + validadeMs };
        return dado;
      })
      .finally(() => {
        emAndamento = null;
      });
    return emAndamento;
  };
}
