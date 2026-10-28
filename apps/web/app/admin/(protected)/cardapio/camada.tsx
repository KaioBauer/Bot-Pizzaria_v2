"use client";

import { ImagePlus, Layers, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { cn } from "../../../../components/ui";
import type { Resultado } from "./actions";

/** Igual à validação da action e do bucket `camadas`. */
export const TIPOS_CAMADA = ["image/png", "image/webp"];
export const LIMITE_CAMADA = 1024 * 1024;

export function validarCamada(arquivo: File): string | null {
  if (!TIPOS_CAMADA.includes(arquivo.type)) return "A camada precisa ser PNG ou WebP com fundo transparente.";
  if (arquivo.size > LIMITE_CAMADA) return "Camada maior que 1 MB. Reduza a imagem (ex.: 800×800 px).";
  return null;
}

/** Quadriculado clássico de "transparente" para o admin conferir o fundo da camada. */
const QUADRICULADO = {
  backgroundColor: "#fff",
  backgroundImage: "conic-gradient(#e7e5e4 25%, transparent 0 50%, #e7e5e4 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
} as const;

/** Prévia da camada: quadriculado com o contorno do disco da pizza por baixo. */
export function PreviaCamada({ url, nome, className }: { url: string | null; nome: string; className?: string }) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-xl ring-1 ring-stone-200", className)} style={QUADRICULADO}>
      <div className="absolute inset-[6%] rounded-full border-2 border-dashed border-stone-300" aria-hidden />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Camada: ${nome}`} className="absolute inset-0 size-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-stone-400">
          <Layers className="size-1/4" aria-hidden />
        </div>
      )}
    </div>
  );
}

/**
 * Envio/remoção de uma camada. `id` vai no FormData (produto, ingrediente ou nome
 * da borda) junto com `arquivo`. Valida tipo e tamanho antes de enviar.
 */
export function EditorCamada(props: {
  id: string | null;
  nome: string;
  url: string | null;
  enviar: (dados: FormData) => Promise<Resultado<{ url: string }>>;
  remover: (id: string) => Promise<Resultado>;
  aoMudar?: (url: string | null) => void;
  compacto?: boolean;
  semId?: string;
}) {
  const [url, setUrl] = useState(props.url);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  function escolher(arquivo: File) {
    setErro(null);
    const invalido = validarCamada(arquivo);
    if (invalido) return setErro(invalido);
    if (!props.id) return;
    const dados = new FormData();
    dados.set("id", props.id);
    dados.set("arquivo", arquivo);
    iniciar(async () => {
      const r = await props.enviar(dados);
      if (!r.ok) return setErro(r.erro);
      setUrl(r.url);
      props.aoMudar?.(r.url);
    });
  }

  function remover() {
    if (!props.id) return;
    setErro(null);
    iniciar(async () => {
      const r = await props.remover(props.id!);
      if (!r.ok) return setErro(r.erro);
      setUrl(null);
      props.aoMudar?.(null);
    });
  }

  const input = (
    <input
      ref={entrada}
      type="file"
      accept="image/png,image/webp"
      hidden
      onChange={(e) => {
        const arquivo = e.target.files?.[0];
        e.target.value = "";
        if (arquivo) escolher(arquivo);
      }}
    />
  );

  if (props.compacto) {
    return (
      <div className="flex items-center gap-2">
        {input}
        <button
          type="button"
          disabled={!props.id || ocupado}
          onClick={() => entrada.current?.click()}
          title={props.id ? (url ? "Trocar camada" : "Enviar camada (PNG/WebP transparente, até 1 MB)") : props.semId}
          className={cn("relative size-14 shrink-0 rounded-xl transition hover:ring-2 hover:ring-marca-400 disabled:cursor-not-allowed disabled:opacity-60", ocupado && "animate-pulse")}
        >
          <PreviaCamada url={url} nome={props.nome} className="size-14" />
        </button>
        {url && props.id && (
          <button type="button" disabled={ocupado} onClick={remover} className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remover camada de ${props.nome}`}>
            <Trash2 className="size-4" />
          </button>
        )}
        {erro && <span role="alert" className="text-xs text-red-700">{erro}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {input}
      <PreviaCamada url={url} nome={props.nome} className={cn("w-full", ocupado && "animate-pulse")} />
      <button
        type="button"
        disabled={!props.id || ocupado}
        onClick={() => entrada.current?.click()}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-stone-800 ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50"
      >
        <ImagePlus className="size-4" /> {ocupado ? "Enviando..." : url ? "Trocar camada" : "Enviar camada"}
      </button>
      {!props.id && props.semId && <p className="text-center text-xs text-stone-500">{props.semId}</p>}
      {url && props.id && (
        <button type="button" disabled={ocupado} onClick={remover} className="w-full text-sm font-medium text-red-700 hover:underline">
          Remover camada
        </button>
      )}
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
    </div>
  );
}
