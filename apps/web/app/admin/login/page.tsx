"use client";

import { ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useActionState } from "react";
import { Aviso, Botao, estiloEntrada, Logo } from "../../../components/ui";
import { entrarAction, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = { erro: null };

export default function LoginPage() {
  const [estado, entrar, enviando] = useActionState(entrarAction, inicial);
  const reduzido = useReducedMotion();

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-zinc-50 px-4 py-12">
      {/* Fundo: grade fina que some nas bordas + brilho quente bem leve no topo. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_40%,black,transparent)] bg-[linear-gradient(to_right,rgb(24_24_27/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(24_24_27/0.05)_1px,transparent_1px)] bg-[size:44px_44px]"
      />
      <div aria-hidden className="absolute top-[-18rem] left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-marca-500/[0.07] blur-3xl" />

      <div className="w-full max-w-[380px] motion-safe:animate-[entrada_0.5s_cubic-bezier(0.22,1,0.36,1)_both]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="size-11 drop-shadow-[0_6px_10px_rgb(0_0_0/0.12)]" />
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-zinc-900">Entrar no painel</h1>
          <p className="mt-1 text-[13.5px] text-zinc-500">Vianna Pizzaria · use o e-mail e a senha de administrador.</p>
        </div>

        <form
          action={entrar}
          className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.18)] ring-1 ring-zinc-200/80"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">E-mail</span>
              <span className="group relative block">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400 transition-colors group-focus-within:text-zinc-700" />
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  className={`${estiloEntrada} h-10 pl-9`}
                  placeholder="voce@viannapizzaria.com.br"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Senha</span>
              <span className="group relative block">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400 transition-colors group-focus-within:text-zinc-700" />
                <input name="senha" type="password" autoComplete="current-password" required className={`${estiloEntrada} h-10 pl-9`} placeholder="••••••••" />
              </span>
            </label>

            <AnimatePresence initial={false}>
              {estado.erro && (
                <motion.div
                  key={estado.erro}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto", x: reduzido ? 0 : [0, -4, 4, -2, 2, 0] }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <Aviso>{estado.erro}</Aviso>
                </motion.div>
              )}
            </AnimatePresence>

            <Botao type="submit" disabled={enviando} className="group h-10 w-full">
              {enviando ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Entrando...
                </>
              ) : (
                <>
                  Entrar <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Botao>
          </div>
        </form>

        <p className="mt-6 text-center text-[12px] text-zinc-400">Acesso restrito à equipe da pizzaria.</p>
      </div>
    </main>
  );
}
