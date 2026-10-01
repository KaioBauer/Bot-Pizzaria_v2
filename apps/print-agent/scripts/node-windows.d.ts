declare module "node-windows" {
  export class Service {
    constructor(opcoes: Record<string, unknown>);
    on(evento: string, callback: (...args: unknown[]) => void): void;
    install(): void;
    uninstall(): void;
    start(): void;
  }
}
