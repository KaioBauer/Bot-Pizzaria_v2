import { describe, expect, it } from "vitest";
import { execucaoUnica } from "./execucao";

describe("execucaoUnica", () => {
  it("não roda em paralelo e junta chamadas durante a execução numa só repetição", async () => {
    let execucoes = 0;
    let ativas = 0;
    let maximo = 0;
    const executar = execucaoUnica(async () => {
      execucoes++;
      ativas++;
      maximo = Math.max(maximo, ativas);
      await new Promise((r) => setTimeout(r, 5));
      ativas--;
    }, () => {});

    await Promise.all([executar(), executar(), executar(), executar()]);
    expect(maximo).toBe(1);
    expect(execucoes).toBe(2);
  });

  it("uma falha não impede as próximas execuções", async () => {
    const erros: unknown[] = [];
    let n = 0;
    const executar = execucaoUnica(async () => {
      if (++n === 1) throw new Error("falhou");
    }, (e) => erros.push(e));
    await executar();
    await executar();
    expect(n).toBe(2);
    expect(erros).toHaveLength(1);
  });
});
