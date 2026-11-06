"use client";

import { ArrowLeft, Check, ClipboardPaste, Landmark, Loader2, Lock, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { CobrancaParaPagar, Comprovante } from "@pizzaria/core";
import { formatarReais, type CobrancaSimulada, type StatusCobrancaSimulada } from "@pizzaria/shared";
import { Aviso, Botao, CabecalhoPagina, Cartao, CabecalhoCartao, cn, estiloEntrada, Selo, Vazio, type Tom } from "../../../../components/ui";
import { extratoAction, lerCodigoAction, pagarAction, type Extrato, type Resposta } from "./actions";

const FUSO = "America/Sao_Paulo";
const ATUALIZAR_EXTRATO_MS = 4_000;
/** Tempo de "autorizando..." do app do banco, só para parecer de verdade. */
const AUTORIZANDO_MS = 1_400;

const STATUS: Record<StatusCobrancaSimulada, { rotulo: string; tom: Tom }> = {
  ativa: { rotulo: "Aguardando", tom: "aviso" },
  paga: { rotulo: "Paga", tom: "sucesso" },
  expirada: { rotulo: "Expirada", tom: "neutro" },
  cancelada: { rotulo: "Cancelada", tom: "neutro" },
  estornada: { rotulo: "Devolvida", tom: "violeta" },
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

/** Contagem até o vencimento; antes de montar no navegador (agora = null) mostra o horário, igual no servidor e no cliente. */
function restante(iso: string, agora: number | null): string {
  if (agora === null) return `às ${hora(iso)}`;
  const s = Math.max(0, Math.round((new Date(iso).getTime() - agora) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Etapa =
  | { tipo: "colar" }
  | { tipo: "confirmar"; codigo: string; cobranca: CobrancaParaPagar }
  | { tipo: "autorizando"; codigo: string; cobranca: CobrancaParaPagar }
  | { tipo: "comprovante"; comprovante: Comprovante };

export function BancoSimulado({ inicial }: { inicial: Resposta<Extrato> }) {
  const [extrato, setExtrato] = useState(inicial);
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "colar" });
  const [codigo, setCodigo] = useState("");
  const [pagador, setPagador] = useState("Cliente de teste");
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState<number | null>(null);
  const [lendo, iniciar] = useTransition();

  const atualizar = useCallback(async () => setExtrato(await extratoAction()), []);

  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => {
      setAgora(Date.now());
      if (document.visibilityState === "visible") void atualizar();
    }, ATUALIZAR_EXTRATO_MS);
    return () => clearInterval(t);
  }, [atualizar]);

  function ler(texto: string) {
    setErro(null);
    iniciar(async () => {
      const r = await lerCodigoAction(texto);
      if (!r.ok) return setErro(r.erro);
      setEtapa({ tipo: "confirmar", codigo: texto, cobranca: r.dados });
    });
  }

  async function colarDaAreaDeTransferencia() {
    try {
      const texto = (await navigator.clipboard.readText()).trim();
      if (texto) {
        setCodigo(texto);
        ler(texto);
      }
    } catch {
      setErro("O navegador não deixou ler a área de transferência. Cole no campo com Ctrl+V.");
    }
  }

  async function pagar(e: Extract<Etapa, { tipo: "confirmar" }>) {
    setErro(null);
    setEtapa({ ...e, tipo: "autorizando" });
    const [r] = await Promise.all([pagarAction(e.codigo, pagador), new Promise((ok) => setTimeout(ok, AUTORIZANDO_MS))]);
    if (!r.ok) {
      setErro(r.erro);
      setEtapa({ ...e, tipo: "confirmar" });
      return;
    }
    setEtapa({ tipo: "comprovante", comprovante: r.dados });
    setCodigo("");
    void atualizar();
  }

  function recomecar() {
    setErro(null);
    setCodigo("");
    setEtapa({ tipo: "colar" });
  }

  const cobrancas = extrato.ok ? extrato.dados.cobrancas : [];
  const desligado = extrato.ok && !extrato.dados.habilitado;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <CabecalhoPagina
        titulo="Banco simulado"
        descricao="Pague os Pix dos pedidos como o cliente faria no app do banco. Nenhum dinheiro de verdade se move."
        acoes={
          <Botao variante="secundario" tamanho="sm" onClick={() => void atualizar()}>
            <RefreshCw className="size-3.5" /> Atualizar
          </Botao>
        }
      />

      {!extrato.ok && <Aviso>{extrato.erro}</Aviso>}
      {desligado && (
        <Aviso tom="aviso">
          O Pix está desligado no bot. Coloque <code className="font-mono">PIX_SIMULADO=true</code> no <code className="font-mono">apps/bot/.env</code> e reinicie o bot.
        </Aviso>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[400px_1fr]">
        {/* O "app do banco" */}
        <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_24px_48px_-24px_rgb(0_0_0/0.35)] ring-1 ring-zinc-200/80">
          <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 pt-5 pb-14 text-white">
            <div className="flex items-center gap-2 text-[13px] font-medium text-white/80">
              <Landmark className="size-4" /> Banco simulado
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px]">
                <Lock className="size-3" /> ambiente de teste
              </span>
            </div>
            <p className="mt-4 text-[13px] text-white/75">Área Pix</p>
            <p className="text-xl font-semibold tracking-tight">
              {etapa.tipo === "comprovante" ? "Pix enviado" : etapa.tipo === "colar" ? "Pagar com Pix Copia e Cola" : "Confira o pagamento"}
            </p>
          </div>

          <div className="-mt-9 px-4 pb-5">
            <div className="rounded-2xl bg-white p-4 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)] ring-1 ring-zinc-200/70">
              <AnimatePresence mode="wait" initial={false}>
                {etapa.tipo === "colar" && (
                  <motion.form
                    key="colar"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (codigo.trim()) ler(codigo.trim());
                    }}
                  >
                    <label className="block text-[13px] font-medium text-zinc-700" htmlFor="codigo-pix">
                      Código Pix
                    </label>
                    <textarea
                      id="codigo-pix"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      rows={4}
                      spellCheck={false}
                      placeholder="00020101021226..."
                      className={cn(estiloEntrada, "resize-none font-mono text-[12px] break-all")}
                    />
                    <div className="flex gap-2">
                      <Botao type="button" variante="secundario" className="flex-1" onClick={() => void colarDaAreaDeTransferencia()}>
                        <ClipboardPaste className="size-4" /> Colar
                      </Botao>
                      <Botao type="submit" className="flex-1" aria-busy={lendo} disabled={!codigo.trim() || lendo}>
                        {lendo ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />} Continuar
                      </Botao>
                    </div>
                    <p className="text-[12px] text-zinc-500">
                      Copie o código que o bot mandou no WhatsApp (ou o do pedido pelo link), ou toque em <b>Pagar</b> numa cobrança ao lado.
                    </p>
                  </motion.form>
                )}

                {(etapa.tipo === "confirmar" || etapa.tipo === "autorizando") && (
                  <motion.div key="confirmar" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="space-y-4">
                    <button type="button" onClick={recomecar} disabled={etapa.tipo === "autorizando"} className="inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-zinc-900">
                      <ArrowLeft className="size-3.5" /> Voltar
                    </button>
                    <div className="text-center">
                      <p className="text-[13px] text-zinc-500">Você vai pagar</p>
                      <p className="text-3xl font-semibold tracking-tight tabular">{formatarReais(etapa.cobranca.valorCentavos)}</p>
                      <p className="mt-1 text-[13px] text-zinc-500">
                        para <b className="text-zinc-900">{etapa.cobranca.recebedor}</b>
                      </p>
                    </div>
                    <dl className="divide-y divide-zinc-100 rounded-xl bg-zinc-50 px-3.5 text-[13px] ring-1 ring-zinc-200/60">
                      <Linha rotulo="Cidade" valor={etapa.cobranca.cidade} />
                      <Linha rotulo="Chave Pix" valor={etapa.cobranca.chave} mono />
                      <Linha rotulo="Instituição" valor="Banco simulado" />
                      {etapa.cobranca.descricao && <Linha rotulo="Descrição" valor={etapa.cobranca.descricao} />}
                      {etapa.cobranca.status === "ativa" && <Linha rotulo="Vence em" valor={restante(etapa.cobranca.expiraEm, agora)} mono />}
                    </dl>
                    <label className="block space-y-1.5">
                      <span className="text-[13px] font-medium text-zinc-700">Quem está pagando</span>
                      <input value={pagador} onChange={(e) => setPagador(e.target.value)} maxLength={60} className={estiloEntrada} disabled={etapa.tipo === "autorizando"} />
                    </label>
                    <Botao tamanho="lg" variante="sucesso" className="w-full" aria-busy={etapa.tipo === "autorizando"} disabled={etapa.tipo === "autorizando"} onClick={() => etapa.tipo === "confirmar" && void pagar(etapa)}>
                      {etapa.tipo === "autorizando" ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Autorizando...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-4" /> Pagar {formatarReais(etapa.cobranca.valorCentavos)}
                        </>
                      )}
                    </Botao>
                  </motion.div>
                )}

                {etapa.tipo === "comprovante" && (
                  <motion.div key="comprovante" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="text-center">
                      <motion.span
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 380, damping: 18 }}
                        className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_12px_24px_-10px_rgb(16_185_129/0.8)]"
                      >
                        <Check className="size-7" strokeWidth={3} />
                      </motion.span>
                      <p className="mt-3 text-2xl font-semibold tracking-tight tabular">{formatarReais(etapa.comprovante.valorCentavos)}</p>
                      <p className="text-[13px] text-zinc-500">Comprovante de transferência Pix</p>
                    </div>
                    <dl className="divide-y divide-zinc-100 rounded-xl bg-zinc-50 px-3.5 text-[13px] ring-1 ring-zinc-200/60">
                      <Linha rotulo="Para" valor={etapa.comprovante.recebedor} />
                      <Linha rotulo="De" valor={etapa.comprovante.pagador} />
                      <Linha rotulo="Data" valor={dataHora(etapa.comprovante.pagoEm)} />
                      <Linha rotulo="ID da transação" valor={etapa.comprovante.endToEndId} mono />
                      <Linha rotulo="Identificador" valor={etapa.comprovante.txid} mono />
                    </dl>
                    <p className="text-center text-[12px] text-zinc-500">A pizzaria recebe o aviso em alguns segundos e o pedido vai para a cozinha.</p>
                    <Botao variante="secundario" className="w-full" onClick={recomecar}>
                      Pagar outro Pix
                    </Botao>
                  </motion.div>
                )}
              </AnimatePresence>

              {erro && (
                <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-red-200/70">
                  {erro}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Extrato do recebedor */}
        <Cartao>
          <CabecalhoCartao titulo="Cobranças da pizzaria" descricao="O que o banco gerou para os pedidos Pix. Atualiza sozinho." />
          {cobrancas.length === 0 ? (
            <div className="p-6">
              <Vazio icone={<QrCode className="size-5" />} titulo="Nenhuma cobrança ainda" descricao="Faça um pedido com Pix pelo WhatsApp ou pelo link e ela aparece aqui." />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {cobrancas.map((c) => (
                <ItemCobranca
                  key={c.referencia}
                  cobranca={c}
                  agora={agora}
                  aoPagar={() => {
                    setCodigo(c.brCode);
                    ler(c.brCode);
                  }}
                />
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </main>
  );
}

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-zinc-500">{rotulo}</dt>
      <dd className={cn("min-w-0 text-right font-medium break-all text-zinc-900", mono && "font-mono text-[12px]")}>{valor}</dd>
    </div>
  );
}

function ItemCobranca({ cobranca: c, agora, aoPagar }: { cobranca: CobrancaSimulada; agora: number | null; aoPagar: () => void }) {
  const status = STATUS[c.status];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{c.descricao || c.txid}</p>
        <p className="text-[12px] text-zinc-500">
          Criada {hora(c.criadaEm)}
          {c.status === "ativa" && <> · vence em <span className="tabular">{restante(c.expiraEm, agora)}</span></>}
          {c.pagaEm && <> · paga {hora(c.pagaEm)}{c.pagadorNome ? ` por ${c.pagadorNome}` : ""}</>}
          {c.estornadaEm && <> · devolvida {hora(c.estornadaEm)}</>}
        </p>
      </div>
      <span className="text-sm font-semibold tabular">{formatarReais(c.valorCentavos)}</span>
      <Selo tom={status.tom}>{status.rotulo}</Selo>
      {c.status === "ativa" && (
        <Botao tamanho="sm" variante="secundario" onClick={aoPagar}>
          Pagar
        </Botao>
      )}
    </li>
  );
}
