import type { Db } from "@pizzaria/db";
import { execucaoUnica } from "@pizzaria/shared";
import type { Logger } from "pino";
import { montarCupom } from "./cupom";
import type { Impressora } from "./impressora";
import { buscarDadosLoja, buscarFilaDeImpressao, marcarImpresso } from "./repositorio";

export interface OpcoesAgenteImpressao {
  db: Db;
  impressora: Impressora;
  logger: Logger;
  credenciais: { email: string; senha: string };
  colunas: number;
  vias: number;
  varreduraMs: number;
}

const ESPERA_MAXIMA_MS = 5 * 60_000;

/**
 * Garante que todo pedido vá para o papel:
 * - Realtime dispara uma varredura a cada mudança em `pedidos`;
 * - ao (re)conectar e periodicamente, varre a fila no banco — cobre queda de
 *   internet, eventos perdidos e o agente ter ficado desligado;
 * - só marca `impresso_em` depois que a impressora aceitou o trabalho.
 * Se cair entre imprimir e marcar, o pedido sai de novo: duplicar é melhor
 * que perder.
 */
export function criarAgenteImpressao(opcoes: OpcoesAgenteImpressao) {
  const { db, impressora, logger } = opcoes;
  /** Falhas de impressão por pedido, com espera crescente até tentar de novo. */
  const falhas = new Map<string, { tentativas: number; proximaEm: number }>();
  /** Impressos cuja marcação no banco falhou: tenta marcar de novo sem reimprimir. */
  const semMarcacao = new Map<string, string | null>();
  let loja: { nomePizzaria: string; fusoHorario: string } | null = null;

  async function garantirSessao() {
    const { data } = await db.auth.getSession();
    if (data.session) return;
    const { error } = await db.auth.signInWithPassword({
      email: opcoes.credenciais.email,
      password: opcoes.credenciais.senha,
    });
    if (error) throw new Error(`Login da impressora falhou: ${error.message}`);
    logger.info("Sessão da impressora iniciada");
  }

  async function marcar(pedidoId: string, reimpressao: string | null) {
    try {
      await marcarImpresso(db, pedidoId, reimpressao);
      semMarcacao.delete(pedidoId);
    } catch (err) {
      semMarcacao.set(pedidoId, reimpressao);
      logger.error({ err, pedidoId }, "Impresso, mas não consegui marcar no banco; tentarei de novo");
    }
  }

  async function varrerUmaVez() {
    await garantirSessao();
    loja ??= await buscarDadosLoja(db);

    for (const [pedidoId, reimpressao] of semMarcacao) await marcar(pedidoId, reimpressao);

    for (const pedido of await buscarFilaDeImpressao(db)) {
      if (semMarcacao.has(pedido.id)) continue;
      const falha = falhas.get(pedido.id);
      if (falha && falha.proximaEm > Date.now()) continue;

      const reimpressao = pedido.jaImpresso && pedido.reimpressaoSolicitadaEm !== null;
      const log = logger.child({ pedido: pedido.cupom.numero, pedidoId: pedido.id, reimpressao });
      try {
        const cupom = montarCupom(pedido.cupom, { colunas: opcoes.colunas, ...loja, reimpressao });
        await impressora.imprimir(cupom, opcoes.vias, `Pedido ${pedido.cupom.numero}`);
        falhas.delete(pedido.id);
        log.info("Pedido impresso");
      } catch (err) {
        const tentativas = (falha?.tentativas ?? 0) + 1;
        const espera = Math.min(15_000 * 2 ** (tentativas - 1), ESPERA_MAXIMA_MS);
        falhas.set(pedido.id, { tentativas, proximaEm: Date.now() + espera });
        log.error({ err, tentativas, proximaTentativaEmS: espera / 1000 }, "Falha ao imprimir");
        continue;
      }
      await marcar(pedido.id, pedido.reimpressaoSolicitadaEm);
    }
  }

  /** Varreduras nunca correm em paralelo; pedidos durante uma varredura geram outra em seguida. */
  const varrerFila = execucaoUnica(varrerUmaVez, (err) =>
    logger.error({ err }, "Falha na varredura (nova tentativa na próxima)")
  );
  function varrer(motivo: string): Promise<void> {
    logger.debug({ motivo }, "Varrendo fila de impressão");
    return varrerFila();
  }

  let canal: ReturnType<Db["channel"]> | null = null;
  let temporizador: NodeJS.Timeout | null = null;

  return {
    async iniciar() {
      const status = await impressora.status().catch((err: unknown) => `erro: ${String(err)}`);
      if (status === "Normal") logger.info({ status }, "Impressora pronta");
      else logger.warn({ status }, "Impressora não está pronta; os pedidos ficam na fila até ela voltar");

      await garantirSessao();
      canal = db
        .channel("fila-impressao")
        .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => void varrer("realtime"))
        .subscribe((estado, err) => {
          if (estado === "SUBSCRIBED") {
            logger.info("Realtime conectado");
            void varrer("conexao");
          } else if (estado !== "CLOSED") {
            logger.warn({ estado, err: err?.message }, "Realtime desconectado; seguindo pela varredura periódica");
          }
        });
      temporizador = setInterval(() => void varrer("periodica"), opcoes.varreduraMs);
      await varrer("inicio");
    },

    async parar() {
      if (temporizador) clearInterval(temporizador);
      if (canal) await db.removeChannel(canal);
      await varrerFila.ocioso();
    },
  };
}
