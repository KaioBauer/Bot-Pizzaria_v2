"use client";

import { BellRing, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { contarPrecisaAtencao } from "@pizzaria/db";
import { ativarSom, somAtivo, tocarAlerta } from "../../lib/alerta-sonoro";
import { clienteNavegador } from "../../lib/supabase/navegador";

/**
 * Aviso de atendimento humano em todo o painel: conta os chats que precisam de
 * um atendente (a IA pediu ajuda ou o cliente escreveu num chat pausado), toca
 * o alerta quando o número sobe e mostra o selo no menu "Conversas".
 */
const Contexto = createContext({ pendentes: 0 });

export const usePendentesAtendimento = () => use(Contexto).pendentes;

export function ProvedorAtendimento({ inicial, children }: { inicial: number; children: ReactNode }) {
  const [pendentes, setPendentes] = useState(inicial);
  const anterior = useRef(inicial);

  useEffect(() => {
    const supabase = clienteNavegador();
    let cancelado = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;

    const recontar = async () => {
      const total = await contarPrecisaAtencao(supabase).catch(() => null);
      if (total === null || cancelado) return;
      if (total > anterior.current) tocarAlerta();
      anterior.current = total;
      setPendentes(total);
    };

    // Token antes de assinar: sem ele o Realtime entra como anônimo e o RLS não entrega nada.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelado) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      canal = supabase
        .channel("painel-atendimento-aviso")
        .on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, () => void recontar())
        .subscribe((estado) => estado === "SUBSCRIBED" && void recontar());
    });
    const recarga = setInterval(() => void recontar(), 30_000);
    return () => {
      cancelado = true;
      clearInterval(recarga);
      if (canal) void supabase.removeChannel(canal);
    };
  }, []);

  return <Contexto value={{ pendentes }}>{children}</Contexto>;
}

/** Faixa flutuante fora da tela de conversas. */
export function AvisoAtendimento() {
  const pendentes = usePendentesAtendimento();
  const pathname = usePathname();
  const [som, setSom] = useState(true);
  useEffect(() => {
    setSom(somAtivo());
  }, [pendentes]);
  if (pendentes === 0 || pathname.startsWith("/admin/conversas")) return null;

  return (
    <div role="alert" className="fixed top-3 right-3 left-3 z-40 flex justify-center md:left-auto">
      <div className="flex w-full max-w-md animate-[pulse_2s_ease-in-out_3] items-center gap-3 rounded-2xl bg-amber-500 p-3 pl-4 text-amber-950 shadow-elevada">
        <MessageSquareWarning className="size-6 shrink-0" />
        <p className="flex-1 text-sm font-semibold">
          {pendentes === 1 ? "1 cliente precisa de atendimento" : `${pendentes} clientes precisam de atendimento`}
        </p>
        {!som && (
          <button type="button" onClick={async () => setSom(await ativarSom())} className="rounded-lg p-2 hover:bg-amber-400" title="Ativar som do aviso" aria-label="Ativar som do aviso">
            <BellRing className="size-4" />
          </button>
        )}
        <Link href="/admin/conversas" className="rounded-xl bg-amber-950 px-3 py-2 text-sm font-bold text-white hover:bg-amber-900">
          Ver
        </Link>
      </div>
    </div>
  );
}
