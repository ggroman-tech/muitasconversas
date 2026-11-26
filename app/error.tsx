"use client";

import Link from "next/link";

/** Falha inesperada em qualquer página: mensagem em português e caminhos de saída. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" className="container">
      <h1 className="page-title">Algo deu errado</h1>
      <p className="muted" style={{ margin: "12px 0 20px", maxWidth: 560 }}>
        Não conseguimos abrir esta página agora. Nada foi alterado na sua conta. Tente de novo; se continuar, volte daqui a alguns minutos.
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={() => reset()}>Tentar de novo</button>
        <Link className="btn2" href="/catalogo">Ver o catálogo</Link>
        <Link className="btn2" href="/conta">Minha conta</Link>
      </div>
    </main>
  );
}
