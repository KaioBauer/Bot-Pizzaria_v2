import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const executar = promisify(execFile);

/**
 * Envia bytes ESC/POS crus para uma impressora instalada no Windows (USB ou
 * qualquer porta), pelo spooler, com o tipo de dado RAW: o driver repassa os
 * bytes sem interpretar. Não exige compartilhar a impressora nem módulo
 * nativo — usa a API winspool.drv via PowerShell.
 */

const SCRIPT = String.raw`
param([string]$Impressora, [string]$Arquivo, [string]$Documento)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class SpoolerRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string nome, out IntPtr h, IntPtr padrao);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr h, int nivel, [In] DOCINFO doc);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] dados, int tamanho, out int escritos);

  public static void Enviar(string impressora, byte[] dados, string documento) {
    IntPtr h;
    if (!OpenPrinter(impressora, out h, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      if (StartDocPrinter(h, 1, new DOCINFO { pDocName = documento, pDataType = "RAW" }) == 0)
        throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        StartPagePrinter(h);
        int escritos;
        if (!WritePrinter(h, dados, dados.Length, out escritos) || escritos != dados.Length)
          throw new Win32Exception(Marshal.GetLastWin32Error());
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
[SpoolerRaw]::Enviar($Impressora, [System.IO.File]::ReadAllBytes($Arquivo), $Documento)
`;

const SCRIPT_STATUS = String.raw`
param([string]$Impressora)
$p = Get-Printer -Name $Impressora -ErrorAction SilentlyContinue
if (-not $p) { 'inexistente' } elseif ($p.WorkOffline) { 'offline' } else { [string]$p.PrinterStatus }
`;

export class SpoolerWindows {
  private readonly pasta = join(tmpdir(), "vianna-print-agent");
  private scriptPronto: Promise<void> | null = null;

  constructor(private readonly impressora: string) {}

  private preparar(): Promise<void> {
    this.scriptPronto ??= (async () => {
      await mkdir(this.pasta, { recursive: true });
      await writeFile(join(this.pasta, "enviar.ps1"), SCRIPT, "utf8");
      await writeFile(join(this.pasta, "status.ps1"), SCRIPT_STATUS, "utf8");
    })();
    return this.scriptPronto;
  }

  private powershell(script: string, args: string[]) {
    return executar(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(this.pasta, script), ...args],
      { timeout: 30_000, windowsHide: true }
    );
  }

  getPrinterName(): string {
    return this.impressora;
  }

  /** "Normal", "offline", "inexistente", "Error", "PaperOut"... */
  async status(): Promise<string> {
    await this.preparar();
    const { stdout } = await this.powershell("status.ps1", ["-Impressora", this.impressora]);
    return stdout.trim();
  }

  async isPrinterConnected(): Promise<boolean> {
    const status = await this.status();
    return status !== "inexistente" && status !== "offline";
  }

  async execute(buffer: Buffer, opcoes: { docname?: string } = {}): Promise<string> {
    await this.preparar();
    const arquivo = join(this.pasta, `${randomUUID()}.bin`);
    await writeFile(arquivo, buffer);
    try {
      await this.powershell("enviar.ps1", [
        "-Impressora",
        this.impressora,
        "-Arquivo",
        arquivo,
        "-Documento",
        opcoes.docname ?? "Pedido",
      ]);
      return "ok";
    } catch (erro) {
      const detalhe = (erro as { stderr?: string }).stderr?.trim();
      throw new Error(`Falha ao enviar para a impressora "${this.impressora}"${detalhe ? `: ${detalhe}` : ""}`);
    } finally {
      await rm(arquivo, { force: true });
    }
  }
}
