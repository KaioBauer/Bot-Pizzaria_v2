import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
 *
 * "O Windows aceitou" NÃO é "imprimiu": com a impressora desligada o driver
 * genérico continua "Normal" e o spooler guarda o cupom, que sai de surpresa
 * quando ela liga (com o pedido já marcado como impresso). Por isso o script
 * espera o trabalho SAIR da fila do Windows; se não sair no prazo, cancela o
 * trabalho e falha — o pedido continua na fila do painel e é reenviado depois.
 */

const SCRIPT = String.raw`
param([string]$Impressora, [string]$Arquivo, [string]$Documento, [int]$Espera = 15)
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

  /** Devolve o número do trabalho na fila do Windows. */
  public static int Enviar(string impressora, byte[] dados, string documento) {
    IntPtr h;
    if (!OpenPrinter(impressora, out h, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      int trabalho = StartDocPrinter(h, 1, new DOCINFO { pDocName = documento, pDataType = "RAW" });
      if (trabalho == 0)
        throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        StartPagePrinter(h);
        int escritos;
        if (!WritePrinter(h, dados, dados.Length, out escritos) || escritos != dados.Length)
          throw new Win32Exception(Marshal.GetLastWin32Error());
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
      return trabalho;
    } finally { ClosePrinter(h); }
  }
}
'@
$trabalho = [SpoolerRaw]::Enviar($Impressora, [System.IO.File]::ReadAllBytes($Arquivo), $Documento)
$limite = (Get-Date).AddSeconds($Espera)
while ((Get-Date) -lt $limite) {
  if (-not (Get-PrintJob -PrinterName $Impressora -ID $trabalho -ErrorAction SilentlyContinue)) { 'impresso'; exit 0 }
  Start-Sleep -Milliseconds 500
}
Remove-PrintJob -PrinterName $Impressora -ID $trabalho -ErrorAction SilentlyContinue
[Console]::Error.WriteLine("A impressora nao imprimiu em $Espera s (desligada, sem papel ou tampa aberta). O cupom foi tirado da fila do Windows; o pedido continua na fila do painel.")
exit 2
`;

const SCRIPT_STATUS = String.raw`
param([string]$Impressora)
$p = Get-Printer -Name $Impressora -ErrorAction SilentlyContinue
if (-not $p) { 'inexistente' } elseif ($p.WorkOffline) { 'offline' } else { [string]$p.PrinterStatus }
`;

export class SpoolerWindows {
  private readonly pasta = join(tmpdir(), "vianna-print-agent");

  constructor(private readonly impressora: string) {}

  /**
   * Garante os scripts na pasta temporária ANTES DE CADA USO: o serviço roda por
   * semanas e a limpeza do Windows (Sensor de Armazenamento, Limpeza de Disco)
   * apaga arquivos antigos do TEMP. Gravados só no início, as impressões
   * falhavam para sempre com "o argumento enviar.ps1 não existe".
   */
  private async preparar(): Promise<void> {
    await mkdir(this.pasta, { recursive: true });
    for (const [nome, conteudo] of [["enviar.ps1", SCRIPT], ["status.ps1", SCRIPT_STATUS]] as const) {
      const caminho = join(this.pasta, nome);
      // Regrava se sumiu ou se é de uma versão anterior do agente.
      if (!existsSync(caminho) || (await readFile(caminho, "utf8")) !== conteudo) await writeFile(caminho, conteudo, "utf8");
    }
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
