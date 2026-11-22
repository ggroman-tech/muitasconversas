import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/session-middleware";

// Nota: Next 16 renomeou "middleware" para "proxy" (proxy.ts); o contrato da
// frente A pede middleware.ts, que ainda funciona (obsoleto). Migrar depois com
// `npx @next/codemod@canary middleware-to-proxy .` se o gestor preferir.

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const protectedPath = ["/conta", "/agendar", "/painel"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!user && protectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    url.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(url);
    // preserva cookies que o Supabase possa ter limpado/renovado
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/conta/:path*", "/agendar/:path*", "/assinar/:path*", "/entrar", "/painel/:path*"],
};
