import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="site-logo">Muitas Conversas</Link>
      <nav className="site-nav" aria-label="Principal">
        <Link className="nv" href="/catalogo">Catálogo</Link>
        <Link className="nv" href="/encontros">Encontros</Link>
        <Link className="nv" href="/conta">Minha conta</Link>
        <Link className="btn" href="/assinar">Assinar</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>Muitas Conversas · Entregas aos sábados na Zona Sul do Rio de Janeiro</span>
        <span className="row" style={{ gap: 20 }}>
          <Link href="/regras">Regras e mapa do site</Link>
          <Link href="/catalogo">Catálogo</Link>
        </span>
      </div>
    </footer>
  );
}
