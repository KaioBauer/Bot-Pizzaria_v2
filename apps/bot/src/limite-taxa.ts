/**
 * Limite de taxa em memória (janela deslizante por chave). Uma instância do
 * bot só, então memória basta; reiniciar o bot zera os contadores.
 */
export function criarLimiteTaxa(opcoes: { maximo: number; janelaMs: number; agora?: () => number }) {
  const agora = opcoes.agora ?? Date.now;
  const registros = new Map<string, number[]>();

  function recentes(chave: string): number[] {
    const limite = agora() - opcoes.janelaMs;
    const lista = (registros.get(chave) ?? []).filter((t) => t > limite);
    if (lista.length) registros.set(chave, lista);
    else registros.delete(chave);
    return lista;
  }

  return {
    /** true se ainda cabe; não registra. */
    permite(chave: string): boolean {
      return recentes(chave).length < opcoes.maximo;
    },
    registrar(chave: string): void {
      registros.set(chave, [...recentes(chave), agora()]);
    },
    /** Registra e diz se cabia (uso típico: tentativas por IP). */
    consumir(chave: string): boolean {
      if (!this.permite(chave)) return false;
      this.registrar(chave);
      return true;
    },
    /** Remove chaves sem registros recentes (chamado de tempos em tempos). */
    faxina(): void {
      for (const chave of [...registros.keys()]) recentes(chave);
    },
  };
}

export type LimiteTaxa = ReturnType<typeof criarLimiteTaxa>;
