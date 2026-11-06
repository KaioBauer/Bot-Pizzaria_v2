import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SpoolerWindows } from "./windows";

describe.skipIf(process.platform !== "win32")("SpoolerWindows", () => {
  it("recria os scripts se a limpeza do Windows apagar a pasta temporária", async () => {
    const spooler = new SpoolerWindows("Impressora-Inexistente-Teste");
    expect(await spooler.status()).toBe("inexistente");
    await rm(join(tmpdir(), "vianna-print-agent", "status.ps1"), { force: true });
    expect(await spooler.status()).toBe("inexistente");
  }, 60_000);
});
