import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";

/**
 * Botão do cabeçalho conforme quem está olhando:
 *  - visitante: "Assinar";
 *  - assinante ativo: nenhum botão (o menu já tem "Minha conta");
 *  - logado sem assinatura ativa: "Concluir assinatura" (leva a pagar/verificar).
 * Em Suspense: enquanto carrega, mostra "Assinar" (igual ao visitante), sem travar a página.
 */
async function HeaderAction() {
  const user = await getAuthUser();
  if (!user) return <Link className="btn" href="/assinar">Assinar</Link>;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("my_account").select("subscription_status").maybeSingle();
  const status = data?.subscription_status ?? null;
  if (status === "active") return null;
  if (!data) return <Link className="btn" href="/assinar">Assinar</Link>;
  return <Link className="btn" href="/assinar/concluir">Concluir assinatura</Link>;
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="site-logo">Muitas Conversas</Link>
      <nav className="site-nav" aria-label="Principal">
        <Link className="nv" href="/catalogo">Catálogo</Link>
        <Link className="nv" href="/encontros">Encontros</Link>
        <Link className="nv" href="/conta">Minha conta</Link>
        <Suspense fallback={<Link className="btn" href="/assinar">Assinar</Link>}>
          <HeaderAction />
        </Suspense>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>Muitas Conversas · Entregas aos sábados na Zona Sul do Rio de Janeiro</span>
        <span className="row" style={{ gap: 8 }}>
          <Link className="foot-link" href="/regras">Regras e mapa do site</Link>
          <Link className="foot-link" href="/catalogo">Catálogo</Link>
        </span>
      </div>
    </footer>
  );
}
