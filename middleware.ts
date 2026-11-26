import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/session-middleware";

// Nota: Next 16 renomeou "middleware" para "proxy" (proxy.ts); o contrato da
// frente A pede middleware.ts, que ainda funciona (obsoleto). Migrar depois com
// `npx @next/codemod@canary middleware-to-proxy .` se o gestor preferir.

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Painel e MFA só existem no computador da gestão (PAINEL_LOCAL=1). No site público: 404.
  const localOnly = ["/painel", "/mfa"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (localOnly && process.env.PAINEL_LOCAL !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { response, user } = await updateSession(request);

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

  const protectedPath = ["/conta", "/agendar", "/painel", "/mfa", "/assinar/concluir"].some(
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
    "/mfa/:path*",
    // qualquer outra rota, só quando o Mercado Pago devolve ?preapproval_id=
    { source: "/((?!_next/|api/|.*\\..*).*)", has: [{ type: "query", key: "preapproval_id" }] },
  ],
};
