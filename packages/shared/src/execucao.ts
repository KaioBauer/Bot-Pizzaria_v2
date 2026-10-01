/**
 * Envolve uma tarefa para que nunca rode em paralelo consigo mesma. Chamadas
 * feitas durante uma execução não se perdem: geram exatamente mais uma
 * execução ao final. Usado nas varreduras (impressão, notificações), que são
 * disparadas por Realtime, por timer e na conexão.
 */
export function execucaoUnica(tarefa: () => Promise<void>, aoFalhar: (erro: unknown) => void) {
  let emAndamento: Promise<void> | null = null;
  let repetir = false;

  function executar(): Promise<void> {
    if (emAndamento) {
      repetir = true;
      return emAndamento;
    }
    emAndamento = (async () => {
      do {
        repetir = false;
        try {
          await tarefa();
        } catch (erro) {
          aoFalhar(erro);
        }
      } while (repetir);
    })().finally(() => {
      emAndamento = null;
    });
    return emAndamento;
  }

  /** Espera a execução em andamento, sem disparar outra (desligamento). */
  const ocioso = (): Promise<void> => emAndamento ?? Promise.resolve();

  return Object.assign(executar, { ocioso });
}
