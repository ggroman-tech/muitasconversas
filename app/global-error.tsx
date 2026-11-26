"use client";

/** Última rede de proteção (falha no próprio layout). Precisa trazer <html> e <body>; sem depender de CSS do site. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "48px 24px", color: "#14231f", background: "#f4f6f3" }}>
        <main style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28 }}>Algo deu errado</h1>
          <p style={{ lineHeight: 1.5 }}>
            O site teve um problema inesperado. Nada foi alterado na sua conta. Tente de novo; se continuar, volte daqui a alguns minutos.
          </p>
          <p>
            <button type="button" onClick={() => reset()} style={{ minHeight: 44, padding: "0 20px", fontSize: 16, borderRadius: 8, border: 0, background: "#1f6f5c", color: "#fff", cursor: "pointer" }}>
              Tentar de novo
            </button>{" "}
            {/* global-error substitui o layout raiz: <a> comum é intencional (recarrega tudo) */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ display: "inline-block", minHeight: 44, lineHeight: "44px", padding: "0 12px", color: "#1f6f5c" }}>Ir para o início</a>
          </p>
        </main>
      </body>
    </html>
  );
}
