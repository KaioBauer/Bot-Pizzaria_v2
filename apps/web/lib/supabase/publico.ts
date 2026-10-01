import "server-only";
import { criarClienteAnon } from "@pizzaria/db";

/** Client anônimo (RLS público): cardápio ativo, horários, bairros. */
export function clientePublico() {
  return criarClienteAnon(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
