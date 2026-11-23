import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/session-middleware";

// Nota: Next 16 renomeou "middleware" para "proxy" (proxy.ts); o contrato da
// frente A pede middleware.ts, que ainda funciona (obsoleto). Migrar depois com
// `npx @next/codemod@canary middleware-to-proxy .` se o gestor preferir.

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // Retorno do Mercado Pago em QUALQUER rota (?preapproval_id=...): leva para a página oficial de retorno,
  // preservando o parâmetro (se não houver login, o /entrar devolve para cá depois).
  const mpId = request.nextUrl.searchParams.get("preapproval_id");
  if (mpId && /^[A-Za-z0-9_-]{8,64}$/.test(mpId) && pathname !== "/assinar/concluir") {
    const url = request.nextUrl.clone();
    url.pathname = "/assinar/concluir";
    url.search = "";
    url.searchParams.set("preapproval_id", mpId);
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  const protectedPath = ["/conta", "/agendar", "/painel", "/assinar/concluir"].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
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
  matcher: [
    "/conta/:path*",
    "/agendar/:path*",
    "/assinar/:path*",
    "/entrar",
    "/painel/:path*",
    // qualquer outra rota, só quando o Mercado Pago devolve ?preapproval_id=
    { source: "/((?!_next/|api/|.*\\..*).*)", has: [{ type: "query", key: "preapproval_id" }] },
  ],
};
