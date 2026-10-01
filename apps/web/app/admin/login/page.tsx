"use client";

import { Bell, Lock, Mail, Printer, Smartphone } from "lucide-react";
import { useActionState } from "react";
import { Aviso, Botao, estiloEntrada, Logo } from "../../../components/ui";
import { entrarAction, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = { erro: null };

const DESTAQUES = [
  { Icone: Smartphone, texto: "Pedidos do WhatsApp e do Telegram chegando sozinhos" },
  { Icone: Bell, texto: "Quadro ao vivo com alerta sonoro" },
  { Icone: Printer, texto: "Cupom impresso automaticamente na cozinha" },
];

export default function LoginPage() {
  const [estado, entrar, enviando] = useActionState(entrarAction, inicial);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-stone-950 p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-marca-600/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-amber-500/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Logo className="size-11" />
          <span className="font-display text-2xl font-semibold">Vianna Pizzaria</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight">
            Os pedidos da sua pizzaria, <span className="text-marca-400 italic">num só lugar.</span>
          </h1>
          <ul className="mt-10 space-y-4">
            {DESTAQUES.map(({ Icone, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-stone-300">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/10">
                  <Icone className="size-4.5 text-marca-300" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <form action={entrar} className="w-full max-w-sm animate-entrada">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo className="size-10" />
            <span className="font-display text-xl font-semibold">Vianna Pizzaria</span>
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Entrar no painel</h2>
          <p className="mt-1.5 text-stone-500">Use o e-mail e a senha de administrador.</p>

          <div className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">E-mail</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
                <input name="email" type="email" autoComplete="username" required className={`${estiloEntrada} pl-10`} placeholder="voce@viannapizzaria.com.br" />
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">Senha</span>
              <span className="relative block">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
                <input name="senha" type="password" autoComplete="current-password" required className={`${estiloEntrada} pl-10`} placeholder="••••••••" />
              </span>
            </label>

            {estado.erro && <Aviso>{estado.erro}</Aviso>}

            <Botao type="submit" tamanho="lg" disabled={enviando} className="w-full">
              {enviando ? "Entrando..." : "Entrar"}
            </Botao>
          </div>
        </form>
      </section>
    </main>
  );
}
