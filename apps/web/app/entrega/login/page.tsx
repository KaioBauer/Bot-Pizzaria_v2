"use client";

import { Bike, Lock, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Aviso, Botao, estiloEntrada, Logo } from "../../../components/ui";
import { entrarEntregadorAction, type EstadoLogin } from "../actions";

const inicial: EstadoLogin = { erro: null };

function Formulario() {
  const [estado, entrar, enviando] = useActionState(entrarEntregadorAction, inicial);
  const proximo = useSearchParams().get("proximo") ?? "/entrega";

  return (
    <form action={entrar} className="w-full max-w-sm">
      <input type="hidden" name="proximo" value={proximo} />
      <div className="mb-8 flex items-center gap-3">
        <Logo className="size-11" />
        <div>
          <p className="font-display text-xl font-semibold">Vianna Pizzaria</p>
          <p className="flex items-center gap-1 text-sm text-stone-500">
            <Bike className="size-4" /> Entregas
          </p>
        </div>
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Entrar</h1>
      <p className="mt-1.5 text-stone-500">Use o login de motoboy. Você só precisa entrar uma vez neste celular.</p>

      <div className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone-700">E-mail</span>
          <span className="relative block">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
            <input name="email" type="email" autoComplete="username" required className={`${estiloEntrada} h-12 pl-10 text-base`} />
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone-700">Senha</span>
          <span className="relative block">
            <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
            <input name="senha" type="password" autoComplete="current-password" required className={`${estiloEntrada} h-12 pl-10 text-base`} />
          </span>
        </label>
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <Botao type="submit" tamanho="lg" aria-busy={enviando} disabled={enviando} className="h-13 w-full text-base">
          {enviando ? "Entrando..." : "Entrar"}
        </Botao>
      </div>
    </form>
  );
}

export default function LoginEntregaPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-creme-50 p-6">
      <Suspense>
        <Formulario />
      </Suspense>
    </main>
  );
}
