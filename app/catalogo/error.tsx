"use client";

import Link from "next/link";

/** Erro ao carregar o catálogo: mensagem humana e saída (tentar de novo / voltar ao início). */
export default function CatalogoError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" className="container">
      <h1 className="page-title">Não conseguimos abrir o catálogo agora</h1>
      <p className="muted" style={{ margin: "12px 0 20px" }}>
        Pode ser uma instabilidade rápida. Tente de novo; se continuar, volte daqui a alguns minutos.
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={() => reset()}>Tentar de novo</button>
        <Link className="btn2" href="/">Ir para o início</Link>
      </div>
    </main>
  );
}
