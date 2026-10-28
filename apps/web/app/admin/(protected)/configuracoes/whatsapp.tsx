"use client";

import { CheckCircle2, Loader2, MessageCircle, QrCode, RefreshCw, Smartphone, Unplug, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { formatarTelefone } from "@pizzaria/shared";
import { Aviso, Botao, Cartao, cn, estiloEntrada, Selo } from "../../../../components/ui";
import {
  conectarWhatsappAction,
  desconectarWhatsappAction,
  situacaoWhatsappAction,
  type RespostaWhatsapp,
  type SituacaoWhatsapp,
} from "./whatsapp-actions";

/** Verificação da conexão: rápida enquanto pareia, espaçada quando está tudo certo. */
const INTERVALO_PAREANDO_MS = 3_000;
const INTERVALO_NORMAL_MS = 20_000;
/** O QR do WhatsApp vence em ~20–40 s: pede um novo antes. */
const RENOVAR_QR_MS = 25_000;
/** Depois disso sem escanear, para de gerar QR (volta ao botão "Conectar"). */
const DESISTIR_QR_MS = 3 * 60_000;

type Pareamento = { qrCode: string | null; codigo: string | null; desde: number; numero: string };

export function SecaoWhatsapp() {
  const [situacao, setSituacao] = useState<SituacaoWhatsapp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pareamento, setPareamento] = useState<Pareamento | null>(null);
  const [numero, setNumero] = useState("");
  const [comCodigo, setComCodigo] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [acabouDeConectar, setAcabouDeConectar] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const ultimoQr = useRef(0);

  const aplicar = useCallback((r: RespostaWhatsapp) => {
    if (!r.ok) {
      setErro(r.erro);
      return null;
    }
    setErro(null);
    setSituacao(r.situacao);
    return r.situacao;
  }, []);

  const conectar = useCallback(
    async (numeroPareamento: string) => {
      ultimoQr.current = Date.now();
      const s = aplicar(await conectarWhatsappAction(numeroPareamento || undefined));
      if (!s) return;
      if (s.estado === "conectado") {
        setPareamento(null);
        return;
      }
      setPareamento((atual) => ({
        qrCode: s.qrCode ?? atual?.qrCode ?? null,
        codigo: s.codigoPareamento ?? atual?.codigo ?? null,
        desde: atual?.desde ?? Date.now(),
        numero: numeroPareamento,
      }));
    },
    [aplicar]
  );

  // Verificação periódica (pausa com a aba escondida).
  useEffect(() => {
    let vivo = true;
    async function verificar() {
      if (document.hidden) return;
      const s = aplicar(await situacaoWhatsappAction());
      if (!vivo || !s) return;
      if (s.estado === "conectado") {
        if (pareamento) {
          setAcabouDeConectar(true);
          setPareamento(null);
        }
      } else if (pareamento) {
        if (Date.now() - pareamento.desde > DESISTIR_QR_MS) setPareamento(null);
        else if (Date.now() - ultimoQr.current > RENOVAR_QR_MS) void conectar(pareamento.numero);
      }
    }
    void verificar();
    const id = setInterval(verificar, pareamento ? INTERVALO_PAREANDO_MS : INTERVALO_NORMAL_MS);
    const aoVoltar = () => void verificar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [aplicar, conectar, pareamento]);

  const estado = situacao?.estado;
  const conectado = estado === "conectado";

  const selo = !situacao ? (
    <Selo tom="neutro">Verificando…</Selo>
  ) : conectado ? (
    <Selo tom="sucesso">Conectado</Selo>
  ) : pareamento ? (
    <Selo tom="info">Aguardando leitura</Selo>
  ) : estado === "desligado" ? (
    <Selo tom="neutro">Desligado no bot</Selo>
  ) : (
    <Selo tom="perigo">Desconectado</Selo>
  );

  return (
    <div className="grid gap-4 border-b border-stone-200 pb-10 last:border-0 lg:grid-cols-[17rem_1fr] lg:gap-10">
      <div>
        <h2 className="font-display text-xl font-semibold">WhatsApp</h2>
        <p className="mt-1 text-sm text-stone-500">
          O número que atende os clientes. Conecte lendo o QR Code com o celular da pizzaria, como no WhatsApp Web. A conexão é verificada sozinha.
        </p>
      </div>

      <Cartao className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full",
                conectado ? "bg-manjericao-50 text-manjericao-700" : "bg-stone-100 text-stone-500"
              )}
            >
              <MessageCircle className="size-5" />
            </span>
            <div>
              <p className="flex items-center gap-2 font-semibold">WhatsApp da pizzaria {selo}</p>
              <p className="text-sm text-stone-500">
                {conectado
                  ? [situacao?.numero ? formatarTelefone(situacao.numero) : null, situacao?.nomePerfil].filter(Boolean).join(" · ") || "Número conectado"
                  : estado === "desligado"
                    ? "O canal WhatsApp está desligado no bot."
                    : "Os clientes não recebem resposta até conectar."}
              </p>
            </div>
          </div>
          {situacao && (
            <button
              type="button"
              onClick={() => iniciar(async () => void aplicar(await situacaoWhatsappAction()))}
              className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              title="Verificar agora"
              aria-label="Verificar conexão agora"
            >
              <RefreshCw className={cn("size-4", ocupado && "animate-spin")} />
            </button>
          )}
        </div>

        {erro && (
          <Aviso className="mt-4">
            <span className="flex items-center gap-2">
              <WifiOff className="size-4 shrink-0" /> {erro}
            </span>
          </Aviso>
        )}

        {acabouDeConectar && conectado && (
          <Aviso tom="sucesso" className="mt-4">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0" /> WhatsApp conectado! O bot já está respondendo por esse número.
            </span>
          </Aviso>
        )}

        {estado === "desligado" && (
          <p className="mt-4 rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
            Para usar, ligue no bot: <code className="font-mono font-semibold">WHATSAPP_ENABLED=true</code> com <code className="font-mono">EVOLUTION_URL</code> e{" "}
            <code className="font-mono">EVOLUTION_API_KEY</code> em <code className="font-mono">apps/bot/.env</code>, e reinicie o bot.
          </p>
        )}

        {/* Conectado: desconectar em dois toques */}
        {conectado && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
            {confirmarSaida ? (
              <>
                <span className="text-sm text-stone-600">O bot para de atender no WhatsApp. Confirmar?</span>
                <Botao
                  variante="perigo"
                  tamanho="sm"
                  disabled={ocupado}
                  onClick={() =>
                    iniciar(async () => {
                      aplicar(await desconectarWhatsappAction());
                      setConfirmarSaida(false);
                      setAcabouDeConectar(false);
                    })
                  }
                >
                  <Unplug className="size-4" /> Sim, desconectar
                </Botao>
                <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmarSaida(false)}>
                  Cancelar
                </Botao>
              </>
            ) : (
              <Botao variante="secundario" tamanho="sm" onClick={() => setConfirmarSaida(true)}>
                <Unplug className="size-4" /> Desconectar / trocar número
              </Botao>
            )}
          </div>
        )}

        {/* Desconectado: conectar por QR (ou código) */}
        {situacao && !conectado && estado !== "desligado" && !pareamento && (
          <div className="mt-5 space-y-3 border-t border-stone-100 pt-4">
            {comCodigo && (
              <label className="block max-w-xs">
                <span className="mb-1.5 block text-sm font-medium text-stone-700">Número do WhatsApp da pizzaria</span>
                <input
                  className={estiloEntrada}
                  inputMode="tel"
                  placeholder="5547999998888"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
                <span className="mt-1.5 block text-sm text-stone-500">DDI + DDD + número, só dígitos.</span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Botao variante="sucesso" disabled={ocupado || (comCodigo && numero.replace(/\D/g, "").length < 12)} onClick={() => iniciar(() => conectar(comCodigo ? numero : ""))}>
                {ocupado ? <Loader2 className="size-4 animate-spin" /> : comCodigo ? <Smartphone className="size-4" /> : <QrCode className="size-4" />}
                {comCodigo ? "Gerar código" : "Conectar WhatsApp"}
              </Botao>
              <Botao variante="fantasma" tamanho="sm" onClick={() => setComCodigo((v) => !v)}>
                {comCodigo ? "Usar QR Code" : "Está no próprio celular? Conectar com código"}
              </Botao>
            </div>
          </div>
        )}

        {/* Pareando: QR + instruções */}
        {pareamento && !conectado && (
          <div className="mt-5 grid gap-6 border-t border-stone-100 pt-5 sm:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              {pareamento.qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL gerada pela Evolution, renova a cada ~25 s
                <img src={pareamento.qrCode} alt="QR Code para conectar o WhatsApp" className="size-64 rounded-xl bg-white p-2 ring-1 ring-stone-200" />
              ) : (
                <div className="flex size-64 items-center justify-center rounded-xl bg-stone-50 ring-1 ring-stone-200">
                  <Loader2 className="size-6 animate-spin text-stone-400" />
                </div>
              )}
              <p className="flex items-center gap-1.5 text-xs text-stone-500">
                <Loader2 className="size-3 animate-spin" /> Aguardando leitura — o QR se renova sozinho
              </p>
            </div>
            <div className="space-y-4 text-sm text-stone-700">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Abra o WhatsApp no celular da pizzaria.</li>
                <li>
                  Toque em <strong>⋮ Mais opções</strong> (Android) ou <strong>Configurações</strong> (iPhone) e depois em <strong>Aparelhos conectados</strong>.
                </li>
                <li>
                  Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para o QR Code.
                </li>
              </ol>
              {pareamento.codigo && (
                <div className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
                  <p className="text-sky-900">
                    Ou toque em <strong>Conectar com número de telefone</strong> e digite o código:
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tracking-[0.3em] text-sky-950">{pareamento.codigo}</p>
                </div>
              )}
              <Botao variante="fantasma" tamanho="sm" onClick={() => setPareamento(null)}>
                Cancelar
              </Botao>
            </div>
          </div>
        )}
      </Cartao>
    </div>
  );
}
