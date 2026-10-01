import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type Db = SupabaseClient<Database>;

/**
 * Client com service_role (ignora RLS). Uso exclusivo server-side: bot e
 * server actions do painel. Nunca expor ao browser nem ao print-agent.
 */
export function criarClienteServico(url: string, chaveServico: string): Db {
  return createClient<Database>(url, chaveServico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client com anon key: respeita RLS (leitura pública do cardápio). */
export function criarClienteAnon(url: string, chaveAnon: string): Db {
  return createClient<Database>(url, chaveAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class ErroBanco extends Error {
  constructor(
    message: string,
    readonly codigo?: string
  ) {
    super(message);
    this.name = "ErroBanco";
  }
}

/** Lança o erro do Supabase, se houver, e devolve os dados não nulos. */
export function exigir<T>(
  resultado: { data: T | null; error: { message: string; code?: string } | null },
  contexto: string
): T {
  if (resultado.error) {
    throw new ErroBanco(`${contexto}: ${resultado.error.message}`, resultado.error.code);
  }
  if (resultado.data === null) {
    throw new ErroBanco(`${contexto}: nenhum dado retornado`);
  }
  return resultado.data;
}
