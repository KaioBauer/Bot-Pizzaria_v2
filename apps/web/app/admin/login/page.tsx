"use client";

import { useActionState } from "react";
import { entrarAction, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = { erro: null };

export default function LoginPage() {
  const [estado, entrar, enviando] = useActionState(entrarAction, inicial);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form action={entrar} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-stone-200">
        <div className="text-center">
          <div className="text-4xl">🍕</div>
          <h1 className="mt-2 text-xl font-bold">Vianna Pizzaria</h1>
          <p className="text-sm text-stone-500">Painel de pedidos</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium">E-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Senha</span>
          <input
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100"
          />
        </label>

        {estado.erro && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {estado.erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-marca-600 py-3 font-semibold text-white hover:bg-marca-700 disabled:opacity-60"
        >
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
