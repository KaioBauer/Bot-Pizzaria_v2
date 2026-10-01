"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@pizzaria/db";

let cliente: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Client do navegador (sessão nos cookies, RLS). Usado pelo Realtime do painel. */
export function clienteNavegador() {
  cliente ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return cliente;
}
