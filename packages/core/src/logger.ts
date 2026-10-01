/** Subconjunto da API do pino usado pelo núcleo (sem depender do pino). */
export interface Logger {
  debug(objeto: object, mensagem?: string): void;
  info(objeto: object, mensagem?: string): void;
  warn(objeto: object, mensagem?: string): void;
  error(objeto: object, mensagem?: string): void;
}

export const loggerSilencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
