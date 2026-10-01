import "server-only";
import { criarClienteAnon, criarClienteServico, type Db } from "@pizzaria/db";

let servico: Db | undefined;

/** service_role: só em server components/actions, depois de requireAdminSession. */
export function createServiceClient(): Db {
  servico ??= criarClienteServico(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return servico;
}

/** anon: respeita RLS (leitura pública do cardápio). */
export function createAnonClient(): Db {
  return criarClienteAnon(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
