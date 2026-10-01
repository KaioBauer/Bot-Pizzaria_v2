import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@pizzaria/db";
import { cookies } from "next/headers";

/**
 * Client com a sessão do usuário logado (cookies) e anon key: tudo passa pelo
 * RLS. É o client padrão do painel; a service_role fica restrita a
 * `lib/db.ts` para casos que exigem ignorar o RLS.
 */
export async function criarClienteSessao() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (lista) => {
          try {
            for (const { name, value, options } of lista) cookieStore.set(name, value, options);
          } catch {
            // Chamado de um Server Component: cookies são só leitura ali; o
            // proxy renova a sessão.
          }
        },
      },
    }
  );
}
