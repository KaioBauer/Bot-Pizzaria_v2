"use client";

import { Ban, Printer, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { listarFilaImpressao, listarImpressosRecentes, pedirReimpressao, tirarDaFilaImpressao, type ItemImpressao } from "@pizzaria/db";
import { formatarReais, ROTULO_STATUS } from "@pizzaria/shared";
import { useAvisos } from "../../../../components/painel/avisos";
import { Botao, CabecalhoCartao, CabecalhoPagina, Cartao, Selo, Vazio } from "../../../../components/ui";
import { clienteNavegador } from "../../../../lib/supabase/navegador";

const FUSO = "America/Sao_Paulo";
const ATUALIZAR_MS = 5_000;
const JANELA_RECENTES_MS = 12 * 60 * 60 * 1000;
/** O agente reivindica antes de mandar à impressora; depois disso o cupom pode já estar saindo. */
const IMPRIMINDO_MS = 2 * 60_000;

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Dados = { fila: ItemImpressao[]; recentes: ItemImpressao[] };

export function FilaImpressao({ inicial }: { inicial: Dados }) {
  const { mostrar } = useAvisos();
  const [dados, setDados] = useState(inicial);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [confirmarTodos, setConfirmarTodos] = useState(false);
  const [agora, setAgora] = useState<number | null>(null);

  const atualizar = useCallback(async () => {
    const db = clienteNavegador();
    try {
      const [fila, recentes] = await Promise.all([listarFilaImpressao(db), listarImpressosRecentes(db, new Date(Date.now() - JANELA_RECENTES_MS))]);
      setDados({ fila, recentes });
    } catch {
      // Falha passageira: a próxima rodada tenta de novo.
    }
    setAgora(Date.now());
  }, []);

  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => document.visibilityState === "visible" && void atualizar(), ATUALIZAR_MS);
    return () => clearInterval(t);
  }, [atualizar]);

  async function executar(ids: string[], acao: () => Promise<void>, sucesso: string) {
    setOcupados((s) => new Set([...s, ...ids]));
    try {
      await acao();
      mostrar({ tom: "sucesso", titulo: sucesso });
    } catch (err) {
      mostrar({ tom: "erro", titulo: "Não deu certo", descricao: err instanceof Error ? err.message : String(err) });
    } finally {
      setOcupados((s) => new Set([...s].filter((id) => !ids.includes(id))));
      await atualizar();
    }
  }

  const tirar = (item: ItemImpressao) =>
    executar([item.id], () => tirarDaFilaImpressao(clienteNavegador(), item), `Pedido #${item.numero} tirado da fila`);

  const tirarTodos = () => {
    const fila = dados.fila;
    setConfirmarTodos(false);
    return executar(
      fila.map((i) => i.id),
      async () => {
        for (const item of fila) await tirarDaFilaImpressao(clienteNavegador(), item);
      },
      `${fila.length} pedido(s) tirado(s) da fila`
    );
  };

  const reimprimir = (item: ItemImpressao) =>
    executar([item.id], () => pedirReimpressao(clienteNavegador(), item.id), `Pedido #${item.numero} voltou para a fila`);

  const imprimindo = (item: ItemImpressao) => agora !== null && item.imprimindoDesde !== null && agora - new Date(item.imprimindoDesde).getTime() < IMPRIMINDO_MS;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <CabecalhoPagina
        titulo="Impressão"
        descricao="O que a impressora vai imprimir. Tire da fila o que não deve sair no papel (ex.: antes de ligar a impressora depois de muito tempo)."
        acoes={
          <Botao variante="secundario" tamanho="sm" onClick={() => void atualizar()}>
            <RefreshCw className="size-3.5" /> Atualizar
          </Botao>
        }
      />

      <Cartao>
        <CabecalhoCartao
          titulo={
            <span className="flex items-center gap-2">
              Na fila <Selo tom={dados.fila.length ? "aviso" : "neutro"}>{dados.fila.length}</Selo>
            </span>
          }
          descricao="Saem na ordem, do mais antigo para o mais novo. Atualiza sozinho."
          acoes={
            dados.fila.length > 1 && !confirmarTodos ? (
              <Botao variante="perigo" tamanho="sm" onClick={() => setConfirmarTodos(true)}>
                <Trash2 className="size-3.5" /> Tirar todos da fila
              </Botao>
            ) : undefined
          }
        />

        <AnimatePresence initial={false}>
          {confirmarTodos && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-red-100 bg-red-50 px-5 py-3 text-[13px] text-red-800 sm:px-6">
                <span className="flex-1">
                  Tirar <b>{dados.fila.length} pedido(s)</b> da fila? Eles <b>não serão impressos</b> (dá para reimprimir depois, um a um).
                </span>
                <Botao variante="secundario" tamanho="sm" onClick={() => setConfirmarTodos(false)}>
                  Cancelar
                </Botao>
                <Botao variante="perigo" tamanho="sm" onClick={() => void tirarTodos()}>
                  Tirar todos
                </Botao>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {dados.fila.length === 0 ? (
          <div className="p-6">
            <Vazio icone={<Printer className="size-5" />} titulo="Fila vazia" descricao="Nada esperando para imprimir." />
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {dados.fila.map((item) => (
              <Linha key={item.id} item={item}>
                {item.reimpressaoSolicitadaEm && <Selo tom="violeta">Reimpressão</Selo>}
                {imprimindo(item) && <Selo tom="info">Imprimindo agora</Selo>}
                <Botao variante="secundario" tamanho="sm" aria-busy={ocupados.has(item.id)} disabled={ocupados.has(item.id)} onClick={() => void tirar(item)}>
                  <Ban className="size-3.5" /> Tirar da fila
                </Botao>
              </Linha>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="Impressos (ou tirados da fila) nas últimas 12 horas" />
        {dados.recentes.length === 0 ? (
          <p className="px-6 py-8 text-center text-[13px] text-zinc-400">Nada por aqui ainda</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {dados.recentes.map((item) => (
              <Linha key={item.id} item={item} detalhe={item.impressoEm ? `às ${dataHora(item.impressoEm)}` : undefined}>
                <Botao variante="fantasma" tamanho="sm" aria-busy={ocupados.has(item.id)} disabled={ocupados.has(item.id)} onClick={() => void reimprimir(item)}>
                  <RotateCcw className="size-3.5" /> Reimprimir
                </Botao>
              </Linha>
            ))}
          </ul>
        )}
      </Cartao>
    </main>
  );
}

function Linha({ item, detalhe, children }: { item: ItemImpressao; detalhe?: string | undefined; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 sm:px-6">
      <span className="font-mono text-sm font-semibold tabular">#{item.numero}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{item.clienteNome}</p>
        <p className="text-[12px] text-zinc-500">
          {dataHora(item.criadoEm)} · {item.tipoEntrega === "entrega" ? "Entrega" : "Retirada"} · {ROTULO_STATUS[item.status]}
          {detalhe ? ` · ${detalhe}` : ""}
        </p>
      </div>
      <span className="text-sm font-semibold tabular">{formatarReais(item.totalCentavos)}</span>
      <div className="flex items-center gap-2">{children}</div>
    </li>
  );
}

