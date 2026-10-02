import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase (cookies) e manda para o login quem não está
 * logado. A checagem de papel "admin" acontece em `exigirAdmin()`.
 */
export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista, cabecalhos) => {
          for (const { name, value } of lista) request.cookies.set(name, value);
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
          for (const [chave, valor] of Object.entries(cabecalhos ?? {})) resposta.headers.set(chave, valor);
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims);
  const caminho = request.nextUrl.pathname;

  if (!logado && caminho.startsWith("/entrega") && caminho !== "/entrega/login") {
    // Motoboy: depois do login volta para o pedido do QR que ele escaneou.
    const login = new URL("/entrega/login", request.url);
    login.searchParams.set("proximo", caminho);
    return NextResponse.redirect(login);
  }
  if (!logado && caminho.startsWith("/admin") && caminho !== "/admin/login") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return resposta;
}

export const config = {
  matcher: ["/admin/:path*", "/entrega/:path*"],
};
